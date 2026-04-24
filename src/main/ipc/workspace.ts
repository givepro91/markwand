import { dialog, ipcMain, BrowserWindow } from 'electron'
import { randomUUID, createHash } from 'crypto'
import path from 'path'
import posix from 'node:path/posix'
import { getStore } from '../services/store'
import { scanProjects, parseFrontmatter, HEADER_READ_BYTES } from '../services/scanner'
import { localTransport } from '../transport/local'
import type { Transport, FileStat } from '../transport/types'
import { VIEWABLE_GLOB, classifyAsset } from '../../lib/viewable'
import { setProtocolWorkspaceRoots } from '../security/protocol'
import { addWatchRoots, removeWatchRoot } from '../services/watcher'
import {
  parseScanInput,
  parseScanDocsInput,
  parseWorkspaceRemoveInput,
  parseWorkspaceAddSshInput,
} from '../security/validators'
import { isSshTransportEnabled } from '../services/store'
import { createSshTransport, computeSshTransportId, computeSshWorkspaceId } from '../transport/ssh'
import type { SshTransport } from '../transport/ssh'
import type { PromisifiedSftp } from '../transport/ssh/util/promisifiedSftp'
import { getActiveTransport } from '../transport/resolve'
import { removeHostKey } from '../transport/ssh/hostKeyDb'
import { dispose as disposeTransport } from '../transport/pool'
import type { Workspace, Project, Doc, WorkspaceMode } from '../../preload/types'

// LocalScannerDriver.countDocs 가 patterns/ignore 를 받도록 설계 (§2.2 rev. M1). 기존
// scanner.ts 의 SCAN_IGNORE_PATTERNS 상수와 동일 내용을 여기에 선언 — 향후 M3 SSH에서도
// 동일 ignore 집합을 원격 scanner 에 전달할 수 있도록 IPC 레이어에서 정책을 잡는다.
const WORKSPACE_SCAN_IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/__fixtures__/**',  // 테스트 fixture 디렉토리 — 실 Doc 아님, 워크스페이스 뷰/필터/drift 대상 제외
  '**/__snapshots__/**', // vitest 스냅샷
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

// Follow-up FS7 — app:// 프로토콜 allowlist 는 로컬 워크스페이스 root 만.
// SSH workspace root (POSIX remote path) 가 포함되면 Chromium 이 app:// 요청을 로컬
// file:// 로 fallthrough 시도해 500 HANDLER_EXCEPTION 발생. 로컬만 allowlist 하면
// SSH 이미지는 403 + SafeImage alt placeholder 로 정상 fallback.
// export 되어 main/index.ts 초기화 경로도 동일 필터 적용.
export function getLocalWorkspaceRoots(workspaces: Workspace[]): string[] {
  return workspaces
    .filter((w) => !w.transport || w.transport.type === 'local')
    .map((w) => w.root)
}

function getWorkspaceRoots(workspaces: Workspace[]): string[] {
  return getLocalWorkspaceRoots(workspaces)
}

/**
 * Transport-agnostic Doc composition — M3 §S0.2 RM-7 해소 + Follow-up FS7 병렬화.
 *
 * `ScannerDriver.scanDocs` 가 반환하는 FileStat 스트림을 기반으로 Doc 객체를 구성한다.
 * 이미지는 frontmatter 불필요 — stat 만으로 Doc 조립. md 파일은 `parseFrontmatter` 경유
 * (FsDriver 를 통해 transport 추상화). FS7: 원격(SSH) 환경에서 각 md 파일의 frontmatter 읽기가
 * SFTP readStream 왕복을 유발하므로, chunkSize 단위로 **Promise.all 병렬 처리** 해 RTT 곱 효과
 * 제거. 로컬도 병렬 I/O 로 손해 없음(fs.createReadStream 는 비동기).
 */
