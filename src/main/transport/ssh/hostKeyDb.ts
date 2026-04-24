// SSH TOFU host key DB — Plan §S2.1.
//
// 책임:
//   - workspaceId 기준 저장/조회/삭제
//   - verifyHostKey: 'match' / 'mismatch' / 'unknown' 3분류
//   - DC-4 bypass 0: mismatch 반환 시 호출자가 연결 중단. "Remove & re-trust" 만 허용.
//
// ~/.ssh/known_hosts 는 v1.1 참조 전용 (Plan Design §4.2). v1.0 은 electron-store 독립 저장.
//
// S5-3 — 세션-only 신뢰: 메모리 Map (key = `${hostname}:${port}`) 에 저장.
//   같은 호스트:포트 의 여러 workspace 가 공유. 앱 재시작 시 휘발.

import { getStore } from '../../services/store'
import type { SshKnownHostEntry } from '../../services/store'
import type { HostKeyInfo } from './types'

export type VerifyResult = 'match' | 'mismatch' | 'unknown'

// 세션-only 신뢰 맵: key = "host:port", value = sha256
const sessionTrust = new Map<string, string>()

function sessionKey(info: Pick<HostKeyInfo, 'host' | 'port'>): string {
  return `${info.host}:${info.port}`
}

/** 세션-only 신뢰를 등록한다. 앱 재시작 시 휘발. */
export function trustSessionOnly(info: Pick<HostKeyInfo, 'host' | 'port' | 'sha256' | 'algorithm'>): void {
  sessionTrust.set(sessionKey(info), info.sha256)
}

/** 테스트 전용 — 세션 신뢰 초기화 */
export function clearSessionTrust(): void {
  sessionTrust.clear()
}

export async function getHostKey(workspaceId: string): Promise<SshKnownHostEntry | undefined> {
  const store = await getStore()
  const all = store.get('sshKnownHosts')
  return all[workspaceId]
}

export async function setHostKey(
  workspaceId: string,
  info: HostKeyInfo,
): Promise<SshKnownHostEntry> {
  const store = await getStore()
  const all = { ...store.get('sshKnownHosts') }
  const existing = all[workspaceId]
  // firstSeenAt 은 **최초 trust 시각** 을 보존한다. 재연결 시 같은 sha256 이면 기존 값 유지.
  // sha256 이 변경된 경우(mismatch 후 "Remove & re-trust") 만 새 firstSeenAt 기록.
  const firstSeenAt =
    existing && existing.sha256 === info.sha256 ? existing.firstSeenAt : Date.now()
  const entry: SshKnownHostEntry = {
    sha256: info.sha256,
    algorithm: info.algorithm,
    firstSeenAt,
  }
  all[workspaceId] = entry
  store.set('sshKnownHosts', all)
  return entry
}

export async function removeHostKey(workspaceId: string): Promise<void> {
  const store = await getStore()
  const all = { ...store.get('sshKnownHosts') }
  if (!(workspaceId in all)) return
  delete all[workspaceId]
  store.set('sshKnownHosts', all)
}

/**
 * DC-4 핵심 — 저장된 fingerprint 와 비교.
 * - 저장된 엔트리 없음 → 'unknown' (TOFU 프롬프트 필요)
 * - sha256 일치 → 'match' (자동 trust)
 * - sha256 불일치 → 'mismatch' (bypass 금지, 연결 중단 + re-trust 플로우 진입)
 *
 * algorithm 비교는 양쪽이 모두 구체적일 때만 유효. ssh2 의 hostVerifier 는 handshake 이전에
 * 호출되어 `info.algorithm='unknown'` 인 상태로 도달하므로(Follow-up 버그리포트 2026-04-21),
 * 한쪽이라도 'unknown' 이면 algorithm 비교는 생략한다. sha256 이 주 방어선(Design §4).
 */
export async function verifyHostKey(
  workspaceId: string,
  info: Pick<HostKeyInfo, 'host' | 'port' | 'sha256' | 'algorithm'>,
): Promise<VerifyResult> {
  // 세션-only 신뢰 먼저 확인 (host:port 기준, workspaceId 무관).
  const sk = sessionKey(info)
  if (sessionTrust.has(sk)) {
    return sessionTrust.get(sk) === info.sha256 ? 'match' : 'mismatch'
  }

  const entry = await getHostKey(workspaceId)
  if (!entry) return 'unknown'
  if (entry.sha256 !== info.sha256) return 'mismatch'
  // 양쪽 모두 구체적 알고리즘을 가진 경우에만 비교. 'unknown' 은 hostVerifier 단계의
  // 정상 상태로 허용해 재연결 시 false-mismatch 를 방지.
  if (
    entry.algorithm !== info.algorithm &&
    entry.algorithm !== 'unknown' &&
    info.algorithm !== 'unknown'
  ) return 'mismatch'
  return 'match'
}
