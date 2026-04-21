export type ThemeType = 'light' | 'dark' | 'system'
export type TerminalType = 'Terminal' | 'iTerm2' | 'Ghostty'
export type ViewMode = 'all' | 'inbox' | 'project'
export type SortOrder = 'recent' | 'name' | 'count'
export type ViewLayout = 'grid' | 'list'
// container: 루트 하위의 프로젝트들을 depth 2까지 스캔
// single: 루트 자체를 1개의 프로젝트로 등록 (하위 스캔 안 함)
export type WorkspaceMode = 'container' | 'single'

// Transport 구분 — M1 에서는 'local' 만. M3 SSH 착수 시 SshTransportConfig 변형 추가.
export type WorkspaceTransport = { type: 'local' }

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
  mtime: number
  frontmatter?: Record<string, unknown>
}

export interface FsChangeEvent {
  type: 'add' | 'change' | 'unlink'
  path: string
  frontmatter?: DocFrontmatter
  // 바이트 크기. add/change 시 watcher가 stat으로 채워 Doc.size 갱신에 사용.
  // unlink 또는 stat 실패 시 undefined.
  size?: number
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
    remove: (id: string) => Promise<void>
    scan: (workspaceId: string) => Promise<Project[]>
    refresh: (workspaceId: string) => Promise<Project[]>
  }
  project: {
    scanDocs: (projectId: string) => Promise<Doc[]>
    getDocCount: (projectId: string) => Promise<number>
    onDocsChunk: (cb: (data: Doc[]) => void) => () => void
  }
  fs: {
    readDoc: (path: string) => Promise<ReadDocResult>
    onChange: (cb: (data: FsChangeEvent) => void) => () => void
  }
  drift: {
    verify: (docPath: string, projectRoot: string) => Promise<DriftReport>
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
  /** M3 S2 — SSH Transport UI 연동 채널. feature flag off 시 호출 경로 없음. */
  ssh: {
    /** main → renderer: hostKey 확인 요청 (TOFU 또는 mismatch). nonce 로 라우팅 */
    onHostKeyPrompt: (cb: (data: HostKeyPromptPayload) => void) => () => void
    /** renderer → main: 사용자 응답. trust=true 면 연결 허용, false 면 중단 */
    respondHostKey: (nonce: string, trust: boolean) => Promise<void>
    /** main → renderer: transport 상태 전이 */
    onStatus: (cb: (data: TransportStatusEvent) => void) => () => void
  }
}

declare global {
  interface Window {
    api: WindowApi
  }
}
