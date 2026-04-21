/**
 * Transport pool — DC-2 hybrid (active 1 + warm 1) + S0 Evaluator M-1 (eviction + dispose) 검증.
 * Plan §S3.3.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Transport } from './types'

// localTransport 모킹 — 실 fs 의존 회피.
vi.mock('./local', () => ({
  localTransport: {
    id: 'local',
    kind: 'local',
    fs: {},
    scanner: {},
    dispose: vi.fn(),
  },
}))

import {
  getTransport,
  activate,
  dispose,
  disposeAll,
  onTransportOffline,
  snapshot,
} from './pool'

function fakeTransport(id: string): Transport {
  return {
    id,
    kind: 'ssh',
    fs: {} as Transport['fs'],
    scanner: {} as Transport['scanner'],
    dispose: vi.fn(async () => undefined),
  }
}

beforeEach(async () => {
  await disposeAll()
})

describe('getTransport — 로컬 경로', () => {
  it('로컬 워크스페이스 UUID → localTransport 반환 (pool 우회)', async () => {
    const t = await getTransport('550e8400-e29b-41d4-a716-446655440000', async () => {
      throw new Error('should not be called for local')
    })
    expect(t.id).toBe('local')
  })
})

describe('getTransport — SSH', () => {
  it('pool 비어있으면 connect 콜백 호출 → active 로 설정', async () => {
    const t1 = fakeTransport('ssh:aaaaaaaaaaaaaaaa')
    const connectSpy = vi.fn(async () => t1)
    const got = await getTransport('ssh:aaaaaaaaaaaaaaaa', connectSpy)
    expect(got).toBe(t1)
    expect(connectSpy).toHaveBeenCalledTimes(1)
    expect(snapshot()).toEqual({ active: 'ssh:aaaaaaaaaaaaaaaa', warm: null })
  })

  it('이미 active 면 재연결 없이 반환', async () => {
    const t1 = fakeTransport('ssh:aaaaaaaaaaaaaaaa')
    await getTransport('ssh:aaaaaaaaaaaaaaaa', async () => t1)
    const connectSpy = vi.fn(async () => t1)
    const again = await getTransport('ssh:aaaaaaaaaaaaaaaa', connectSpy)
    expect(again).toBe(t1)
    expect(connectSpy).not.toHaveBeenCalled()
  })

  it('두 번째 SSH 요청 → 기존 active → warm 강등, 새 active', async () => {
    const t1 = fakeTransport('ssh:1111111111111111')
    const t2 = fakeTransport('ssh:2222222222222222')
    await getTransport('ssh:1111111111111111', async () => t1)
    await getTransport('ssh:2222222222222222', async () => t2)
    expect(snapshot()).toEqual({
      active: 'ssh:2222222222222222',
      warm: 'ssh:1111111111111111',
    })
    expect(t1.dispose).not.toHaveBeenCalled()
    expect(t2.dispose).not.toHaveBeenCalled()
  })

  it('세 번째 SSH → 기존 warm 을 **await dispose()** 후 evict, 기존 active → warm, 새 active', async () => {
    const t1 = fakeTransport('ssh:1111111111111111')
    const t2 = fakeTransport('ssh:2222222222222222')
    const t3 = fakeTransport('ssh:3333333333333333')
    await getTransport('ssh:1111111111111111', async () => t1)
    await getTransport('ssh:2222222222222222', async () => t2)
    await getTransport('ssh:3333333333333333', async () => t3)
    // t1 이 warm 에서 evict 됐어야 함 (dispose 호출 검증)
    expect(t1.dispose).toHaveBeenCalledTimes(1)
    expect(t2.dispose).not.toHaveBeenCalled()
    expect(t3.dispose).not.toHaveBeenCalled()
    expect(snapshot()).toEqual({
      active: 'ssh:3333333333333333',
      warm: 'ssh:2222222222222222',
    })
  })

  it('warm 에 있던 workspaceId 재요청 → warm → active 승격 (기존 active 는 warm 으로)', async () => {
    const t1 = fakeTransport('ssh:1111111111111111')
    const t2 = fakeTransport('ssh:2222222222222222')
    await getTransport('ssh:1111111111111111', async () => t1)
    await getTransport('ssh:2222222222222222', async () => t2)
    // 현재 active=t2, warm=t1. t1 재요청 → t1 active, t2 warm.
    await getTransport('ssh:1111111111111111', async () => {
      throw new Error('should not reconnect')
    })
    expect(snapshot()).toEqual({
      active: 'ssh:1111111111111111',
      warm: 'ssh:2222222222222222',
    })
  })
})

describe('dispose / onTransportOffline / disposeAll (Critic M-1)', () => {
  it('dispose(workspaceId) — active 인 경우 pool 에서 제거 + dispose 호출', async () => {
    const t1 = fakeTransport('ssh:1111111111111111')
    await getTransport('ssh:1111111111111111', async () => t1)
    await dispose('ssh:1111111111111111')
    expect(t1.dispose).toHaveBeenCalledTimes(1)
    expect(snapshot()).toEqual({ active: null, warm: null })
  })

  it('onTransportOffline(warm workspaceId) → 즉시 evict (S3.3 offline 감지)', async () => {
    const t1 = fakeTransport('ssh:1111111111111111')
    const t2 = fakeTransport('ssh:2222222222222222')
    await getTransport('ssh:1111111111111111', async () => t1)
    await getTransport('ssh:2222222222222222', async () => t2)
    // t1 이 warm. offline 감지 → evict.
    await onTransportOffline('ssh:1111111111111111')
    expect(t1.dispose).toHaveBeenCalledTimes(1)
    expect(snapshot()).toEqual({ active: 'ssh:2222222222222222', warm: null })
  })

  it('disposeAll — 활성·warm 모두 dispose 후 pool 비움', async () => {
    const t1 = fakeTransport('ssh:1111111111111111')
    const t2 = fakeTransport('ssh:2222222222222222')
    await getTransport('ssh:1111111111111111', async () => t1)
    await getTransport('ssh:2222222222222222', async () => t2)
    await disposeAll()
    expect(t1.dispose).toHaveBeenCalled()
    expect(t2.dispose).toHaveBeenCalled()
    expect(snapshot()).toEqual({ active: null, warm: null })
  })

  it('로컬 workspaceId 로 dispose → localTransport.dispose 호출 안 함 (singleton 보호)', async () => {
    await dispose('550e8400-e29b-41d4-a716-446655440000')
    // localTransport 의 dispose 는 호출되지 않아야 함. error 도 나지 않아야 함.
    expect(snapshot()).toEqual({ active: null, warm: null })
  })
})

describe('activate — 명시적 전환', () => {
  it('active 로 이미 있으면 no-op', async () => {
    const t1 = fakeTransport('ssh:1111111111111111')
    await getTransport('ssh:1111111111111111', async () => t1)
    await activate('ssh:1111111111111111')
    expect(snapshot().active).toBe('ssh:1111111111111111')
  })

  it('warm 에 있으면 active 로 승격', async () => {
    const t1 = fakeTransport('ssh:1111111111111111')
    const t2 = fakeTransport('ssh:2222222222222222')
    await getTransport('ssh:1111111111111111', async () => t1)
    await getTransport('ssh:2222222222222222', async () => t2)
    await activate('ssh:1111111111111111')
    expect(snapshot().active).toBe('ssh:1111111111111111')
    expect(snapshot().warm).toBe('ssh:2222222222222222')
  })

  it('pool 에 없으면 TRANSPORT_NOT_IN_POOL throw', async () => {
    await expect(activate('ssh:9999999999999999')).rejects.toThrow('TRANSPORT_NOT_IN_POOL')
  })
})
