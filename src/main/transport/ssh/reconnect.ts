// SSH reconnect backoff + 상태 머신 core — Plan §S2.4.
//
// 지수 backoff: maxAttempts=6 시도.
//   attempt 1: delay=0 (즉시 첫 시도)
//   attempt 2: delay=1s
//   attempt 3: delay=2s
//   attempt 4: delay=4s
//   attempt 5: delay=8s
//   attempt 6: delay=16s
//   전부 실패 → offline
//
// AWS builders library 기준 exp backoff (2^(n-1) × base, cap 60s). jitter ±maxJitter 로 herd 방지.
// maxJitter=0 일 때 결정론 (테스트 전용). computeBackoff(6) 는 attempt 7 용 32s 를 반환하지만
// maxAttempts=6 에서는 never reached (S2 Evaluator M-2 주석 정정).
//
// 상태 어휘 3종 (Design Contract DC-3): connected / connecting / offline
// UI(useTransportStatus) 연동은 S2 후반부(다음 세션). 이 모듈은 pure logic 만 제공.

export type TransportStatus = 'connected' | 'connecting' | 'offline'

export interface BackoffConfig {
  /** 첫 대기 ms (기본 1000) */
  base: number
  /** 상한 ms (기본 60000) */
  cap: number
  /** 최대 시도 횟수 (기본 6). 초과 시 offline 전이 */
  maxAttempts: number
  /** jitter 최대 ms (기본 200). 0 이면 jitter 없음 (테스트 결정론) */
  maxJitter: number
}

export const DEFAULT_BACKOFF: BackoffConfig = {
  base: 1000,
  cap: 60_000,
  maxAttempts: 6,
  maxJitter: 200,
}

/**
 * attempt(1부터) 에 해당하는 backoff 지연 ms 를 계산.
 * jitter 는 옵션 (테스트에서는 maxJitter=0 으로 결정론적).
 */
export function computeBackoff(
  attempt: number,
  cfg: BackoffConfig = DEFAULT_BACKOFF,
  randomFn: () => number = Math.random,
): number {
  if (attempt < 1) return 0
  const exp = cfg.base * 2 ** (attempt - 1)
  const capped = Math.min(exp, cfg.cap)
  const jitter = cfg.maxJitter > 0 ? randomFn() * cfg.maxJitter : 0
  return capped + jitter
}

export interface ReconnectAttempt {
  attempt: number
  /** 이 시도 전 sleep 해야 할 ms. attempt===1 일 때 0(즉시). */
  delayMs: number
  /** 이 시도가 마지막인지 (다음 시도 시 exhausted). */
  isLast: boolean
}

/**
 * 주어진 backoff 설정에서 1..maxAttempts 까지 시도 계획을 생성.
 * reconnectLoop() 실행부가 이 플랜을 순회하며 sleep + connect + 판정.
 */
export function planReconnectAttempts(
  cfg: BackoffConfig = DEFAULT_BACKOFF,
  randomFn: () => number = Math.random,
): ReconnectAttempt[] {
  const plan: ReconnectAttempt[] = []
  for (let i = 1; i <= cfg.maxAttempts; i++) {
    plan.push({
      attempt: i,
      delayMs: i === 1 ? 0 : computeBackoff(i - 1, cfg, randomFn),
      isLast: i === cfg.maxAttempts,
    })
  }
  return plan
}

/**
 * abortable sleep — Promise 대기 중 abort 신호 시 즉시 reject ('AbortError').
 * reconnectLoop 가 watcher.close() 시 backoff 대기에서 빠져나오게 한다.
 */
export function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'))
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export interface ReconnectRunOptions {
  /** 각 attempt 에서 호출할 connect 함수. throw 시 다음 attempt 진행. */
  connect: () => Promise<void>
  cfg?: BackoffConfig
  randomFn?: () => number
  signal?: AbortSignal
  /** 상태 전이 콜백 — 'connecting' / 'connected' / 'offline' */
  onStatus?: (status: TransportStatus, info?: { attempt: number; nextDelayMs?: number }) => void
}

/**
 * reconnect 루프 실행기.
 *   - 각 attempt 전에 onStatus('connecting', {attempt, nextDelayMs: delay})
 *   - delay 후 connect() 호출. 성공 시 onStatus('connected') 후 return true.
 *   - 실패 시 catch, 다음 attempt. signal abort 시 즉시 throw.
 *   - 모든 attempt 실패 → onStatus('offline') 후 return false.
 */
export async function runReconnect(options: ReconnectRunOptions): Promise<boolean> {
  const cfg = options.cfg ?? DEFAULT_BACKOFF
  const plan = planReconnectAttempts(cfg, options.randomFn)
  for (const step of plan) {
    options.onStatus?.('connecting', { attempt: step.attempt, nextDelayMs: step.delayMs })
    if (step.delayMs > 0) {
      try {
        await sleepWithSignal(step.delayMs, options.signal)
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err
        // sleep 자체 실패는 있을 수 없지만 방어
      }
    }
    if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    try {
      await options.connect()
      options.onStatus?.('connected', { attempt: step.attempt })
      return true
    } catch {
      // 다음 attempt 로
      continue
    }
  }
  options.onStatus?.('offline')
  return false
}
