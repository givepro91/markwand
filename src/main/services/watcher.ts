import { watch, FSWatcher } from 'chokidar'
import { stat as fsStat } from 'fs/promises'
import path from 'path'
import type { WebContents } from 'electron'
import type { FsChangeEvent } from '../../preload/types'
import { parseFrontmatter } from './scanner'
import { localTransport } from '../transport/local'
import { isViewable, classifyAsset } from '../../lib/viewable'

// Follow-up FS-RT-1 — watcher → main docsCache 무효화 wiring.
// circular import (workspace.ts ↔ watcher.ts) 회피용 setter 패턴.
// registerWorkspaceHandlers 가 부팅 시 등록한다. 미등록 상태에서는 noop.
//
// resolveProjectId(filePath) → projectId | null:
//   filePath 가 어느 프로젝트 root 하위인지 main 측 projectsCache 로 역추적.
//   매칭 실패(워크스페이스 밖, 캐시 cold start 등)면 null — fs:change 페이로드의
//   projectId 를 비워 보내 renderer 가 incremental add 를 안전 무시한다.
// invalidateDocsCacheForProject(projectId):
//   add/unlink 발생 시 호출되어 다음 project:scan-docs 가 fresh scan 하도록 강제.
let projectIdResolver: ((filePath: string) => string | null) | null = null
let docsCacheInvalidator: ((projectId: string) => void) | null = null
export function setProjectIdResolver(
  fn: ((filePath: string) => string | null) | null,
): void {
  projectIdResolver = fn
}
export function setDocsCacheInvalidator(
  fn: ((projectId: string) => void) | null,
): void {
  docsCacheInvalidator = fn
}

type ChangeType = FsChangeEvent['type']

let watcher: FSWatcher | null = null
const debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
let activeWebContents: WebContents | null = null
// 프로젝트 목록 자동 싱크용 — 감시 중인 workspace root 목록.
// addDir/unlinkDir 이벤트의 depth 를 계산하려면 어느 root 하위인지 알아야 함.
// 가장 긴 prefix 매칭으로 소속 root 를 찾아 depth 판정.
const watchedRoots: Set<string> = new Set()
// 프로젝트 레벨 디렉토리 변화 debounce — watcher storm(100개 디렉토리 동시 생성) 시
// 단발성 이벤트로 수렴시켜 renderer 가 불필요한 rescan 을 반복 트리거하지 않게 함.
let projectChangeTimer: ReturnType<typeof setTimeout> | null = null
const PROJECT_CHANGE_DEBOUNCE_MS = 500

const DEBOUNCE_MS = 150
const PROJECT_DEPTH_MAX = 2 // workspace root 기준 depth ≤ 2 의 디렉토리 변화만 프로젝트 목록에 반영

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
  '__fixtures__',
  '__snapshots__',
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

/**
 * 디렉토리 경로가 watchedRoots 중 하나의 depth ≤ PROJECT_DEPTH_MAX 범위에 속하면 true.
 * 프로젝트 목록에 반영해야 할 디렉토리만 통과시키기 위한 가드.
 * depth 0 = root 자체, 1 = root/a, 2 = root/a/b.
 */
function isProjectLevelDir(dirPath: string): boolean {
  for (const root of watchedRoots) {
    if (!dirPath.startsWith(root)) continue
    const rel = path.relative(root, dirPath)
    if (rel === '') continue // root 자체는 프로젝트가 아님
    const depth = rel.split(path.sep).length
    if (depth > 0 && depth <= PROJECT_DEPTH_MAX) return true
  }
  return false
}

/**
 * 프로젝트 레벨 디렉토리 add/unlink 이벤트를 debounce 로 하나의 project-change IPC 로 수렴.
 * watcher storm (예: git clone 으로 수백 디렉토리 동시 생성) 에서도 단 1회만 renderer 에 전달.
 */
function scheduleProjectChange(): void {
  if (!activeWebContents || activeWebContents.isDestroyed()) return
  if (projectChangeTimer) clearTimeout(projectChangeTimer)
  projectChangeTimer = setTimeout(() => {
    projectChangeTimer = null
    if (!activeWebContents || activeWebContents.isDestroyed()) return
    activeWebContents.send('fs:project-change')
  }, PROJECT_CHANGE_DEBOUNCE_MS)
}

