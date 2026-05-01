import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_QUIT_CLEANUP_TIMEOUT_MS,
  hideWindowsForFastQuit,
  runQuitCleanup,
} from './quitCleanup'

describe('runQuitCleanup', () => {
  it('keeps the default watchdog short enough for Cmd+Q to feel instant', () => {
    expect(DEFAULT_QUIT_CLEANUP_TIMEOUT_MS).toBeLessThanOrEqual(500)
  })

  it('waits for transport and watcher cleanup when both complete quickly', async () => {
    const disposeAll = vi.fn(async () => undefined)
    const stopWatcher = vi.fn(async () => undefined)

    await expect(
      runQuitCleanup({ disposeAll, stopWatcher, timeoutMs: 100, log: vi.fn() }),
    ).resolves.toBe('completed')

    expect(disposeAll).toHaveBeenCalledTimes(1)
    expect(stopWatcher).toHaveBeenCalledTimes(1)
  })

  it('does not block quit forever when cleanup hangs', async () => {
    vi.useFakeTimers()
    const disposeAll = vi.fn(() => new Promise<void>(() => undefined))
    const stopWatcher = vi.fn(async () => undefined)
    const log = vi.fn()

    const result = runQuitCleanup({ disposeAll, stopWatcher, timeoutMs: 100, log })
    await vi.advanceTimersByTimeAsync(100)

    await expect(result).resolves.toBe('timed-out')
    expect(log).toHaveBeenCalledWith(
      '[main] before-quit cleanup timed out after 100ms; forcing exit',
    )

    vi.useRealTimers()
  })

  it('logs cleanup failures but still lets quit continue', async () => {
    const disposeAll = vi.fn(async () => {
      throw new Error('ssh dispose failed')
    })
    const stopWatcher = vi.fn(async () => undefined)
    const log = vi.fn()

    await expect(
      runQuitCleanup({ disposeAll, stopWatcher, timeoutMs: 100, log }),
    ).resolves.toBe('completed')

    expect(log).toHaveBeenCalledWith(
      '[main] before-quit cleanup error: Error: ssh dispose failed',
    )
  })
})

describe('hideWindowsForFastQuit', () => {
  it('hides live windows synchronously and skips destroyed windows', () => {
    const live = { isDestroyed: vi.fn(() => false), hide: vi.fn() }
    const destroyed = { isDestroyed: vi.fn(() => true), hide: vi.fn() }

    hideWindowsForFastQuit([live, destroyed])

    expect(live.hide).toHaveBeenCalledTimes(1)
    expect(destroyed.hide).not.toHaveBeenCalled()
  })
})