export async function* composeDocsFromFileStats(
  transport: Transport,
  projectId: string,
  projectRoot: string,
  chunkSize = 50
): AsyncGenerator<Doc[]> {
  let pending: { stat: FileStat; doc: Doc }[] = []

  async function flushPending(): Promise<Doc[]> {
    const batch = pending
    pending = []
    // 병렬 parseFrontmatter — RTT × N 을 RTT × ceil(N/concurrency) 로 축소.
    // SSH RTT 50ms · 50개 기준: 2500ms → ~250ms 추정.
    await Promise.all(
      batch.map(async ({ stat, doc }) => {
        if (classifyAsset(stat.path) !== 'md') return
        try {
          const fm = await parseFrontmatter(transport.fs, stat.path, {
            maxBytes: HEADER_READ_BYTES,
          })
          if (fm !== undefined) doc.frontmatter = fm
        } catch {
          // 개별 파일 실패는 silent skip — 다른 파일 진행 유지.
        }
      }),
    )
    return batch.map((b) => b.doc)
  }

  for await (const stat of transport.scanner.scanDocs(
    projectRoot,
    [VIEWABLE_GLOB],
    WORKSPACE_SCAN_IGNORE_PATTERNS
  )) {
    const doc: Doc = {
      path: stat.path,
      projectId,
      name: path.basename(stat.path),
      mtime: stat.mtimeMs > 0 ? stat.mtimeMs : Date.now(),
    }
    if (stat.size !== undefined) doc.size = stat.size
    pending.push({ stat, doc })
    if (pending.length >= chunkSize) {
      yield await flushPending()
    }
  }
  if (pending.length > 0) yield await flushPending()
}

// scanProjects 결과 캐시 + in-flight 중복 방지.
// renderer의 여러 뷰가 동시에 workspace.scan / project.scan-docs를 호출해도
// 같은 워크스페이스에 대한 scanProjects는 한 번만 실제 실행된다.
const projectsCache = new Map<string, Project[]>()
const inflightScans = new Map<string, Promise<Project[]>>()

// Follow-up FS7 — project:scan-docs 결과 캐시.
// renderer 가 같은 프로젝트를 재열람 시 SSH SFTP 왕복 재실행 방지.
// invalidation: workspace 제거 / refresh / watcher fs:change 이벤트.
const docsCache = new Map<string, Doc[]>()
const inflightDocScans = new Map<string, Promise<Doc[]>>()
// projectId → workspaceId 역매핑. watcher fs:change 로 프로젝트 캐시 무효화 시 필요.
const projectToWorkspace = new Map<string, string>()

function invalidateProjectsCache(workspaceId?: string): void {
  if (workspaceId) {
    projectsCache.delete(workspaceId)
    inflightScans.delete(workspaceId)
    // 해당 workspace 의 docs 캐시도 전부 무효화
    for (const [pid, wsId] of projectToWorkspace) {
      if (wsId === workspaceId) {
        docsCache.delete(pid)
        inflightDocScans.delete(pid)
        projectToWorkspace.delete(pid)
      }
    }
  } else {
    projectsCache.clear()
    inflightScans.clear()
    docsCache.clear()
    inflightDocScans.clear()
    projectToWorkspace.clear()
  }
}

// Follow-up FS7 — 단일 파일 변경 시 프로젝트 docs 캐시만 무효화 (watcher 배선 시 호출).
export function invalidateDocsCacheForProject(projectId: string): void {
  docsCache.delete(projectId)
  inflightDocScans.delete(projectId)
}

async function getOrScanProjects(
  workspaceId: string,
  root: string,
  mode: WorkspaceMode
): Promise<Project[]> {
  const cached = projectsCache.get(workspaceId)
  if (cached) return cached
  const inflight = inflightScans.get(workspaceId)
  if (inflight) return inflight

  const t0 = Date.now()
  const isSsh = workspaceId.startsWith('ssh:')
  const scanPromise = isSsh
    ? scanProjectsSsh(workspaceId, root, mode)
    : scanProjects(workspaceId, root, mode)
  const promise = scanPromise
    .then((projects) => {
      projectsCache.set(workspaceId, projects)
      inflightScans.delete(workspaceId)
      console.log(`[ipc] scanProjects(${workspaceId.slice(0, 8)}, ${mode}, ${isSsh ? 'ssh' : 'local'}) ${projects.length} projects in ${Date.now() - t0}ms`)
      return projects
    })
    .catch((err) => {
      inflightScans.delete(workspaceId)
      throw err
    })
  inflightScans.set(workspaceId, promise)
  return promise
}

