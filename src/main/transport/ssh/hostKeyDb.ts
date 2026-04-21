// SSH TOFU host key DB — Plan §S2.1.
//
// 책임:
//   - workspaceId 기준 저장/조회/삭제
//   - verifyHostKey: 'match' / 'mismatch' / 'unknown' 3분류
//   - DC-4 bypass 0: mismatch 반환 시 호출자가 연결 중단. "Remove & re-trust" 만 허용.
//
// ~/.ssh/known_hosts 는 v1.1 참조 전용 (Plan Design §4.2). v1.0 은 electron-store 독립 저장.

import { getStore } from '../../services/store'
import type { SshKnownHostEntry } from '../../services/store'
import type { HostKeyInfo } from './types'

export type VerifyResult = 'match' | 'mismatch' | 'unknown'

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
  const entry: SshKnownHostEntry = {
    sha256: info.sha256,
    algorithm: info.algorithm,
    firstSeenAt: Date.now(),
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
 * algorithm 이 변경된 경우도 mismatch 로 취급 (정책적으로 보수적).
 */
export async function verifyHostKey(
  workspaceId: string,
  info: Pick<HostKeyInfo, 'sha256' | 'algorithm'>,
): Promise<VerifyResult> {
  const entry = await getHostKey(workspaceId)
  if (!entry) return 'unknown'
  if (entry.sha256 !== info.sha256) return 'mismatch'
  // algorithm 변경은 드물지만 호스트키 교체 징후 — 사용자 재확인 필요.
  if (entry.algorithm !== info.algorithm && entry.algorithm !== 'unknown') return 'mismatch'
  return 'match'
}
