export type ThemeType = 'light' | 'dark' | 'system'
export type TerminalType = 'Terminal' | 'iTerm2' | 'Ghostty'
export type ProjectOpenerId =
  | 'vscode'
  | 'cursor'
  | 'finder'
  | 'terminal'
  | 'iterm2'
  | 'ghostty'
  | 'xcode'
  | 'intellij'
export type ViewMode = 'all' | 'inbox' | 'project'
export type SortOrder = 'recent' | 'name' | 'count'
export type ViewLayout = 'grid' | 'list'
// container: 루트 하위의 프로젝트들을 depth 2까지 스캔
// single: 루트 자체를 1개의 프로젝트로 등록 (하위 스캔 안 함)
export type WorkspaceMode = 'container' | 'single'

// Transport 구분 — M1 에서는 'local' 만. M3 SSH 착수 시 SshTransportConfig 변형 추가.
/**
 * M3 S3 — Workspace transport 타입 확장 (Design §2.3).
 * SSH 변형은 host/port/user + 인증 방식 + TOFU fingerprint 를 포함.
 * 키 내용은 저장 금지 — 경로만 (DC-4 · Design §4.3).
 */
export type SshAuthConfig =
  | { kind: 'agent' }
  | { kind: 'key-file'; path: string }

export type WorkspaceTransport =
  | { type: 'local' }
  | {
      type: 'ssh'
      host: string
      port: number
      user: string
      auth: SshAuthConfig
      /** TOFU 시 저장된 SHA256 fingerprint — hostKeyDb 와 중복이나 UI 디스플레이 용 */
      hostKeyFingerprint?: string
    }

