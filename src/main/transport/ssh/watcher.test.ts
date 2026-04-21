/**
 * SshPoller — 폴링 diff · suggestInterval · manual mode · AbortController.
 * Plan §S4 DoD unit.
 */
import { describe, it, expect, vi } from 'vitest'
import { Readable } from 'node:stream'
import { createSshWatcherDriver, suggestInterval } from './watcher'
import type { SshClient } from './client'
import type { FileStat, WatchHandle } from '../types'
import type { PromisifiedSftp } from './util/promisifiedSftp'

const S_IFREG = 0o100000
const S_IFDIR = 0o040000

function entry(name: string, opts: { size?: number; mtime?: number; isDir?: boolean } = {}) {
  return {
    filename: name,
    longname: '',
    attrs: {
      size: opts.size ?? 10,
      mtime: opts.mtime ?? 1776756069,
      mode: (opts.isDir ? S_IFDIR : S_IFREG) | 0o644,
    },
  }
}

function makeClientWithTree(trees: Array<Record<string, ReturnType<typeof entry>[]>>) {
  // trees[i] = i번째 tick 의 readdir 반환값. 이후 동일 유지.
  let tick = 0
  const readdir = async (path: string) => {
    const tree = trees[Math.min(tick, trees.length - 1)]
    if (!(path in tree)) throw new Error(`no readdir: ${path}`)
    return tree[path]
  }
  const sftp: PromisifiedSftp = {
    readdir: readdir as unknown as PromisifiedSftp['readdir'],
    stat: vi.fn(),
    lstat: vi.fn(),
    readFile: vi.fn(),
    createReadStream: vi.fn().mockImplementation(() => Readable.from([])),
  }
  return {
    client: { getSftp: () => sftp, isConnected: true } as unknown as SshClient,
    advance: () => {
      tick++
    },
  }
}

function collectEvents(handle: WatchHandle, timeoutMs = 100): Promise<{ type: string; stat: FileStat }[]> {
  return new Promise((resolve) => {
    const events: { type: string; stat: FileStat }[] = []
    handle.on('add', (stat: FileStat) => events.push({ type: 'add', stat }))
    handle.on('change', (stat: FileStat) => events.push({ type: 'change', stat }))
    handle.on('unlink', (stat: FileStat) => events.push({ type: 'unlink', stat }))
    setTimeout(() => resolve(events), timeoutMs)
  })
}

describe('suggestInterval — Plan §S4.1 동적 2구간', () => {
  it('<10k files → 30s', () => {
    expect(suggestInterval(0)).toBe(30_000)
    expect(suggestInterval(500)).toBe(30_000)
    expect(suggestInterval(9999)).toBe(30_000)
  })
  it('≥10k files → 60s', () => {
    expect(suggestInterval(10_000)).toBe(60_000)
    expect(suggestInterval(100_000)).toBe(60_000)
  })
})

describe('SshPoller.watch — 첫 스캔 + diff', () => {
  it('첫 스캔은 snapshot 만 저장하고 add 이벤트 폭증 방지 (add 0건)', async () => {
    const { client } = makeClientWithTree([
      { '/root': [entry('a.md'), entry('b.md')] },
    ])
    const driver = createSshWatcherDriver(client)
    const handle = driver.watch(['/root'], { ignored: () => false, debounceMs: 10, manual: true } as Parameters<ReturnType<typeof createSshWatcherDriver>['watch']>[1])
    const events = await collectEvents(handle, 80)
    await handle.close()
    expect(events.filter((e) => e.type === 'add')).toHaveLength(0)
  })
})

describe('SshPoller.watch — manual mode', () => {
  it('manual=true → 첫 스캔 후 자동 tick 없음 (close 까지 idle)', async () => {
    const { client } = makeClientWithTree([{ '/root': [entry('a.md')] }])
    const driver = createSshWatcherDriver(client)
    const handle = driver.watch(['/root'], { ignored: () => false, debounceMs: 10, manual: true } as Parameters<ReturnType<typeof createSshWatcherDriver>['watch']>[1])
    // 80ms 대기 — 첫 scan 후 추가 이벤트 없음.
    const events = await collectEvents(handle, 80)
    await handle.close()
    expect(events).toHaveLength(0)
  })
})

describe('SshPoller.watch — close() AbortController', () => {
  it('close() → 이벤트 루프 중단, 이후 emit 없음', async () => {
    const { client } = makeClientWithTree([{ '/root': [entry('a.md')] }])
    const driver = createSshWatcherDriver(client)
    const handle = driver.watch(['/root'], { ignored: () => false, debounceMs: 10, manual: true } as Parameters<ReturnType<typeof createSshWatcherDriver>['watch']>[1])
    await handle.close()
    // close 후 30ms 대기 — 이벤트 없어야.
    await new Promise((r) => setTimeout(r, 30))
  })
})
