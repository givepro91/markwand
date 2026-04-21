import { watch, FSWatcher } from 'chokidar'
import path from 'path'
import type { WebContents } from 'electron'
import type { FsChangeEvent } from '../../preload/types'
import { parseFrontmatter } from './scanner'
import { isViewable, classifyAsset } from '../../lib/viewable'

type ChangeType = FsChangeEvent['type']

let watcher: FSWatcher | null = null
const debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
let activeWebContents: WebContents | null = null

const DEBOUNCE_MS = 150

// 디렉토리 자체를 watch에서 통째로 제외해야 한다.
// chokidar의 ignored가 .md 필터만 하면 node_modules 같은 큰 디렉토리도
// FSEvents에 등록되어 macOS file descriptor 한도(EMFILE)를 초과한다.
const IGNORE_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  '.venv',
  '.nova',
  '__pycache__',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  'coverage',
  '.DS_Store',
])

function hasIgnoredSegment(filePath: string): boolean {
  const segments = filePath.split(path.sep)
  for (const seg of segments) {
    if (IGNORE_DIR_NAMES.has(seg)) return true
  }
  return false
}

function sendChange(type: ChangeType, filePath: string): void {
  if (!activeWebContents || activeWebContents.isDestroyed()) return

  const key = `${type}:${filePath}`
  const existing = debounceTimers.get(key)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    debounceTimers.delete(key)
    if (!activeWebContents || activeWebContents.isDestroyed()) return

    if (type === 'unlink') {
      activeWebContents.send('fs:change', { type, path: filePath } satisfies FsChangeEvent)
      return
    }

    // 이미지 등 non-md 자산은 frontmatter 파싱 스킵 (4KB 헤더 read 회피)
    if (classifyAsset(filePath) !== 'md') {
      activeWebContents.send('fs:change', { type, path: filePath } satisfies FsChangeEvent)
      return
    }

    void parseFrontmatter(filePath).then((frontmatter) => {
      if (!activeWebContents || activeWebContents.isDestroyed()) return
      const payload: FsChangeEvent = { type, path: filePath }
      if (frontmatter !== undefined) payload.frontmatter = frontmatter
      activeWebContents.send('fs:change', payload)
    })
  }, DEBOUNCE_MS)

  debounceTimers.set(key, timer)
}

export function startWatcher(roots: string[], webContents: WebContents): void {
  activeWebContents = webContents

  if (watcher) {
    watcher.add(roots)
    return
  }

  watcher = watch(roots, {
    persistent: true,
    ignoreInitial: true,
    // 디렉토리/파일 모두 검사. 디렉토리가 ignored면 그 하위 watch를 통째로 회피.
    ignored: (filePath: string) => {
      if (hasIgnoredSegment(filePath)) return true
      // 파일로 추정되는 경로(확장자 있음)는 VIEWABLE_EXTS(md + 이미지)만 통과
      const base = path.basename(filePath)
      const dot = base.lastIndexOf('.')
      if (dot > 0) {
        return !isViewable(filePath)
      }
      // 확장자 없는 경로는 디렉토리로 가정 → watch 통과
      return false
    },
    awaitWriteFinish: {
      stabilityThreshold: DEBOUNCE_MS,
      pollInterval: 50,
    },
    depth: 10,
  })

  watcher
    .on('add', (p: string) => sendChange('add', p))
    .on('change', (p: string) => sendChange('change', p))
    .on('unlink', (p: string) => sendChange('unlink', p))
    .on('error', (err: unknown) => {
      // EMFILE/ENOSPC는 fail-soft. 이미 등록된 watch는 유지된다.
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('EMFILE') || msg.includes('ENOSPC')) return
      console.error('[watcher] error:', msg)
    })
}

export function addWatchRoots(roots: string[], webContents?: WebContents): void {
  if (!watcher) {
    if (webContents) {
      startWatcher(roots, webContents)
    }
    return
  }
  watcher.add(roots)
}

export function removeWatchRoot(root: string): void {
  watcher?.unwatch(root)
}

export async function stopWatcher(): Promise<void> {
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer)
  }
  debounceTimers.clear()

  if (watcher) {
    await watcher.close()
    watcher = null
  }
}