export interface Workspace {
  id: string
  name: string
  root: string
  mode: WorkspaceMode
  // M1 (2026-04-21): lazy 마이그레이션 — 기존 저장된 workspace 엔트리는 이 필드가 없을 수 있다.
  // store 로드 시 { type: 'local' } 로 주입한다.
  transport: WorkspaceTransport
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

export interface GitPulseCommit {
  hash: string
  subject: string
  author?: string
  relativeTime?: string
}

export interface GitPulseSummary {
  available: boolean
  reason?: 'not-git' | 'ssh-unsupported' | 'timeout' | 'error'
  branch?: string
  head?: string
  dirtyCount?: number
  recentCommitCount?: number
  changedFileCount?: number
  changedFiles?: string[]
  changedAreas?: string[]
  latestTag?: string
  commits?: GitPulseCommit[]
  cachedAt?: number
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
  // 바이트 크기. scanner가 stat 시 채움. ImageViewer 푸터에서 사용.
  size?: number
  frontmatter?: DocFrontmatter
}

export interface ReadDocResult {
  content: string
  rawContent?: string
  mtime: number
  frontmatter?: Record<string, unknown>
}

export interface FsCreateMarkdownInput {
  projectRoot: string
  dirPath: string
  name: string
}

export interface FsCreateFolderInput {
  projectRoot: string
  dirPath: string
  name: string
}

export interface FsRenameInput {
  projectRoot: string
  path: string
  newName: string
}

export interface FsTrashInput {
  projectRoot: string
  path: string
}

export interface FsEntryResult {
  path: string
  name: string
  mtime?: number
  size?: number
  frontmatter?: DocFrontmatter
}

export interface SearchResult {
  path: string
  projectId: string
  title: string
  snippet: string
  score: number
}

export interface SearchQueryInput {
  query: string
  limit: number
  projectIds?: string[]
}

export interface FsChangeEvent {
  type: 'add' | 'change' | 'unlink'
  path: string
  frontmatter?: DocFrontmatter
  // 바이트 크기. add/change 시 watcher가 stat으로 채워 Doc.size 갱신에 사용.
  // unlink 또는 stat 실패 시 undefined.
  size?: number
  // 'add' incremental 반영을 위한 부가 필드.
  // renderer 가 fresh scan 없이 Doc 객체를 즉시 조립할 수 있도록 main 이 채운다.
  // projectId 미해석(active workspace 밖 등) 시 undefined — renderer 는 이때 add 무시.
  mtime?: number
  name?: string
  projectId?: string
}

// Drift Verifier — 단일 진실 공급원은 src/lib/drift/types.ts.
// preload는 순수 type 파일만 import 후 re-export 하므로 런타임 의존 없음 (순환 안전).
import type {
  DriftStatus,
  VerifiedReference,
  DriftReport,
  Reference,
  ReferenceKind,
} from '../lib/drift/types'
export type { DriftStatus, VerifiedReference, DriftReport, Reference, ReferenceKind }

export interface ClaudeCheckResult {
  available: boolean
  version?: string
}

export interface ClaudeOpenResult {
  ok: boolean
  reason?: string
}

export interface ProjectOpenerInfo {
  id: ProjectOpenerId
  label: string
  available: boolean
}

export interface ProjectOpenResult {
  ok: boolean
  reason?: string
}

export type UpdateCheckStatus = 'update-available' | 'up-to-date' | 'error'

export interface UpdateCheckResult {
  status: UpdateCheckStatus
  currentVersion: string
  checkedAt: number
  latestVersion?: string
  releaseName?: string
  releaseUrl?: string
  releaseNotes?: string
  downloadUrl?: string
  reason?: string
}

// Composer — 선택 paths 토큰 추정만 main 프로세스가 담당.
// 복사는 renderer에서 `@<path>` 문자열을 직접 조립 후 navigator.clipboard.
export interface ComposerEstimate {
  bytes: number
  estimatedTokens: number
  missing: string[] // workspace 밖이거나 stat 실패한 경로
}

/**
 * M3 S2 — SSH 상태 전이 어휘 (DC-3). 고정 3종: connected · connecting · offline.
 * pool 미사용/로컬 워크스페이스 상태는 idle 로 표시하지 않고 UI 에서 TransportBadge 자체를 숨긴다.
 */
export type TransportStatus = 'connected' | 'connecting' | 'offline'

/**
 * M3 S2 — TOFU 모달 payload. main hostVerifier 가 renderer 에 보내는 정보.
 * DC-4: 사용자 응답은 반드시 nonce 로 라우팅 (race/timeout 방어).
 */
export interface HostKeyPromptPayload {
  nonce: string
  host: string
  port: number
  /** 알려진 경우 알고리즘 (v1.0 handshake 사후 갱신이 어려우므로 주로 'unknown' 으로 도착) */
  algorithm: string
  /** SHA256 fingerprint — base64, no trailing '='. 현대 OpenSSH 표준 */
  sha256: string
  /** MD5 legacy hex (옵션, fold-out 표시용) */
  md5?: string
  /**
   * 연결 타입: 'trust-new' (최초) | 'mismatch' (저장 fingerprint 와 다름, bypass 불가)
   * 'mismatch' 일 때는 UI 가 bypass 버튼을 노출하지 않고 "Remove & re-trust" 플로우만 허용.
   */
  kind: 'trust-new' | 'mismatch'
  /** mismatch 시 저장된 기존 sha256 (UI 에 "Expected vs Received" 노출용) */
  expectedSha256?: string
  /** workspace id — renderer 가 store 전이·라우팅에 사용 */
  workspaceId: string
}

/**
 * Follow-up FS5 — ~/.ssh/config 파싱 결과 payload. main loadSshConfig() 그대로 전달.
 * renderer 의 SshWorkspaceAddModal 이 dropdown 옵션으로 소비.
 */
export interface SshConfigHost {
  alias: string
  hostname?: string
  port?: number
  user?: string
  identityFile?: string[]
  identitiesOnly?: boolean
  proxyJump?: string
  serverAliveInterval?: number
  serverAliveCountMax?: number
  rejectedReason?: string
}

export interface LoadSshConfigResult {
  configPath: string
  exists: boolean
  permissionWarning?: string
  hosts: SshConfigHost[]
  rejected: Array<{ alias: string; reason: string }>
}

/** Follow-up FS9 — 원격 폴더 탐색 결과 (picker 용). */
export interface SshBrowseFolderResult {
  path: string
  parent: string | null
  entries: { name: string; isDirectory: boolean }[]
}

/**
 * v0.4 S7 — Annotation sidecar JSON payload.
 * renderer 의 AnnotationFile 과 동일 shape (zod 스키마는 main/security/validators.ts).
 */
export interface AnnotationTextQuoteSelectorPayload {
  type: 'TextQuote'
  exact: string
  prefix?: string
  suffix?: string
}

export interface AnnotationPayload {
  id: string
  selector: AnnotationTextQuoteSelectorPayload
  positionFallback?: { start: number; end: number }
  color: 'yellow'
  createdAt: string
}

export interface AnnotationFilePayload {
  version: 1
  annotations: AnnotationPayload[]
}

/** M3 S2 — transport:status 이벤트 payload */
export interface TransportStatusEvent {
  workspaceId: string
  status: TransportStatus
  /** 보충 라벨 (e.g. 호스트명) — aria-live 낭독 문구에 활용 */
  label?: string
  /** reconnect attempt (connecting 시) */
  attempt?: number
  /** 다음 재시도까지 ms (connecting+backoff 시) */
  nextDelayMs?: number
}

// window.api 타입 정의 (renderer에서 사용)
export interface WindowApi {
  workspace: {
    list: () => Promise<Workspace[]>
    add: (root: string) => Promise<Workspace>
    /** M3 S4 — SSH workspace 등록. feature flag on 필수. TOFU 모달 플로우 자동 진입. */
    addSsh: (input: {
      name: string
      host: string
      port: number
      user: string
      auth: SshAuthConfig
      /** 원격 workspace root (POSIX 절대경로, depth ≥ 2 필수 — 예: `/home/user/projects`) */
      root: string
      /** Follow-up FS8 — container(depth 2 스캔) | single(root 자체를 단일 프로젝트). 기본 single (속도 우선) */
      mode?: WorkspaceMode
    }) => Promise<Workspace>
    remove: (id: string) => Promise<void>
    scan: (workspaceId: string) => Promise<Project[]>
    refresh: (workspaceId: string) => Promise<Project[]>
  }
  project: {
    /**
     * `opts.force === true` 면 main 의 docsCache 를 무시하고 fresh scan 을 강제한다.
     * 명시 새로고침(⌘R / Sidebar 버튼) 또는 fs:project-change 자동 새로고침 시 사용.
     * 첫 진입(refreshKey === 0) 은 force 미지정 → 기존 캐시 hit 유지.
     */
    scanDocs: (projectId: string, opts?: { force?: boolean; workspaceId?: string }) => Promise<Doc[]>
    getDocCount: (projectId: string, opts?: { workspaceId?: string }) => Promise<number>
    gitSummary: (projectRoot: string) => Promise<GitPulseSummary>
    onDocsChunk: (cb: (data: Doc[]) => void) => () => void
  }
  fs: {
    readDoc: (path: string) => Promise<ReadDocResult>
    createMarkdown?: (input: FsCreateMarkdownInput) => Promise<FsEntryResult>
    createFolder?: (input: FsCreateFolderInput) => Promise<FsEntryResult>
    rename?: (input: FsRenameInput) => Promise<FsEntryResult>
    trash?: (input: FsTrashInput) => Promise<FsEntryResult>
    onChange: (cb: (data: FsChangeEvent) => void) => () => void
    onProjectChange: (cb: () => void) => () => void
  }
  drift: {
    verify: (docPath: string, projectRoot: string) => Promise<DriftReport>
  }
  claude: {
    check: () => Promise<ClaudeCheckResult>
    open: (dir: string, terminal: TerminalType) => Promise<ClaudeOpenResult>
  }
  projectOpeners: {
    list: () => Promise<ProjectOpenerInfo[]>
    open: (projectRoot: string, openerId: ProjectOpenerId) => Promise<ProjectOpenResult>
  }
  updates: {
    check: () => Promise<UpdateCheckResult>
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
  /** v0.4 S7 — annotation sidecar JSON. 로컬 .md only. SSH 경로는 main 에서 ANNOTATION_SSH_UNSUPPORTED throw. */
  annotation: {
    load: (path: string) => Promise<AnnotationFilePayload | null>
    save: (path: string, data: AnnotationFilePayload) => Promise<void>
  }
  /** M3 S2 — SSH Transport UI 연동 채널. feature flag off 시 호출 경로 없음. */
  ssh: {
    /** main → renderer: hostKey 확인 요청 (TOFU 또는 mismatch). nonce 로 라우팅 */
    onHostKeyPrompt: (cb: (data: HostKeyPromptPayload) => void) => () => void
    /** renderer → main: 사용자 응답. trust=true 면 연결 허용, false 면 중단. persistence='session' 이면 세션-only 신뢰 */
    respondHostKey: (nonce: string, trust: boolean, persistence?: 'session' | 'permanent') => Promise<void>
    /** S5-7 — SSH 데이터 전체 삭제 (host keys + SSH workspaces). */
    purgeAll: () => Promise<{ removed: number }>
    /** main → renderer: transport 상태 전이 */
    onStatus: (cb: (data: TransportStatusEvent) => void) => () => void
    /** Follow-up FS5 — ~/.ssh/config 호스트 import. feature flag on 필수. */
    loadConfig: () => Promise<LoadSshConfigResult>
    /** Follow-up FS9 — 원격 폴더 탐색 (임시 연결). feature flag on 필수. */
    browseFolder: (input: {
      host: string
      port: number
      user: string
      auth: SshAuthConfig
      path: string
    }) => Promise<SshBrowseFolderResult>
    /** Follow-up FS9-B — 원격 이미지 바이너리 fetch. MarkdownViewer SshImage 가 호출. */
    readImage: (input: {
      workspaceId: string
      path: string
    }) => Promise<{ data: Buffer; mime: string }>
  }
}

declare global {
  interface Window {
    api: WindowApi
  }
}