function sendChange(type: ChangeType, filePath: string): void {
  if (!activeWebContents || activeWebContents.isDestroyed()) return

  const key = `${type}:${filePath}`
  const existing = debounceTimers.get(key)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    debounceTimers.delete(key)
    if (!activeWebContents || activeWebContents.isDestroyed()) return

    // add / unlink 는 docsCache 형태(파일 집합) 자체를 바꾸므로 main 캐시를 즉시 무효화.
    // change 는 doc 자체의 mtime/size/frontmatter 만 바뀌어 incremental updateDoc 으로 충분.
    if (type === 'add' || type === 'unlink') {
      const pid = projectIdResolver?.(filePath) ?? null
      if (pid && docsCacheInvalidator) docsCacheInvalidator(pid)
    }

    if (type === 'unlink') {
      const payload: FsChangeEvent = { type, path: filePath }
      const pid = projectIdResolver?.(filePath) ?? null
      if (pid) payload.projectId = pid
      payload.name = path.basename(filePath)
      activeWebContents.send('fs:change', payload)
      return
    }

    // add/change는 stat으로 size+mtime을 같이 실어 보낸다. mtime 은 'add' incremental
    // 반영 시 Doc.mtime 채움용. stat 실패(권한·경쟁 삭제)는 무해 — size/mtime 은 optional.
    void fsStat(filePath)
      .then((st) => (st.isFile() ? { size: st.size, mtime: st.mtimeMs } : null))
      .catch(() => null)
      .then(async (stat) => {
        if (!activeWebContents || activeWebContents.isDestroyed()) return

        const pid = projectIdResolver?.(filePath) ?? null
        const basePayload: FsChangeEvent = { type, path: filePath }
        basePayload.name = path.basename(filePath)
        if (pid) basePayload.projectId = pid
        if (stat?.size !== undefined) basePayload.size = stat.size
        if (stat?.mtime !== undefined) basePayload.mtime = stat.mtime

        // 이미지 등 non-md 자산은 frontmatter 파싱 스킵 (4KB 헤더 read 회피)
        if (classifyAsset(filePath) !== 'md') {
          activeWebContents.send('fs:change', basePayload)
          return
        }

        const frontmatter = await parseFrontmatter(localTransport.fs, filePath)
        if (!activeWebContents || activeWebContents.isDestroyed()) return
        const payload: FsChangeEvent = { ...basePayload }
        if (frontmatter !== undefined) payload.frontmatter = frontmatter
        activeWebContents.send('fs:change', payload)
      })
  }, DEBOUNCE_MS)

  debounceTimers.set(key, timer)
}

export function startWatcher(roots: string[], webContents: WebContents): void {
  activeWebContents = webContents
  for (const r of roots) watchedRoots.add(r)

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
    // depth 10 은 ~/develop 같은 큰 트리(swk: 15k 디렉토리)에서 chokidar 초기 walk 가
    // libuv 스레드풀을 점거해 첫 scanProjects 가 4000배 느려지는 회귀(2026-04-25 사용자 보고).
    // 프로젝트 변경 감지(addDir on isProjectLevelDir) 는 depth ≤ 2 면 충분하고,
    // 파일 단위 변경(.md / 이미지)은 보통 project_root → src → subdir → file 까지로
    // depth 4 면 99% 커버. 깊은 docs/.../subdir/.../file.md 케이스는 워크스페이스
    // 단위 refresh 으로 fallback.
    depth: 4,
  })

  watcher
    .on('add', (p: string) => sendChange('add', p))
    .on('change', (p: string) => sendChange('change', p))
    .on('unlink', (p: string) => sendChange('unlink', p))
    // 프로젝트 레벨 디렉토리(depth ≤ 2) 생성/삭제 → renderer 가 프로젝트 목록 자동 갱신.
    // 파일 이벤트와 분리된 'fs:project-change' IPC 로 전달. debounce 500ms 로 storm 방어.
    .on('addDir', (p: string) => {
      if (hasIgnoredSegment(p)) return
      if (isProjectLevelDir(p)) scheduleProjectChange()
    })
    .on('unlinkDir', (p: string) => {
      if (hasIgnoredSegment(p)) return
      if (isProjectLevelDir(p)) scheduleProjectChange()
    })
    .on('error', (err: unknown) => {
      // EMFILE/ENOSPC는 fail-soft. 이미 등록된 watch는 유지된다.
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('EMFILE') || msg.includes('ENOSPC')) return
      console.error('[watcher] error:', msg)
    })
}

export function addWatchRoots(roots: string[], webContents?: WebContents): void {
  for (const r of roots) watchedRoots.add(r)
  if (!watcher) {
    if (webContents) {
      startWatcher(roots, webContents)
    }
    return
  }
  watcher.add(roots)
}

export function removeWatchRoot(root: string): void {
  watchedRoots.delete(root)
  watcher?.unwatch(root)
}

export async function stopWatcher(): Promise<void> {
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer)
  }
  debounceTimers.clear()
  if (projectChangeTimer) {
    clearTimeout(projectChangeTimer)
    projectChangeTimer = null
  }
  watchedRoots.clear()

  if (watcher) {
    await watcher.close()
    watcher = null
  }
}
