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

export interface DocFrontmatter {
  tags?: string[]
  status?: string
  updated?: number
  source?: 'claude' | 'codex' | 'design' | 'review' | string
  [k: string]: unknown
}

export interface Doc {
  path: string
  projectId: string
  name: string
  mtime: number
  frontmatter?: DocFrontmatter
}

export interface ReadDocResult {
  content: string
  mtime: number
  frontmatter?: Record<string, unknown>
}

export interface FsChangeEvent {
  type: 'add' | 'change' | 'unlink'
  path: string
  frontmatter?: DocFrontmatter
}

export interface ClaudeCheckResult {
  available: boolean
  version?: string
}

export interface ClaudeOpenResult {
  ok: boolean
  reason?: string
}

// Composer — 선택 paths 토큰 추정만 main 프로세스가 담당.
// 복사는 renderer에서 `@<path>` 문자열을 직접 조립 후 navigator.clipboard.
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
