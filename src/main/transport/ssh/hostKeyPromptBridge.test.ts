/**
 * hostKeyPromptBridge — nonce 라우팅 + 20s 타임아웃 + DC-4 bypass 0 실증.
 * Plan §S2.1 Critic M-3 요구 사항 반영.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { HostKeyInfo } from './types'

// hostKeyDb 모킹 — 실제 electron-store 경로 회피. 기본 verifyHostKey='unknown' 반환.
vi.mock('./hostKeyDb', () => {
  return {
    verifyHostKey: vi.fn(async () => 'unknown' as const),
    getHostKey: vi.fn(async () => undefined),
    setHostKey: vi.fn(async () => undefined),
    removeHostKey: vi.fn(async () => undefined),
  }
})

import * as bridge from './hostKeyPromptBridge'
import * as db from './hostKeyDb'

const INFO: HostKeyInfo = {
  host: 'example.com',
  port: 22,
  algorithm: 'ssh-ed25519',
  sha256: 'dHg7abCkxV3gQ',
  md5: 'aa:bb:cc',
}

// WebContents 모킹 — send 호출 포착 + isDestroyed false.
function makeWc() {
  const sends: Array<{ channel: string; data: unknown }> = []
  return {
    sends,
    wc: {
      isDestroyed: () => false,
      send: (channel: string, data: unknown) => {
        sends.push({ channel, data })
      },
    } as unknown as Electron.WebContents,
  }
}

beforeEach(() => {
  bridge.clearAllPendingHostKeyPrompts()
  bridge.setActiveWebContents(null)
  vi.mocked(db.verifyHostKey).mockClear().mockResolvedValue('unknown')
  vi.mocked(db.getHostKey).mockClear().mockResolvedValue(undefined)
})

afterEach(() => {
  bridge.clearAllPendingHostKeyPrompts()
})

describe('requestHostKeyTrust — DC-4 bypass 0 경로', () => {
  it('webContents 가 null → 자동 reject (false)', async () => {
    const trusted = await bridge.requestHostKeyTrust('ssh:ws1', INFO)
    expect(trusted).toBe(false)
  })

  it('verifyHostKey===match → prompt 없이 즉시 trust', async () => {
    vi.mocked(db.verifyHostKey).mockResolvedValueOnce('match')
    const { wc, sends } = makeWc()
    bridge.setActiveWebContents(wc)
    const trusted = await bridge.requestHostKeyTrust('ssh:ws1', INFO)
    expect(trusted).toBe(true)
    expect(sends).toHaveLength(0) // prompt 미전송
  })

  it('verifyHostKey===unknown → TOFU prompt payload 전송', async () => {
    const { wc, sends } = makeWc()
    bridge.setActiveWebContents(wc)
    // Promise 를 대기 안 함 — prompt 전송만 확인 (타임아웃 기다리지 않음).
    bridge.requestHostKeyTrust('ssh:ws1', INFO, 100).catch(() => undefined)
    await Promise.resolve() // send 는 동기. 이벤트 루프 tick 1 대기.
    expect(sends).toHaveLength(1)
    const payload = sends[0].data as Record<string, unknown>
    expect(payload.kind).toBe('trust-new')
    expect(payload.sha256).toBe('dHg7abCkxV3gQ')
    expect(payload.host).toBe('example.com')
    expect(typeof payload.nonce).toBe('string')
  })

  it('verifyHostKey===mismatch → expectedSha256 포함 payload', async () => {
    vi.mocked(db.verifyHostKey).mockResolvedValueOnce('mismatch')
    vi.mocked(db.getHostKey).mockResolvedValueOnce({
      sha256: 'OLD_FINGERPRINT',
      algorithm: 'ssh-ed25519',
      firstSeenAt: 100,
    })
    const { wc, sends } = makeWc()
    bridge.setActiveWebContents(wc)
    bridge.requestHostKeyTrust('ssh:ws1', INFO, 100).catch(() => undefined)
    await new Promise((r) => setTimeout(r, 10)) // 내부 async 대기
    expect(sends).toHaveLength(1)
    const payload = sends[0].data as Record<string, unknown>
    expect(payload.kind).toBe('mismatch')
    expect(payload.expectedSha256).toBe('OLD_FINGERPRINT')
  })
})

describe('nonce 라우팅 + 타임아웃 (Critic M-3)', () => {
  it('20s 타임아웃 기본 (overridable) — 응답 없으면 false resolve', async () => {
    const { wc } = makeWc()
    bridge.setActiveWebContents(wc)
    const start = Date.now()
    const trusted = await bridge.requestHostKeyTrust('ssh:ws1', INFO, 50) // 50ms 타임아웃
    const elapsed = Date.now() - start
    expect(trusted).toBe(false)
    expect(elapsed).toBeGreaterThanOrEqual(45)
    expect(elapsed).toBeLessThan(200)
  })

  it('resolveHostKeyPrompt(nonce, true) → 해당 Promise trust=true', async () => {
    const { wc, sends } = makeWc()
    bridge.setActiveWebContents(wc)
    const promise = bridge.requestHostKeyTrust('ssh:ws1', INFO, 5000)
    await new Promise((r) => setTimeout(r, 10))
    const nonce = (sends[0].data as { nonce: string }).nonce
    bridge.resolveHostKeyPrompt(nonce, true)
    expect(await promise).toBe(true)
  })

  it('다중 동시 prompt — 각자 nonce 로 독립 라우팅', async () => {
    const { wc, sends } = makeWc()
    bridge.setActiveWebContents(wc)
    const p1 = bridge.requestHostKeyTrust('ssh:ws1', INFO, 5000)
    const p2 = bridge.requestHostKeyTrust('ssh:ws2', INFO, 5000)
    await new Promise((r) => setTimeout(r, 10))
    expect(sends).toHaveLength(2)
    const n1 = (sends[0].data as { nonce: string }).nonce
    const n2 = (sends[1].data as { nonce: string }).nonce
    expect(n1).not.toBe(n2)
    // 교차 응답 — p2 먼저 reject, p1 나중 trust.
    bridge.resolveHostKeyPrompt(n2, false)
    bridge.resolveHostKeyPrompt(n1, true)
    expect(await p1).toBe(true)
    expect(await p2).toBe(false)
    expect(bridge.getPendingCount()).toBe(0)
  })

  it('알 수 없는 nonce 응답 → silent drop (no throw)', () => {
    expect(() =>
      bridge.resolveHostKeyPrompt('00000000-0000-0000-0000-000000000000', true),
    ).not.toThrow()
  })
})

describe('clearAllPendingHostKeyPrompts', () => {
  it('dispose 시 대기 중 Promise 전부 false 로 resolve', async () => {
    const { wc } = makeWc()
    bridge.setActiveWebContents(wc)
    const p1 = bridge.requestHostKeyTrust('ssh:ws1', INFO, 60_000)
    const p2 = bridge.requestHostKeyTrust('ssh:ws2', INFO, 60_000)
    await new Promise((r) => setTimeout(r, 10))
    expect(bridge.getPendingCount()).toBe(2)
    bridge.clearAllPendingHostKeyPrompts()
    expect(await p1).toBe(false)
    expect(await p2).toBe(false)
    expect(bridge.getPendingCount()).toBe(0)
  })
})
