import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import fg from 'fast-glob'
import type { Project, Doc, WorkspaceMode } from '../../preload/types'

// 프로젝트를 식별하는 마커 파일 8종
const PROJECT_MARKERS = [
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'CLAUDE.md',
  '.git',
  'README.md',
  'Makefile',
]

// scanDocs에서 제외할 디렉토리 패턴 14종
const SCAN_IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/.next/**',
  '**/build/**',
  '**/__pycache__/**',
  '**/target/**',
  '**/vendor/**',
  '**/.venv/**',
  '**/coverage/**',
  '**/.cache/**',
  '**/out/**',
  '**/.nuxt/**',
  '**/.turbo/**',
]

// scanProjects에서 들어가지 않을 디렉토리. hidden 폴더 외에도 거대한 의존성/빌드 산출물 폴더는
// readdir 자체를 회피해야 큰 워크스페이스에서 첫 스캔이 멈추지 않는다.
const PROJECT_SCAN_IGNORE = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  'coverage',
  '__pycache__',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  '.venv',
])

function makeProjectId(root: string): string {
  return createHash('sha1').update(root).digest('hex').slice(0, 16)
}

async function findMarkers(dirPath: string): Promise<string[]> {
  const found: string[] = []
  for (const marker of PROJECT_MARKERS) {
    try {
      await fs.promises.access(path.join(dirPath, marker))
      found.push(marker)
    } catch {
      // 마커 없음
    }
  }
  return found
}

async function makeProject(
  workspaceId: string,
  dirPath: string,
  markers: string[]
): Promise<Project> {
  let lastModified = 0
  try {
    const stat = await fs.promises.stat(dirPath)
    lastModified = stat.mtimeMs
  } catch {
    lastModified = Date.now()
  }
  return {
    id: makeProjectId(dirPath),
    workspaceId,
    name: path.basename(dirPath),
    root: dirPath,
    markers,
    docCount: -1, // 분석 중 sentinel — App.tsx worker가 채우면 0 이상
    lastModified,
  }
}

/**
 * 워크스페이스 루트 직하(depth 1)에 프로젝트 마커 보유 디렉토리가 있는지 본다.
 * 있으면 container 추천, 없으면 single 추천.
 */
export async function detectWorkspaceMode(rootPath: string): Promise<WorkspaceMode> {
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(rootPath, { withFileTypes: true })
  } catch {
    return 'single'
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (PROJECT_SCAN_IGNORE.has(entry.name)) continue
    if (entry.name.startsWith('.')) continue
    const markers = await findMarkers(path.join(rootPath, entry.name))
    if (markers.length > 0) return 'container'
  }
  return 'single'
}

/**
 * workspaceId에 속하는 프로젝트를 스캔한다.
 * - mode='single': 루트 자체를 1개 프로젝트로 반환 (마커 없어도 등록 — 사용자가 명시적으로 단독 지정한 의도).
 * - mode='container': 루트(depth 0)는 마커 검사 스킵하고 하위를 depth 2까지 재귀 탐색.
 *   마커 8종 중 하나라도 있는 디렉토리를 프로젝트로 인식.
 */
export async function scanProjects(
  workspaceId: string,
  rootPath: string,
  mode: WorkspaceMode = 'container'
): Promise<Project[]> {
  if (mode === 'single') {
    const markers = await findMarkers(rootPath)
    const project = await makeProject(workspaceId, rootPath, markers)
    return [project]
  }

  const projects: Project[] = []

  async function scan(dirPath: string, currentDepth: number): Promise<void> {
    if (currentDepth > 2) return

    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    } catch {
      return
    }

    // 루트(depth 0)는 "컨테이너"로 취급해 마커 검사 스킵 — swk 같은 메타 폴더가
    // 루트 CLAUDE.md 때문에 프로젝트로 흡수되던 버그 해결.
    if (currentDepth > 0) {
      const foundMarkers = await findMarkers(dirPath)
      if (foundMarkers.length > 0) {
        projects.push(await makeProject(workspaceId, dirPath, foundMarkers))
        return // 프로젝트 내부는 재귀 탐색하지 않음
      }
    }

    // 하위 디렉토리 재귀 탐색 — PROJECT_SCAN_IGNORE에 명시된 거대 디렉토리만 제외.
    // .secret 같은 사용자 hidden 폴더는 포함 (.git/.next 등은 PROJECT_SCAN_IGNORE에 명시).
    const subdirs = entries.filter(
      (e) => e.isDirectory() && !PROJECT_SCAN_IGNORE.has(e.name)
    )
    for (const subdir of subdirs) {
      await scan(path.join(dirPath, subdir.name), currentDepth + 1)
    }
  }

  await scan(rootPath, 0)
  // docCount는 비워두고 즉시 응답한다 — 42개 fast-glob 동시 실행이 메인 스레드를 블로킹한다.
  // ProjectCard는 별도 lazy IPC(project:get-doc-count)로 점진 표시한다.
  return projects
}

/**
 * 단일 프로젝트의 .md 개수만 빠르게 센다 (ProjectCard 표시용).
 * scanDocs와 동일한 ignore 패턴이지만 stat 호출 없이 카운트만 한다.
 */
export async function countDocs(projectRoot: string): Promise<number> {
  const stream = fg.stream('**/*.md', {
    cwd: projectRoot,
    ignore: SCAN_IGNORE_PATTERNS,
    onlyFiles: true,
    followSymbolicLinks: false,
    suppressErrors: true,
    dot: true, // .secret/ 등 hidden 폴더 안의 .md도 포함
  })
  let count = 0
  for await (const _ of stream) count++
  return count
}

/**
 * 프로젝트 루트 하위의 모든 .md 파일을 fast-glob으로 스캔한다.
 * 50개씩 청크로 반환하는 async generator.
 */
export async function* scanDocs(
  projectId: string,
  projectRoot: string,
  chunkSize = 50
): AsyncGenerator<Doc[]> {
  const stream = fg.stream('**/*.md', {
    cwd: projectRoot,
    ignore: SCAN_IGNORE_PATTERNS,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    dot: true, // .secret/ 등 hidden 폴더 안의 .md도 포함
  })

  let chunk: Doc[] = []

  for await (const entry of stream) {
    const absPath = entry as string
    let mtime = 0
    try {
      const stat = await fs.promises.stat(absPath)
      mtime = stat.mtimeMs
    } catch {
      mtime = Date.now()
    }

    chunk.push({
      path: absPath,
      projectId,
      name: path.basename(absPath),
      mtime,
    })

    if (chunk.length >= chunkSize) {
      yield chunk
      chunk = []
    }
  }

  if (chunk.length > 0) {
    yield chunk
  }
}