// Follow-up FS0 — SSH workspace 의 프로젝트 목록 스캔. 로컬 scanProjects 와 달리 SFTP readdir
// 로 depth 2 까지 탐색. 기존 scanProjects 는 손대지 않는다(로컬 회귀 0 우선 — Plan D-2).
//
// SFTP 왕복 비용: RTT 50ms × (1 root + N subdir) 추정. docCount 는 sentinel -1 유지.
const SSH_PROJECT_MARKERS = [
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'CLAUDE.md',
  '.git',
  'README.md',
  'Makefile',
]

// 로컬 scanner.ts PROJECT_SCAN_IGNORE 의 **의도적 슈퍼셋** — D-2 트레이드오프.
// 로컬 대비 `__fixtures__`, `__snapshots__` 추가 포함: 원격 fixture/snapshot 디렉토리를 프로젝트
// 마커 탐색 대상에서 제외해 원격 테스트 자산이 사용자 프로젝트로 오인되는 경우를 방지.
// 로컬과 완전 동일 집합이 아님을 주석으로 명시 (Evaluator M-2).
const SSH_PROJECT_SCAN_IGNORE = new Set([
  'node_modules', 'dist', 'build', 'out', 'target', 'vendor', 'coverage',
  '__pycache__', '__fixtures__', '__snapshots__',
  '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache', '.venv',
])

// SFTP attrs.mode S_IFMT bits — 로컬 SshScannerDriver 와 동일.
const S_IFMT = 0o170000
const S_IFDIR = 0o040000
function isDirFromMode(mode: number): boolean {
  return (mode & S_IFMT) === S_IFDIR
}

function makeSshProjectId(rootPosixPath: string): string {
  return createHash('sha1').update(rootPosixPath).digest('hex').slice(0, 16)
}

export async function scanProjectsSsh(
  workspaceId: string,
  root: string,
  mode: WorkspaceMode
): Promise<Project[]> {
  const transport = await getActiveTransport(workspaceId)
  if (transport.kind !== 'ssh') {
    throw new Error('SSH_TRANSPORT_EXPECTED')
  }
  const sshTransport = transport as SshTransport
  const sftp = sshTransport.client.getSftp()
  return scanProjectsViaSftp(sftp, workspaceId, root, mode)
}

// 테스트 가능 헬퍼 — PromisifiedSftp 만 받는 순수 함수. scanProjectsSsh 는 이 위에 transport 해석만 얹음.
export async function scanProjectsViaSftp(
  sftp: PromisifiedSftp,
  workspaceId: string,
  root: string,
  mode: WorkspaceMode
): Promise<Project[]> {
  if (mode === 'single') {
    const markers = await findSshMarkers(sftp, root)
    return [makeSshProject(workspaceId, root, markers)]
  }

  const projects: Project[] = []

  async function walk(dirPath: string, depth: number): Promise<void> {
    if (depth > 2) return

    let entries
    try {
      entries = await sftp.readdir(dirPath)
    } catch {
      return
    }

    if (depth > 0) {
      const markers = await findSshMarkers(sftp, dirPath)
      if (markers.length > 0) {
        projects.push(makeSshProject(workspaceId, dirPath, markers))
        return
      }
    }

    const subdirs = entries.filter(
      (e) => isDirFromMode(e.attrs.mode) && !SSH_PROJECT_SCAN_IGNORE.has(e.filename)
    )
    for (const sub of subdirs) {
      await walk(posix.join(dirPath, sub.filename), depth + 1)
    }
  }

  await walk(root, 0)
  return projects
}

async function findSshMarkers(
  sftp: PromisifiedSftp,
  dirPath: string
): Promise<string[]> {
  let entries
  try {
    entries = await sftp.readdir(dirPath)
  } catch {
    return []
  }
  const names = new Set(entries.map((e) => e.filename))
  return SSH_PROJECT_MARKERS.filter((m) => names.has(m))
}

