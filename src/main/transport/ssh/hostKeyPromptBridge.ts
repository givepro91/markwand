// main ↔ renderer hostKey prompt bridge — Plan §S2.1 (DC-4 Critic M-3).
//
// 책임:
//   - SshClient.hostVerifier 콜백이 호출되면 renderer 에 'ssh:host-key-prompt' 이벤트 전송
//   - renderer 가 모달에서 사용자 응답을 받으면 'ssh:respond-host-key' IPC 로 nonce+trust 전달
//   - 이 브리지가 nonce 를 키로 pending Promise 맵을 관리 → hostVerifier 콜백에 reject/resolve
//
// DC-4 bypass 0 보장 경로:
//   1) 20s 타임아웃 → 자동 reject (hostVerifier verify(false))
//   2) 다중 동시 hostVerifier 호출 → nonce 로 독립 라우팅
//   3) renderer 연결 부재(isDestroyed) → 자동 reject

import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type { HostKeyInfo } from './types'
import type { HostKeyPromptPayload } from '../../../preload/types'
import { verifyHostKey, trustSessionOnly, type VerifyResult } from './hostKeyDb'

const DEFAULT_PROMPT_TIMEOUT_MS = 20_000

interface Pending {
  resolve: (trust: boolean) => void
  timer: ReturnType<typeof setTimeout>
  /** 세션 신뢰 처리를 위한 호스트 정보 */
  info: Pick<HostKeyInfo, 'host' | 'port' | 'sha256' | 'algorithm'>
}

const pending = new Map<string, Pending>()

/**
 * 현재 활성 BrowserWindow 의 WebContents. index.ts 가 주입.
 * null 이면 renderer 가 없으므로 모든 prompt 는 자동 reject.
 */
let activeWebContents: WebContents | null = null

export function setActiveWebContents(wc: WebContents | null): void {
  activeWebContents = wc
}

/**
 * Renderer 에 hostKey 확인 요청을 보내고 사용자 응답 또는 타임아웃 대기.
 *
 * @param workspaceId 워크스페이스 id (store 조회용)
 * @param info hostVerifier 가 구성한 fingerprint 정보
 * @param timeoutMs 타임아웃 (기본 20s)
 * @returns true=신뢰, false=거부
 */
export async function requestHostKeyTrust(
  workspaceId: string,
  info: HostKeyInfo,
  timeoutMs: number = DEFAULT_PROMPT_TIMEOUT_MS,
): Promise<boolean> {
  // 사전 저장 fingerprint 와 비교 — match/mismatch/unknown 판정.
  const verdict: VerifyResult = await verifyHostKey(workspaceId, info)
  if (verdict === 'match') {
    // 저장된 fingerprint 일치 — TOFU prompt 생략, 즉시 trust.
    return true
  }

  // renderer 없으면 자동 reject (DC-4).
  if (!activeWebContents || activeWebContents.isDestroyed()) return false

  const nonce = randomUUID()
  const payload: HostKeyPromptPayload = {
    nonce,
    host: info.host,
    port: info.port,
    algorithm: info.algorithm,
    sha256: info.sha256,
    ...(info.md5 && { md5: info.md5 }),
    kind: verdict === 'mismatch' ? 'mismatch' : 'trust-new',
    workspaceId,
  }
  // mismatch 시 저장된 기존 fingerprint 도 함께 노출 — UI "Expected vs Received" 경고.
  if (verdict === 'mismatch') {
    const existing = await import('./hostKeyDb').then((m) => m.getHostKey(workspaceId))
    if (existing) payload.expectedSha256 = existing.sha256
  }

  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      const entry = pending.get(nonce)
      if (entry) {
        pending.delete(nonce)
        entry.resolve(false) // 타임아웃 → reject (DC-4)
      }
    }, timeoutMs)
    pending.set(nonce, { resolve, timer, info })

    try {
      activeWebContents?.send('ssh:host-key-prompt', payload)
    } catch {
      // send 실패 즉시 cleanup + reject
      pending.delete(nonce)
      clearTimeout(timer)
      resolve(false)
    }
  })
}

/**
 * Renderer 가 'ssh:respond-host-key' IPC 로 응답하면 호출.
 * nonce 로 pending Promise 찾아 resolve. nonce 없으면 silent drop (지연 도착·중복 응답).
 * persistence='session' 이면 세션-only 신뢰로 등록 (영구 저장 없음).
 */
export function resolveHostKeyPrompt(nonce: string, trust: boolean, persistence?: 'session' | 'permanent'): void {
  const entry = pending.get(nonce)
  if (!entry) return
  pending.delete(nonce)
  clearTimeout(entry.timer)
  // 세션-only 신뢰: trustSessionOnly 등록. 영구 신뢰는 requestHostKeyTrust 호출부(index.ts)에서 setHostKey.
  if (trust && persistence === 'session') {
    trustSessionOnly(entry.info as Pick<HostKeyInfo, 'host' | 'port' | 'sha256' | 'algorithm'>)
  }
  entry.resolve(trust === true)
}

/**
 * 테스트·dispose 전용 — pending 모두 false 로 정리.
 */
export function clearAllPendingHostKeyPrompts(): void {
  for (const [nonce, entry] of pending) {
    clearTimeout(entry.timer)
    entry.resolve(false)
    pending.delete(nonce)
  }
}

export function getPendingCount(): number {
  return pending.size
}
