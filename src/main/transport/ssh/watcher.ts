// SshPoller — Plan §S4 (M4 원격 watcher).
//
// SFTP 는 inotify 불가능 — 폴링 기반 diff.
//   - 기본 30s, 동적 조정: <10k files → 30s / ≥10k → 60s
//   - snapshot: Map<path, {mtimeMs, size}>. 첫 scan 은 add 이벤트 폭증 방지(snapshot 만 저장, diff skip)
//   - diff 후 add/change/unlink 이벤트 emit (debounce 2000ms — chokidar awaitWriteFinish 관례)
//   - connect 실패/stat 실패 시 exp backoff (reconnect.ts 재사용)
//   - abort 시 즉시 종료 (AbortController signal chunk boundary 체크)

import { EventEmitter } from 'node:events'
import type { FileStat, WatchHandle, WatcherDriver, WatchOptions } from '../types'
import type { SshClient } from './client'
import { createSshScannerDriver } from './scanner'
import { sleepWithSignal, DEFAULT_BACKOFF } from './reconnect'

type Snapshot = Map<string, { mtimeMs: number; size: number }>

const DEFAULT_DEBOUNCE_MS = 2000
const SMALL_WORKSPACE_POLL_MS = 30_000
const LARGE_WORKSPACE_POLL_MS = 60_000
const LARGE_THRESHOLD = 10_000
const MAX_CONSEC_FAILURES = 6

export interface SshPollerOptions extends WatchOptions {
  /** manual 모드 — 자동 폴링 비활성, refresh() 명시 호출로만 재스캔 */
  manual?: boolean
}

export function createSshWatcherDriver(client: SshClient): WatcherDriver {
  return {
    watch(roots: string[], opts: WatchOptions): WatchHandle {
      return startPoller(client, roots, opts as SshPollerOptions)
    },
  }
}

function startPoller(
  client: SshClient,
  roots: string[],
  opts: SshPollerOptions,
): WatchHandle {
  const emitter = new EventEmitter()
  const ac = new AbortController()
  let snapshot: Snapshot = new Map()
  let isFirstScan = true
  let consecFailures = 0
  const patterns = ['**/*.{md,png,jpg,jpeg,svg,gif,webp}']
  const ignore = ['**/node_modules/**', '**/.git/**', '**/__fixtures__/**']
  const scanner = createSshScannerDriver(client)

  async function fullScan(): Promise<Snapshot> {
    const next: Snapshot = new Map()
    for (const root of roots) {
      if (ac.signal.aborted) throw new DOMException('aborted', 'AbortError')
      for await (const stat of scanner.scanDocs(root, patterns, ignore)) {
        if (ac.signal.aborted) throw new DOMException('aborted', 'AbortError')
        next.set(stat.path, { mtimeMs: stat.mtimeMs, size: stat.size })
      }
    }
    return next
  }

  function emitDiff(prev: Snapshot, next: Snapshot): void {
    for (const [path, cur] of next) {
      const old = prev.get(path)
      if (!old) {
        queueEvent('add', { path, size: cur.size, mtimeMs: cur.mtimeMs })
        continue
      }
      // mtime=-1 폴백 — size 변경만으로도 change 판정 (Critic M-2)
      const mtimeChanged = old.mtimeMs !== -1 && cur.mtimeMs !== -1 && old.mtimeMs !== cur.mtimeMs
      const sizeChanged = old.size !== cur.size
      if (mtimeChanged || sizeChanged) {
        queueEvent('change', { path, size: cur.size, mtimeMs: cur.mtimeMs })
      }
    }
    for (const [path, stat] of prev) {
      if (!next.has(path)) {
        queueEvent('unlink', { path, size: stat.size, mtimeMs: stat.mtimeMs })
      }
    }
  }

  // debounce 큐: 같은 path 의 연속 이벤트는 마지막만 전송.
  const queue = new Map<string, { type: 'add' | 'change' | 'unlink'; stat: FileStat }>()
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS

  function queueEvent(
    type: 'add' | 'change' | 'unlink',
    partial: { path: string; size: number; mtimeMs: number },
  ): void {
    const stat: FileStat = {
      path: partial.path,
      size: partial.size,
      mtimeMs: partial.mtimeMs,
      isDirectory: false,
      isSymlink: false,
    }
    queue.set(partial.path, { type, stat })
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      const batch = Array.from(queue.values())
      queue.clear()
      flushTimer = null
      for (const { type, stat } of batch) {
        emitter.emit(type, stat)
      }
    }, debounceMs)
    if (typeof flushTimer.unref === 'function') flushTimer.unref()
  }

  async function loop(): Promise<void> {
    while (!ac.signal.aborted) {
      try {
        const next = await fullScan()
        if (isFirstScan) {
          snapshot = next
          isFirstScan = false
        } else {
          emitDiff(snapshot, next)
          snapshot = next
        }
        consecFailures = 0
        const interval = suggestInterval(snapshot.size)
        if (opts.manual) return
        await sleepWithSignal(interval, ac.signal)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        consecFailures++
        if (consecFailures > MAX_CONSEC_FAILURES) {
          emitter.emit('error', err)
          return
        }
        const delay = Math.min(
          DEFAULT_BACKOFF.base * 2 ** (consecFailures - 1),
          DEFAULT_BACKOFF.cap,
        )
        try {
          await sleepWithSignal(delay, ac.signal)
        } catch {
          return
        }
      }
    }
  }

  void loop()

  function on(event: 'add' | 'change' | 'unlink', cb: (stat: FileStat) => void): void
  function on(event: 'error', cb: (err: Error) => void): void
  function on(
    event: 'add' | 'change' | 'unlink' | 'error',
    cb: ((stat: FileStat) => void) | ((err: Error) => void),
  ): void {
    emitter.on(event, cb as (...args: unknown[]) => void)
  }

  const handle: WatchHandle = {
    on,
    async close() {
      ac.abort()
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
    },
  }
  return handle
}

export function suggestInterval(snapshotSize: number): number {
  return snapshotSize >= LARGE_THRESHOLD ? LARGE_WORKSPACE_POLL_MS : SMALL_WORKSPACE_POLL_MS
}
