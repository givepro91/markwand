import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import fg from 'fast-glob'
import matter from 'gray-matter'
import type { Project, DocFrontmatter, WorkspaceMode } from '../../preload/types'
import type { FsDriver } from '../transport/types'
import { VIEWABLE_GLOB } from '../../lib/viewable'

export const HEADER_READ_BYTES = 4096

function normalizeUpdated(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') {
    const ms = Date.parse(value)
    return isNaN(ms) ? undefined : ms
  }
  return undefined
}

// tags 는 string[] 을 계약으로 하지만 사용자가 YAML에 단일 문자열/쉼표구분/null 로 쓸 수 있다.
// FilterBar 가 Array iterate 를 전제하므로 반드시 배열로 정규화해야 한다.
// (정규화 안 할 경우 `tags: "backend"` 가 `['b','a','c','k','e','n','d']` 로 문자 단위 분해되어 필터칩이 깨짐)
function normalizeTags(value: unknown): string[] | undefined {
  if (value == null) return undefined
  if (Array.isArray(value)) {
    const arr = value
      .filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
      .map((v) => String(v).trim())
      .filter((s) => s.length > 0)
    return arr
  }
  if (typeof value === 'string') {
    const arr = value
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    return arr.length > 0 ? arr : undefined
  }
  // 다른 타입(object/number 등) 은 버림 — 계약 위반 입력은 삭제가 안전.
  return undefined
}

/**
 * Doc 의 YAML frontmatter(파일 앞 HEADER_READ_BYTES 바이트) 를 파싱한다.
 * RM-7 해소(M3 Plan §S0.2) — Transport 추상 경유로 원격(SSH) 파일에도 동작 가능해짐.
 *
 * 구현 상세: FsDriver.readStream 을 opts 없이 호출하고 maxBytes 도달 시 iterator 를 조기
 * break 한다. Node Readable(fs.createReadStream)은 `for await` break 시 stream.destroy() 호출
 * 되어 후속 데이터 읽기가 중단된다. SSH 구현 시 SshFsDriver.readStream 의 서버측 범위 요청
 * 최적화(sftp.createReadStream({start, end}))로 연장 가능.
 */
export async function parseFrontmatter(
  fsDriver: FsDriver,
  absPath: string,
  opts?: { maxBytes?: number }
): Promise<DocFrontmatter | undefined> {
  const maxBytes = opts?.maxBytes ?? HEADER_READ_BYTES
  try {
    const chunks: Buffer[] = []
    let total = 0
    for await (const chunk of fsDriver.readStream(absPath)) {
      const remaining = maxBytes - total
      if (remaining <= 0) break
      const buf = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
      if (buf.byteLength > remaining) {
        chunks.push(buf.subarray(0, remaining))
        total += remaining
        break
      }
      chunks.push(buf)
      total += buf.byteLength
    }
    const head = Buffer.concat(chunks).toString('utf8')
    const { data } = matter(head)
    if (!data || Object.keys(data).length === 0) return undefined
    const fm: DocFrontmatter = { ...data }
    const updatedNormalized = normalizeUpdated(data.updated)
    if (updatedNormalized !== undefined) {
      fm.updated = updatedNormalized
    } else {
      delete fm.updated
    }
    const tagsNormalized = normalizeTags(data.tags)
    if (tagsNormalized !== undefined) {
      fm.tags = tagsNormalized
    } else {
      delete fm.tags
    }
    return fm
  } catch {
    return undefined
  }
}

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

// scanProjects/countDocs 에서 제외할 디렉토리 패턴 14종.
// (참고: scanDocs 는 M3 §S0.2 RM-7 리팩터에서 제거됐고 IPC 헬퍼 composeDocsFromFileStats 가
// LocalScannerDriver.scanDocs(FileStat) + Doc composition 으로 대체했다.)
const SCAN_IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/__fixtures__/**',
  '**/__snapshots__/**',
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
 * 단일 프로젝트의 viewable asset(md + 이미지) 개수를 빠르게 센다 (ProjectCard 표시용).
 * scanDocs와 동일한 ignore 패턴이지만 stat 호출 없이 카운트만 한다.
 */
export async function countDocs(projectRoot: string): Promise<number> {
  const stream = fg.stream(VIEWABLE_GLOB, {
    cwd: projectRoot,
    ignore: SCAN_IGNORE_PATTERNS,
    onlyFiles: true,
    followSymbolicLinks: false,
    suppressErrors: true,
    dot: true, // .secret/ 등 hidden 폴더 안의 파일도 포함
    caseSensitiveMatch: false, // .PNG/.JPG 등 대문자 확장자 허용
  })
  let count = 0
  for await (const _ of stream) count++
  return count
}

// M3 §S0.2 RM-7 해소: 기존 scanDocs AsyncGenerator<Doc[]> 는 `src/main/ipc/workspace.ts`의
// `composeDocsFromFileStats` 헬퍼로 이식됐다. 헬퍼는 `LocalScannerDriver.scanDocs(FileStat)`
// 스트림 + Doc composition(parseFrontmatter · classifyAsset 활용)을 조합해 transport 경유를
// 보장한다. 이로써 SSH transport 도입 시 동일 헬퍼를 재사용할 수 있다.
