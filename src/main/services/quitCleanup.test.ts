import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_QUIT_CLEANUP_TIMEOUT_MS,
  hideWindowsForFastQuit,
  runQuitCleanup,
  startFastQuit,
} from './quitCleanup'

describe('runQuitCleanup', () => {
  it('keeps the default watchdog short enough for Cmd+Q to feel instant', () => {
    expect(DEFAULT_QUIT_CLEANUP_TIMEOUT_MS).toBeLessThanOrEqual(150)
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

  it('logs synchronous cleanup failures through the same quit path', async () => {
    const disposeAll = vi.fn(() => {
      throw new Error('pool import state invalid')
    })
    const stopWatcher = vi.fn(async () => undefined)
    const log = vi.fn()

    await expect(
      runQuitCleanup({ disposeAll, stopWatcher, timeoutMs: 100, log }),
    ).resolves.toBe('completed')

    expect(log).toHaveBeenCalledWith(
      '[main] before-quit cleanup error: Error: pool import state invalid',
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

describe('startFastQuit', () => {
  it('hides windows synchronously and exits on the next tick without waiting for cleanup', async () => {
    vi.useFakeTimers()
    const live = { isDestroyed: vi.fn(() => false), hide: vi.fn() }
    const clearStartupWatcher = vi.fn()
    const exit = vi.fn()
    const disposeAll = vi.fn(() => new Promise<void>(() => undefined))
    const stopWatcher = vi.fn(async () => undefined)
    const log = vi.fn()

    startFastQuit({
      windows: [live],
      clearStartupWatcher,
      exit,
      disposeAll,
      stopWatcher,
      timeoutMs: 100,
      log,
    })

    expect(clearStartupWatcher).toHaveBeenCalledOnce()
    expect(live.hide).toHaveBeenCalledOnce()
    expect(exit).not.toHaveBeenCalled()

    await new Promise<void>((resolve) => process.nextTick(resolve))

    expect(exit).toHaveBeenCalledOnce()
    expect(log).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    vi.useRealTimers()
  })
})
