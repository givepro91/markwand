export type ThemeType = 'light' | 'dark' | 'system'
export type TerminalType = 'Terminal' | 'iTerm2' | 'Ghostty'
export type ViewMode = 'all' | 'inbox' | 'project'
export type SortOrder = 'recent' | 'name' | 'count'
export type ViewLayout = 'grid' | 'list'
// container: 루트 하위의 프로젝트들을 depth 2까지 스캔
// single: 루트 자체를 1개의 프로젝트로 등록 (하위 스캔 안 함)
export type WorkspaceMode = 'container' | 'single'

export interface Workspace {
  id: string
  name: string
  root: string
  mode: WorkspaceMode
  addedAt: number
  lastOpened: number | null
}

export interface Project {
  id: string
  workspaceId: string
  name: string
  root: string
  markers: string[]
  docCount: number
  lastModified: number
}

export interface Doc {
  path: string
  projectId: string
  name: string
  mtime: number
  frontmatter?: Record<string, unknown>
}

export interface ReadDocResult {
  content: string
  mtime: number
  frontmatter?: Record<string, unknown>
}

export interface FsChangeEvent {
  type: 'add' | 'change' | 'unlink'
  path: string
}

export interface ClaudeCheckResult {
  available: boolean
  version?: string
}

export interface ClaudeOpenResult {
  ok: boolean
  reason?: string
}

// Composer — 선택 doc들을 임시 파일로 concat. 자동 런칭 없이 contextFile 경로만 반환.
// Renderer가 clipboard 복사 등으로 활용한다.
export interface ComposerPrepareResult {
  ok: boolean
  contextFile?: string
  reason?: string
}

export interface ComposerEstimate {
  bytes: number
  estimatedTokens: number
  missing: string[] // workspace 밖이거나 stat 실패한 경로
}

// window.api 타입 정의 (renderer에서 사용)
export interface WindowApi {
  workspace: {
    list: () => Promise<Workspace[]>
    add: (root: string) => Promise<Workspace>
    remove: (id: string) => Promise<void>
    scan: (workspaceId: string) => Promise<Project[]>
    refresh: (workspaceId: string) => Promise<Project[]>
  }
  project: {
    scanDocs: (projectId: string) => Promise<Doc[]>
    getDocCount: (projectId: string) => Promise<number>
    onDocsChunk: (cb: (_event: unknown, data: Doc[]) => void) => () => void
  }
  fs: {
    readDoc: (path: string) => Promise<ReadDocResult>
    onChange: (cb: (_event: unknown, data: FsChangeEvent) => void) => () => void
  }
  claude: {
    check: () => Promise<ClaudeCheckResult>
    open: (dir: string, terminal: TerminalType) => Promise<ClaudeOpenResult>
  }
  composer: {
    prepare: (paths: string[]) => Promise<ComposerPrepareResult>
    estimateTokens: (paths: string[]) => Promise<ComposerEstimate>
  }
  shell: {
    openExternal: (url: string) => Promise<void>
    revealInFinder: (path: string) => Promise<void>
  }
  theme: {
    set: (theme: ThemeType) => Promise<void>
  }
  prefs: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<void>
  }
}

declare global {
  interface Window {
    api: WindowApi
  }
}
