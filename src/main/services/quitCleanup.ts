export type QuitCleanupResult = 'completed' | 'timed-out'

export interface QuitCleanupOptions {
  disposeAll: () => Promise<void>
  stopWatcher: () => Promise<void>
  timeoutMs?: number
  log?: (message: string) => void
}

export const DEFAULT_QUIT_CLEANUP_TIMEOUT_MS = 120

export interface HideableWindow {
  isDestroyed: () => boolean
  hide: () => void
}

export function hideWindowsForFastQuit(windows: HideableWindow[]): void {
  for (const win of windows) {
    if (win.isDestroyed()) continue
    win.hide()
  }
}

export interface StartFastQuitOptions extends QuitCleanupOptions {
  windows: HideableWindow[]
  clearStartupWatcher?: () => void
  exit: () => void
}

export function startFastQuit({
  windows,
  clearStartupWatcher,
  exit,
  disposeAll,
  stopWatcher,
  timeoutMs,
  log,
}: StartFastQuitOptions): void {
  clearStartupWatcher?.()
  hideWindowsForFastQuit(windows)

  void runQuitCleanup({ disposeAll, stopWatcher, timeoutMs, log })
    .catch((err) => {
      const write = log ?? ((message: string) => process.stderr.write(`${message}\n`))
      write(`[main] before-quit cleanup setup error: ${String(err)}`)
    })
  process.nextTick(exit)
}

export async function runQuitCleanup({
  disposeAll,
  stopWatcher,
  timeoutMs = DEFAULT_QUIT_CLEANUP_TIMEOUT_MS,
  log = (message) => process.stderr.write(`${message}\n`),
}: QuitCleanupOptions): Promise<QuitCleanupResult> {
  let timeout: ReturnType<typeof setTimeout> | undefined

  const watchdog = new Promise<QuitCleanupResult>((resolve) => {
    timeout = setTimeout(() => {
      log(`[main] before-quit cleanup timed out after ${timeoutMs}ms; forcing exit`)
      resolve('timed-out')
    }, timeoutMs)
    timeout.unref?.()
  })

  const cleanup = Promise.allSettled([
    Promise.resolve().then(disposeAll),
    Promise.resolve().then(stopWatcher),
  ]).then((results) => {
    for (const result of results) {
      if (result.status === 'rejected') {
        log(`[main] before-quit cleanup error: ${String(result.reason)}`)
      }
    }
    return 'completed' as const
  })

  const result = await Promise.race([cleanup, watchdog])
  if (timeout) clearTimeout(timeout)
  return result
}