function makeSshProject(
  workspaceId: string,
  rootPosixPath: string,
  markers: string[]
): Project {
  return {
    id: makeSshProjectId(rootPosixPath),
    workspaceId,
    name: posix.basename(rootPosixPath) || rootPosixPath,
    root: rootPosixPath,
    markers,
    docCount: -1,
    lastModified: 0, // SFTP attrs.mtime 은 readdir 에서만 — 루트는 skip (countDocs IPC 에서 갱신 안 함)
  }
}

export function registerWorkspaceHandlers(): void {
  ipcMain.handle('workspace:list', async () => {
    const store = await getStore()
    return store.get('workspaces')
  })

  ipcMain.handle('workspace:add', async (event) => {
    // dialog.showOpenDialog는 입력값이 없으므로 zod 검증 불필요
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow()!
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: '워크스페이스 폴더 선택',
    })

    if (result.canceled || result.filePaths.length === 0) {
      throw new Error('DIALOG_CANCELED')
    }

    const root = result.filePaths[0]
    const store = await getStore()
    const workspaces = store.get('workspaces')
    const basename = path.basename(root)

    // 중복 등록 방지 — mode 충돌 오판을 피하기 위해 showMessageBox 모드 선택 전에 체크.
    // 기존 항목을 그대로 반환하되, 기존에 어떤 모드로 등록됐는지 알려준다.
    const existing = workspaces.find((w) => w.root === root)
    if (existing) {
      const existingMode = existing.mode === 'single' ? '단독 프로젝트' : '컨테이너'
      await dialog.showMessageBox(win, {
        type: 'info',
        title: '이미 등록된 워크스페이스',
        message: `"${basename}" 은(는) 이미 ${existingMode} 모드로 등록되어 있습니다.`,
        detail: '모드를 바꾸려면 먼저 기존 워크스페이스를 제거한 뒤 다시 추가해주세요.',
        buttons: ['확인'],
        defaultId: 0,
      })
      return existing
    }

    // 하위 1depth에 프로젝트 마커 폴더가 있으면 container, 없으면 single 추천.
    // swk처럼 루트 CLAUDE.md + 하위 repo 조합은 container로 자동 분류된다.
    const suggested = await localTransport.scanner.detectWorkspaceMode(root)
    const choice = await dialog.showMessageBox(win, {
      type: 'question',
      title: '추가 방식 선택',
      message: `"${basename}" 을(를) 어떻게 추가할까요?`,
      detail:
        suggested === 'container'
          ? '하위에 프로젝트 폴더가 감지되어 컨테이너 모드를 추천합니다.\n\n· 컨테이너: 하위 프로젝트들을 depth 2까지 자동 스캔합니다.\n· 단독 프로젝트: 이 폴더 자체를 1개 프로젝트로 등록합니다.'
          : '하위에서 프로젝트가 감지되지 않아 단독 모드를 추천합니다.\n\n· 컨테이너: 하위 프로젝트들을 depth 2까지 자동 스캔합니다.\n· 단독 프로젝트: 이 폴더 자체를 1개 프로젝트로 등록합니다.',
      buttons: ['컨테이너(하위 스캔)', '단독 프로젝트', '취소'],
      defaultId: suggested === 'container' ? 0 : 1,
      cancelId: 2,
    })

    if (choice.response === 2) {
      throw new Error('DIALOG_CANCELED')
    }
    const mode: WorkspaceMode = choice.response === 0 ? 'container' : 'single'

    const workspace: Workspace = {
      id: randomUUID(),
      name: basename,
      root,
      mode,
      transport: { type: 'local' },
      addedAt: Date.now(),
      lastOpened: null,
    }

    const updated = [...workspaces, workspace]
    store.set('workspaces', updated)

    // 프로토콜 allowlist 갱신
    setProtocolWorkspaceRoots(getWorkspaceRoots(updated))

    // v0.3.0-beta.9 — 신규 로컬 워크스페이스 root 를 watcher 에 동적 등록.
    // watcher 가 아직 기동 전이면 webContents 를 넘겨 startWatcher 가 내부 기동.
    addWatchRoots([root], event.sender)

    return workspace
  })

  // M3 S4 Evaluator M-3 MVP — SSH workspace 등록 경로.
  // feature flag off 시 거부. TOFU 플로우는 createSshTransport 내부에서 자동 처리 (bridge 모달).
  // 연결 성공 시 workspace 엔트리 저장 + SshTransport 는 pool 에 그대로 유지(dispose 안 함).
  ipcMain.handle('workspace:add-ssh', async (_event, raw: unknown) => {
    if (!(await isSshTransportEnabled())) {
      throw new Error('SSH_TRANSPORT_DISABLED')
    }
    const input = parseWorkspaceAddSshInput(raw)
    // FS9-C — workspace id 는 root 포함. 같은 서버의 다른 폴더를 별개 workspace 로 등록 가능.
    // computeSshTransportId 는 pool 내부 연결 재사용용으로 유지 (v1.1+ 최적화 여지).
    void computeSshTransportId
    const id = `ssh:${computeSshWorkspaceId(input.user, input.host, input.port, input.root)}`
    const store = await getStore()
    const workspaces = store.get('workspaces')
    if (workspaces.find((w) => w.id === id)) {
      throw new Error('SSH_WORKSPACE_ALREADY_EXISTS')
    }

    // 연결 시도 — TOFU 모달 renderer 에서 응답 대기. 연결 실패 시 throw → 사용자 UI 에서 에러 표시.
    const transport = await createSshTransport({
      host: input.host,
      port: input.port,
      username: input.user,
      auth: input.auth,
      // hostVerifier 생략 — bridge 기본 경로로 TOFU 자동 트리거.
    })

    // Follow-up FS8 — mode 를 사용자가 선택 (기본 single). 속도 우선 원격 환경에선 container 는
    // 신중하게 선택 (depth 2 스캔으로 RTT × N 프로젝트 비용 큼). 명시 요청 시에만 container.
    const mode: WorkspaceMode = input.mode

    const workspace: Workspace = {
      id,
      name: input.name,
      root: input.root,
      mode,
      transport: {
        type: 'ssh',
        host: input.host,
        port: input.port,
        user: input.user,
        auth: input.auth,
        hostKeyFingerprint: transport.client.acceptedHostKey?.sha256,
      },
      addedAt: Date.now(),
      lastOpened: null,
    }
    store.set('workspaces', [...workspaces, workspace])
    return workspace
  })

  ipcMain.handle('workspace:remove', async (_event, raw: unknown) => {
    const { id } = parseWorkspaceRemoveInput(raw)
    const store = await getStore()
    const workspaces = store.get('workspaces')

    const target = workspaces.find((w) => w.id === id)
    if (!target) return

    const updated = workspaces.filter((w) => w.id !== id)
    store.set('workspaces', updated)

    setProtocolWorkspaceRoots(getWorkspaceRoots(updated))
    // v0.3.0-beta.9 — 로컬 워크스페이스만 watcher 에서 해제 (SSH 는 watcher 대상 아님).
    if (!target.transport || target.transport.type === 'local') {
      removeWatchRoot(target.root)
    }
    // S5-1 — SSH 워크스페이스 제거 시 host key 삭제 (GDPR) + pool transport 해제.
    if (target.transport?.type === 'ssh') {
      await removeHostKey(target.id).catch(() => undefined)
      await disposeTransport(target.id).catch(() => undefined)
    }
    invalidateProjectsCache()  // 전체 캐시 무효화 (단일 id 한정 시 stale 위험)
  })

  ipcMain.handle('workspace:scan', async (_event, raw: unknown) => {
    const { workspaceId } = parseScanInput(raw)
    const store = await getStore()
    const workspaces = store.get('workspaces')
    const workspace = workspaces.find((w) => w.id === workspaceId)
    if (!workspace) throw new Error('WORKSPACE_NOT_FOUND')

    return getOrScanProjects(workspaceId, workspace.root, workspace.mode ?? 'container')
  })

  // 명시적 새로고침 — 캐시 무효화 후 재스캔. chokidar disable 상태에서 파일 변경 동기화 수단.
  ipcMain.handle('workspace:refresh', async (_event, raw: unknown) => {
    const { workspaceId } = parseScanInput(raw)
    invalidateProjectsCache(workspaceId)
    const store = await getStore()
    const workspaces = store.get('workspaces')
    const workspace = workspaces.find((w) => w.id === workspaceId)
    if (!workspace) throw new Error('WORKSPACE_NOT_FOUND')
    return getOrScanProjects(workspaceId, workspace.root, workspace.mode ?? 'container')
  })

  ipcMain.handle('project:get-doc-count', async (_event, raw: unknown) => {
    const { projectId } = parseScanDocsInput(raw)

    // Follow-up FS7 — docsCache 에 이미 있으면 SSH 왕복 없이 length 만 반환.
    const cachedDocs = docsCache.get(projectId)
    if (cachedDocs) return cachedDocs.length

    const store = await getStore()
    const workspaces = store.get('workspaces')
    let projectRoot: string | null = null
    let hostWsId: string | null = null
    for (const ws of workspaces) {
      const projects = await getOrScanProjects(ws.id, ws.root, ws.mode ?? 'container')
      const found = projects.find((p) => p.id === projectId)
      if (found) {
        projectRoot = found.root
        hostWsId = ws.id
        break
      }
    }
    if (!projectRoot || !hostWsId) return 0
    const transport = await getActiveTransport(hostWsId)
    return transport.scanner.countDocs(projectRoot, [VIEWABLE_GLOB], WORKSPACE_SCAN_IGNORE_PATTERNS)
  })

  ipcMain.handle('project:scan-docs', async (event, raw: unknown) => {
    const { projectId } = parseScanDocsInput(raw)

    // Follow-up FS7 — 캐시 hit: 기존 chunk 를 한 번에 전송 + 캐시 그대로 반환.
    // SSH 에서는 이 경로가 핵심 속도 향상 (수 초 → 즉시).
    const cached = docsCache.get(projectId)
    if (cached) {
      event.sender.send('project:docs-chunk', cached)
      console.log(`[ipc] project:scan-docs(${projectId.slice(0, 8)}) CACHED ${cached.length} docs`)
      return cached
    }
    const inflight = inflightDocScans.get(projectId)
    if (inflight) {
      // 동시 호출: 기존 promise 결과를 공유 — 다만 chunk 이벤트는 중복 전송 안 됨 (최적화 가치 낮음).
      const docs = await inflight
      event.sender.send('project:docs-chunk', docs)
      return docs
    }

    const store = await getStore()
    const workspaces = store.get('workspaces')

    // 캐시된 scanProjects 결과를 활용해 projectRoot를 찾는다.
    let projectRoot: string | null = null
    let hostWsId: string | null = null
    for (const ws of workspaces) {
      const projects = await getOrScanProjects(ws.id, ws.root, ws.mode ?? 'container')
      const found = projects.find((p) => p.id === projectId)
      if (found) {
        projectRoot = found.root
        hostWsId = ws.id
        break
      }
    }

    if (!projectRoot || !hostWsId) throw new Error('PROJECT_NOT_FOUND')
    projectToWorkspace.set(projectId, hostWsId)

    const transport = await getActiveTransport(hostWsId)

    const t0 = Date.now()
    const runScan = (async () => {
      const allDocs: Doc[] = []
      for await (const chunk of composeDocsFromFileStats(transport, projectId, projectRoot)) {
        event.sender.send('project:docs-chunk', chunk)
        allDocs.push(...chunk)
      }
      docsCache.set(projectId, allDocs)
      inflightDocScans.delete(projectId)
      console.log(`[ipc] project:scan-docs(${projectId.slice(0, 8)}, ${transport.kind}) ${allDocs.length} docs in ${Date.now() - t0}ms`)
      return allDocs
    })().catch((err) => {
      inflightDocScans.delete(projectId)
      throw err
    })
    inflightDocScans.set(projectId, runScan)
    return runScan
  })
}
