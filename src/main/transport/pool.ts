// Transport pool — Plan §S3.3 (DC-2 hybrid 동시성).
//
// 정책:
//   - 로컬 transport 는 싱글톤 `localTransport` (기존 유지).
//   - SSH transport 는 최대 **active 1 + warm 1** (2개). 새 SSH 로 전환 시 기존 warm 을
//     await dispose() 후 evict. active 교체 시 기존 active 를 warm 으로 강등.
//   - warm 상태 transport 가 'offline' 전이하면 pool 이 즉시 evict + dispose.
//   - idle timeout 30분 — warm slot 의 lastAccess 갱신 후 경과 시 자동 evict (S3 범위, 설정은 S2 이후).
//
// 외부 API:
//   - getTransport(workspaceId, connect): 워크스페이스의 transport 반환 (미연결 시 connect 호출)
//   - activate(workspaceId): active 전환 (warm → active 승격 또는 새 connect)
//   - dispose(workspaceId): 명시적 해제 (매칭되는 local 싱글톤은 dispose 하지 않음)
//   - disposeAll(): 앱 종료 시 모든 SSH transport 정리
//
// Critic (S0 Evaluator M-1) 반영:
//   - warm eviction 시 await dispose
//   - offline 전이 시 자동 evict
//   - dispose 완료 실패 시 에러 전파 (silent drop 금지)

import type { Transport } from './types'
import { localTransport } from './local'

const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30min

interface PoolEntry {
  workspaceId: string
  transport: Transport
  lastAccess: number
  idleTimer?: ReturnType<typeof setTimeout>
}

let activeEntry: PoolEntry | null = null
let warmEntry: PoolEntry | null = null

/**
 * 워크스페이스 ID 로 transport 조회. 로컬 ('local' 프리픽스가 아닌 UUID) 은 싱글톤 반환.
 * SSH (id 'ssh:…') 인데 pool 에 없으면 connect 콜백으로 생성.
 */
export async function getTransport(
  workspaceId: string,
  connect: () => Promise<Transport>,
): Promise<Transport> {
  if (!workspaceId.startsWith('ssh:')) {
    // 로컬 워크스페이스 — 단일 localTransport.
    return localTransport
  }
  // active 먼저
  if (activeEntry && activeEntry.workspaceId === workspaceId) {
    touch(activeEntry)
    return activeEntry.transport
  }
  if (warmEntry && warmEntry.workspaceId === workspaceId) {
    // warm → active 승격 (기존 active 가 있으면 warm 으로 강등, 없으면 그냥 이동)
    return promoteWarmToActive()
  }
  // 둘 다 미연결 → 새로 connect + active 로
  const transport = await connect()
  await setActive(workspaceId, transport)
  return transport
}

/**
 * 명시적 active 전환 — 이미 pool 에 있는 workspaceId 를 active 로.
 * 없으면 에러 (호출자가 getTransport 로 먼저 연결).
 */
export async function activate(workspaceId: string): Promise<void> {
  if (activeEntry?.workspaceId === workspaceId) {
    touch(activeEntry)
    return
  }
  if (warmEntry?.workspaceId === workspaceId) {
    await promoteWarmToActive()
    return
  }
  throw new Error(`TRANSPORT_NOT_IN_POOL: ${workspaceId}`)
}

/**
 * 명시적 dispose — workspaceId 에 해당하는 SSH transport 정리.
 * 로컬은 싱글톤이라 dispose 무시.
 */
export async function dispose(workspaceId: string): Promise<void> {
  if (!workspaceId.startsWith('ssh:')) return
  if (activeEntry?.workspaceId === workspaceId) {
    const entry = activeEntry
    activeEntry = null
    await evict(entry)
  } else if (warmEntry?.workspaceId === workspaceId) {
    const entry = warmEntry
    warmEntry = null
    await evict(entry)
  }
}

/**
 * 앱 종료 시 모든 SSH transport 정리.
 */
export async function disposeAll(): Promise<void> {
  const tasks: Promise<void>[] = []
  if (activeEntry) {
    const e = activeEntry
    activeEntry = null
    tasks.push(evict(e))
  }
  if (warmEntry) {
    const e = warmEntry
    warmEntry = null
    tasks.push(evict(e))
  }
  await Promise.all(tasks)
}

/**
 * offline 전이 감지 훅 — useTransportStatus 나 SshPoller 가 호출.
 * workspaceId 에 해당하는 entry 를 즉시 evict.
 */
export async function onTransportOffline(workspaceId: string): Promise<void> {
  await dispose(workspaceId)
}

/** 테스트·디버깅용 — pool 상태 스냅샷 */
export function snapshot(): {
  active: string | null
  warm: string | null
} {
  return {
    active: activeEntry?.workspaceId ?? null,
    warm: warmEntry?.workspaceId ?? null,
  }
}

// ── 내부 ────────────────────────────────────────────────

async function setActive(workspaceId: string, transport: Transport): Promise<void> {
  // 기존 active 는 warm 으로 강등 (이미 warm 이 있으면 evict).
  if (activeEntry) {
    const demoted = activeEntry
    activeEntry = null
    if (warmEntry) {
      const toEvict = warmEntry
      warmEntry = null
      await evict(toEvict)
    }
    warmEntry = demoted
    scheduleIdleTimer(warmEntry)
  }
  const entry: PoolEntry = { workspaceId, transport, lastAccess: Date.now() }
  activeEntry = entry
  clearIdleTimer(entry) // active 는 idle timer 없음
}

async function promoteWarmToActive(): Promise<Transport> {
  const w = warmEntry!
  warmEntry = null
  clearIdleTimer(w)
  // 기존 active → warm 강등
  if (activeEntry) {
    const demoted = activeEntry
    activeEntry = null
    warmEntry = demoted
    scheduleIdleTimer(demoted)
  }
  activeEntry = w
  touch(w)
  return w.transport
}

function touch(entry: PoolEntry): void {
  entry.lastAccess = Date.now()
  clearIdleTimer(entry)
  if (entry === warmEntry) scheduleIdleTimer(entry)
}

function scheduleIdleTimer(entry: PoolEntry): void {
  clearIdleTimer(entry)
  entry.idleTimer = setTimeout(() => {
    if (warmEntry === entry) {
      warmEntry = null
      // 비동기 dispose — 에러는 stderr 로만 로깅.
      evict(entry).catch((err) => {
        process.stderr.write(`[transport-pool] idle evict failed: ${String(err)}\n`)
      })
    }
  }, IDLE_TIMEOUT_MS)
  if (typeof entry.idleTimer.unref === 'function') entry.idleTimer.unref()
}

function clearIdleTimer(entry: PoolEntry): void {
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer)
    entry.idleTimer = undefined
  }
}

async function evict(entry: PoolEntry): Promise<void> {
  clearIdleTimer(entry)
  await entry.transport.dispose()
}
