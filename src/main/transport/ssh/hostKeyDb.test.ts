/**
 * hostKeyDb — TOFU 저장소 + DC-4 verifyHostKey 판정.
 * Plan §S2.1 DoD 단위 테스트.
 *
 * electron-store 를 mock — 실 파일 I/O 없이 schema 호환 Map 기반.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { HostKeyInfo } from './types'

// electron-store 모킹 — getStore() 가 in-memory mock 을 반환하도록.
const mockStore = {
  data: new Map<string, unknown>([['sshKnownHosts', {}]]),
  get(key: string) { return this.data.get(key) },
  set(key: string, value: unknown) { this.data.set(key, value) },
}

vi.mock('../../services/store', () => ({
  getStore: async () => mockStore,
}))

// 모킹이 등록된 뒤 import — hoisting 주의.
import { getHostKey, setHostKey, removeHostKey, verifyHostKey } from './hostKeyDb'

const WS_ID = 'ssh:9054d316ecba451a'
const INFO: HostKeyInfo = {
  host: 'example.com',
  port: 22,
  algorithm: 'ssh-ed25519',
  sha256: 'dHg7abCkxV3gQ',
}

beforeEach(() => {
  mockStore.data.set('sshKnownHosts', {})
})

describe('hostKeyDb — set/get/remove', () => {
  it('setHostKey 후 getHostKey 로 조회 가능', async () => {
    const entry = await setHostKey(WS_ID, INFO)
    expect(entry.sha256).toBe('dHg7abCkxV3gQ')
    expect(entry.algorithm).toBe('ssh-ed25519')
    expect(typeof entry.firstSeenAt).toBe('number')

    const got = await getHostKey(WS_ID)
    expect(got?.sha256).toBe('dHg7abCkxV3gQ')
  })

  it('removeHostKey 후 getHostKey → undefined', async () => {
    await setHostKey(WS_ID, INFO)
    await removeHostKey(WS_ID)
    expect(await getHostKey(WS_ID)).toBeUndefined()
  })

  it('removeHostKey 미존재 workspaceId → no-op', async () => {
    await expect(removeHostKey('ssh:unknown')).resolves.toBeUndefined()
  })
})

describe('verifyHostKey — DC-4 bypass 0', () => {
  it('저장 전 → unknown (TOFU 프롬프트 필요)', async () => {
    expect(await verifyHostKey(WS_ID, INFO)).toBe('unknown')
  })

  it('같은 sha256 + 같은 algorithm → match', async () => {
    await setHostKey(WS_ID, INFO)
    expect(await verifyHostKey(WS_ID, INFO)).toBe('match')
  })

  it('다른 sha256 → mismatch (키 변경 감지, bypass 금지)', async () => {
    await setHostKey(WS_ID, INFO)
    expect(
      await verifyHostKey(WS_ID, { ...INFO, sha256: 'DIFFERENT_HASH' }),
    ).toBe('mismatch')
  })

  it('algorithm 변경 → mismatch (단, 저장된 algorithm 이 unknown 이면 허용)', async () => {
    await setHostKey(WS_ID, INFO)
    expect(
      await verifyHostKey(WS_ID, { ...INFO, algorithm: 'ssh-rsa' }),
    ).toBe('mismatch')
  })

  it('저장된 algorithm==="unknown" + 새 algorithm 있음 → match (handshake 사후 업데이트 유예)', async () => {
    // S1 m-3: hostVerifier 는 algorithm='unknown' 으로 먼저 저장될 수 있음.
    // 재연결 시 handshake 결과 algorithm 이 달라져도 첫 저장 본은 unknown 이었기에 허용.
    await setHostKey(WS_ID, { ...INFO, algorithm: 'unknown' })
    expect(
      await verifyHostKey(WS_ID, { ...INFO, algorithm: 'ssh-ed25519' }),
    ).toBe('match')
  })

  it('저장된 algorithm==="unknown" + 다른 sha256 → mismatch (sha256 이 주 방어선)', async () => {
    // S2 Evaluator m-2: algorithm unknown 예외가 sha256 불일치까지 허용하지 않음.
    await setHostKey(WS_ID, { ...INFO, algorithm: 'unknown' })
    expect(
      await verifyHostKey(WS_ID, { ...INFO, sha256: 'ATTACKER_HASH' }),
    ).toBe('mismatch')
  })

  it('재연결: 저장된 algorithm 구체 + 새 algorithm==="unknown" → match (Follow-up 버그리포트 2026-04-21)', async () => {
    // 사용자 재현: 최초 TOFU 시 handshake 이후 저장본 algorithm='ssh-ed25519'.
    // 재연결 시 ssh2 hostVerifier 가 handshake 이전 호출이라 info.algorithm='unknown' 으로 도달 →
    // 과거 로직은 entry !== info 비교에서 mismatch 로 오판했다. 이 케이스는 sha256 동일하면 match.
    await setHostKey(WS_ID, { ...INFO, algorithm: 'ssh-ed25519' })
    expect(
      await verifyHostKey(WS_ID, { ...INFO, algorithm: 'unknown' }),
    ).toBe('match')
  })

  it('재연결: 저장/수신 모두 algorithm==="unknown" → match (대칭 케이스)', async () => {
    await setHostKey(WS_ID, { ...INFO, algorithm: 'unknown' })
    expect(
      await verifyHostKey(WS_ID, { ...INFO, algorithm: 'unknown' }),
    ).toBe('match')
  })

  it('재연결: 수신 algorithm="unknown" + 다른 sha256 → mismatch (algorithm 예외가 sha256 불일치 허용 안 함)', async () => {
    // 대칭 방어선: info.algorithm="unknown" 허용은 algorithm 비교만. sha256 주 방어선 유지.
    await setHostKey(WS_ID, { ...INFO, algorithm: 'ssh-ed25519' })
    expect(
      await verifyHostKey(WS_ID, { sha256: 'ATTACKER_HASH', algorithm: 'unknown' }),
    ).toBe('mismatch')
  })
})
