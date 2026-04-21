/**
 * reconnect backoff + runReconnect — 지수 증가, cap, abort, 상태 전이.
 * Plan §S2.4 DoD.
 */
import { describe, it, expect } from 'vitest'
import {
  computeBackoff,
  planReconnectAttempts,
  runReconnect,
  sleepWithSignal,
  DEFAULT_BACKOFF,
  type BackoffConfig,
  type TransportStatus,
} from './reconnect'

const NO_JITTER: BackoffConfig = { base: 100, cap: 500, maxAttempts: 4, maxJitter: 0 }

describe('computeBackoff', () => {
  it('지수 증가 → cap 도달', () => {
    expect(computeBackoff(1, NO_JITTER)).toBe(100)
    expect(computeBackoff(2, NO_JITTER)).toBe(200)
    expect(computeBackoff(3, NO_JITTER)).toBe(400)
    expect(computeBackoff(4, NO_JITTER)).toBe(500) // cap
    expect(computeBackoff(5, NO_JITTER)).toBe(500) // cap 유지
  })

  it('attempt=0 이하 → 0', () => {
    expect(computeBackoff(0, NO_JITTER)).toBe(0)
    expect(computeBackoff(-1, NO_JITTER)).toBe(0)
  })

  it('jitter 활성 시 최대 +maxJitter ms 가산', () => {
    const cfg: BackoffConfig = { ...NO_JITTER, maxJitter: 200 }
    // random 결정론 (0.5 → +100ms)
    expect(computeBackoff(1, cfg, () => 0.5)).toBe(100 + 100)
    expect(computeBackoff(4, cfg, () => 1.0)).toBe(500 + 200)
  })
})

describe('planReconnectAttempts', () => {
  it('첫 attempt 의 delay 는 0 (즉시 시도)', () => {
    const plan = planReconnectAttempts(NO_JITTER, () => 0)
    expect(plan[0]).toEqual({ attempt: 1, delayMs: 0, isLast: false })
  })

  it('마지막 attempt isLast=true', () => {
    const plan = planReconnectAttempts(NO_JITTER, () => 0)
    expect(plan[plan.length - 1].isLast).toBe(true)
    expect(plan).toHaveLength(4)
  })

  it('기본 cfg 는 maxAttempts=6', () => {
    const plan = planReconnectAttempts(DEFAULT_BACKOFF, () => 0)
    expect(plan).toHaveLength(6)
  })
})

describe('runReconnect', () => {
  it('첫 attempt 성공 → onStatus connecting → connected', async () => {
    const events: Array<{ s: TransportStatus; a?: number }> = []
    const ok = await runReconnect({
      connect: async () => undefined,
      cfg: NO_JITTER,
      randomFn: () => 0,
      onStatus: (s, i) => events.push({ s, a: i?.attempt }),
    })
    expect(ok).toBe(true)
    expect(events).toEqual([
      { s: 'connecting', a: 1 },
      { s: 'connected', a: 1 },
    ])
  })

  it('모든 attempt 실패 → offline (maxAttempts=4)', async () => {
    const events: TransportStatus[] = []
    const ok = await runReconnect({
      connect: async () => {
        throw new Error('nope')
      },
      cfg: NO_JITTER,
      randomFn: () => 0,
      onStatus: (s) => events.push(s),
    })
    expect(ok).toBe(false)
    // 4 attempts connecting + 1 offline = 5
    expect(events.filter((s) => s === 'connecting')).toHaveLength(4)
    expect(events[events.length - 1]).toBe('offline')
  })

  it('중간 attempt 성공 → 이후 시도 중단', async () => {
    let count = 0
    const events: TransportStatus[] = []
    const ok = await runReconnect({
      connect: async () => {
        count++
        if (count < 3) throw new Error('retry')
      },
      cfg: NO_JITTER,
      randomFn: () => 0,
      onStatus: (s) => events.push(s),
    })
    expect(ok).toBe(true)
    expect(count).toBe(3)
    expect(events.filter((s) => s === 'connecting')).toHaveLength(3)
    expect(events[events.length - 1]).toBe('connected')
  })

  it('AbortSignal → 대기 중 즉시 AbortError throw', async () => {
    const ac = new AbortController()
    const cfg: BackoffConfig = { base: 1000, cap: 5000, maxAttempts: 3, maxJitter: 0 }
    const promise = runReconnect({
      connect: async () => {
        throw new Error('force retry')
      },
      cfg,
      randomFn: () => 0,
      signal: ac.signal,
    })
    // 첫 attempt 는 delayMs=0 이므로 즉시 connect 호출 → 실패. 두 번째 attempt 대기(1000ms) 중 abort.
    setTimeout(() => ac.abort(), 10)
    await expect(promise).rejects.toThrow('aborted')
  })
})

describe('sleepWithSignal', () => {
  it('정상 sleep 후 resolve', async () => {
    const start = Date.now()
    await sleepWithSignal(20)
    expect(Date.now() - start).toBeGreaterThanOrEqual(15)
  })

  it('signal abort → 즉시 reject AbortError', async () => {
    const ac = new AbortController()
    ac.abort() // 미리 abort
    await expect(sleepWithSignal(1000, ac.signal)).rejects.toThrow('aborted')
  })

  it('진행 중 abort → reject', async () => {
    const ac = new AbortController()
    const p = sleepWithSignal(5000, ac.signal)
    setTimeout(() => ac.abort(), 10)
    await expect(p).rejects.toThrow('aborted')
  })
})

describe('DEFAULT_BACKOFF — Plan §S2.4 명세', () => {
  it('base 1s / cap 60s / maxAttempts 6 / maxJitter 200ms', () => {
    expect(DEFAULT_BACKOFF).toEqual({
      base: 1000,
      cap: 60_000,
      maxAttempts: 6,
      maxJitter: 200,
    })
  })

  it('1..6 시퀀스 (jitter 0): 1s·2s·4s·8s·16s·32s', () => {
    const withoutJitter = { ...DEFAULT_BACKOFF, maxJitter: 0 }
    expect(computeBackoff(1, withoutJitter)).toBe(1000)
    expect(computeBackoff(2, withoutJitter)).toBe(2000)
    expect(computeBackoff(3, withoutJitter)).toBe(4000)
    expect(computeBackoff(4, withoutJitter)).toBe(8000)
    expect(computeBackoff(5, withoutJitter)).toBe(16_000)
    expect(computeBackoff(6, withoutJitter)).toBe(32_000)
  })
})
