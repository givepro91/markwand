import path from 'path'
import posix from 'node:path/posix'
import { z } from 'zod'
import type { ThemeType, TerminalType } from '../../preload/types'

// 공통 상수
const PathInput = z.string().min(1).max(512)
const UuidInput = z.string().uuid()
// projectId는 scanner가 SHA1 hex 16자로 생성한다 (UUID 아님). 길이/문자 제한만 적용.
const ProjectIdInput = z.string().regex(/^[a-f0-9]{8,32}$/, 'INVALID_PROJECT_ID')

// M3 S3 — workspaceId 는 로컬(UUID v4) 또는 SSH(`ssh:<hex16>`). 두 포맷 수용.
const SshWorkspaceIdInput = z.string().regex(/^ssh:[a-f0-9]{16}$/, 'INVALID_SSH_WS_ID')
const WorkspaceIdInput = z.union([UuidInput, SshWorkspaceIdInput])

export const ALLOWED_PREFS_KEYS = new Set([
  'viewMode',
  'theme',
  'sortOrder',
  'terminal',
  'treeExpanded',
  'activeWorkspaceId',
  'readDocs',
  'viewLayout',
  'trackReadDocs',
  'hints.cmdk.seen',
  // Composer (v0.2)
  'composerOnboardingSeen',
  'composerAutoClear',
  'lastSelectedDocPaths',
  // 사이드바 리사이즈 핸들 (v0.3)
  'sidebarWidth',
  // M3 S3: experimental flag. 재시작 후 반영.
  'experimentalFeatures.sshTransport',
])

// ── parse 함수들 ──────────────────────────────────────────────

export function parsePathInput(raw: unknown): string {
  return PathInput.parse(raw)
}

export function parseWorkspaceAddInput(raw: unknown): { root: string } {
  return z.object({ root: PathInput }).parse(raw)
}

export function parseWorkspaceRemoveInput(raw: unknown): { id: string } {
  // M3 S3: 로컬 UUID + SSH(ssh:<hex16>) 양쪽 수용.
  return z.object({ id: WorkspaceIdInput }).parse(raw)
}

export function parseScanInput(raw: unknown): { workspaceId: string } {
  return z.object({ workspaceId: WorkspaceIdInput }).parse(raw)
}

export function parseScanDocsInput(raw: unknown): { projectId: string } {
  return z.object({ projectId: ProjectIdInput }).parse(raw)
}

export function parseReadDocInput(raw: unknown): { path: string } {
  return z.object({ path: PathInput }).parse(raw)
}

export function parseClaudeOpenInput(raw: unknown): { dir: string; terminal: TerminalType } {
  return z
    .object({
      dir: PathInput,
      terminal: z.enum(['Terminal', 'iTerm2', 'Ghostty']),
    })
    .parse(raw) as { dir: string; terminal: TerminalType }
}

export function parseThemeInput(raw: unknown): { theme: ThemeType } {
  return z
    .object({ theme: z.enum(['light', 'dark', 'system']) })
    .parse(raw) as { theme: ThemeType }
}

export function parsePrefsGetInput(raw: unknown): { key: string } {
  const parsed = z.object({ key: z.string().min(1).max(64) }).parse(raw)
  if (!ALLOWED_PREFS_KEYS.has(parsed.key)) {
    throw new Error(`PREFS_KEY_NOT_ALLOWED: ${parsed.key}`)
  }
  return parsed
}

export function parsePrefsSetInput(raw: unknown): { key: string; value: unknown } {
  const schema = z.object({ key: z.string().min(1).max(64), value: z.unknown() })
  const parsed = schema.parse(raw)
  if (!ALLOWED_PREFS_KEYS.has(parsed.key)) {
    throw new Error(`PREFS_KEY_NOT_ALLOWED: ${parsed.key}`)
  }
  return { key: parsed.key, value: parsed.value }
}

export function parseShellShowItemInput(raw: unknown): { path: string } {
  return z.object({ path: PathInput }).parse(raw)
}

// M3 S2 — SSH IPC ─────────────────────────────────────────────
// ssh:respond-host-key. nonce 는 crypto.randomUUID() (36자 UUID).
const NonceInput = z.string().uuid()

export function parseSshRespondHostKeyInput(raw: unknown): { nonce: string; trust: boolean } {
  return z.object({ nonce: NonceInput, trust: z.boolean() }).parse(raw)
}

// M3 S4 Evaluator M-3 — workspace:add-ssh payload.
const SshAuthSchema = z.union([
  z.object({ kind: z.literal('agent') }),
  z.object({ kind: z.literal('key-file'), path: PathInput }),
])

// Follow-up RF-2: SSH workspace root 는 POSIX 절대경로 + 최소 depth 2. `/` 단독은 금지
// (assertInWorkspace 가 전체 허용으로 퇴화하는 것을 방지).
export function isValidSshRoot(raw: string): boolean {
  if (!raw.startsWith('/')) return false
  const normalized = posix.normalize(raw).replace(/\/+$/, '') || '/'
  if (normalized === '/') return false
  const segments = normalized.split('/').filter((s) => s.length > 0)
  return segments.length >= 2
}

const SshRootInput = z
  .string()
  .min(1)
  .max(512)
  .refine(isValidSshRoot, {
    message: 'INVALID_SSH_ROOT (must be POSIX absolute path with depth ≥ 2)',
  })

// Follow-up FS9 — ssh:browse-folder input. 원격 폴더 탐색용 임시 연결 + readdir.
// path 는 POSIX 절대경로만 수용. depth 는 '/' 부터 허용 (picker 탐색용 — add-ssh 의 root 제약과 별개).
const BrowsePathInput = z
  .string()
  .min(1)
  .max(512)
  .refine((s) => s.startsWith('/') && !s.includes('\0'), {
    message: 'INVALID_BROWSE_PATH',
  })

export function parseSshBrowseFolderInput(raw: unknown): {
  host: string
  port: number
  user: string
  auth: { kind: 'agent' } | { kind: 'key-file'; path: string }
  path: string
} {
  return z
    .object({
      host: z.string().min(1).max(253),
      port: z.number().int().min(1).max(65535),
      user: z.string().min(1).max(64),
      auth: SshAuthSchema,
      path: BrowsePathInput,
    })
    .parse(raw)
}

export function parseWorkspaceAddSshInput(raw: unknown): {
  name: string
  host: string
  port: number
  user: string
  auth: { kind: 'agent' } | { kind: 'key-file'; path: string }
  root: string
  mode: 'container' | 'single'
} {
  return z
    .object({
      name: z.string().min(1).max(128),
      host: z.string().min(1).max(253), // RFC 1035 hostname
      port: z.number().int().min(1).max(65535),
      user: z.string().min(1).max(64),
      auth: SshAuthSchema,
      root: SshRootInput,
      // Follow-up FS8 — 기본 single (속도 우선 — container 는 depth 2 스캔으로 원격 RTT × N 비용 큼)
      mode: z.enum(['container', 'single']).default('single'),
    })
    .parse(raw)
}

// Composer ──────────────────────────────────────────────────

const ComposerPathList = z.array(PathInput).min(1).max(200)

export function parseComposerEstimateInput(raw: unknown): { paths: string[] } {
  return z.object({ paths: ComposerPathList }).parse(raw)
}

export function parseShellOpenExternalInput(raw: unknown): { url: string } {
  return z
    .object({
      url: z
        .string()
        .url()
        .max(2048)
        .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
          message: 'Only http/https URLs are allowed',
        }),
    })
    .parse(raw)
}

// ── 경로 보안 ────────────────────────────────────────────────

export interface AssertInWorkspaceOptions {
  // M3 SSH 검증의 사전 계약 (Plan rev. M1, 2026-04-21). 로컬은 path.sep를 써 OS 분기가 필요하지만,
  // 원격 transport(SSH)는 POSIX 경로만 취급하므로 path.posix 로 고정한다. M1 에서는 사용처 0 —
  // dead param 으로 오인해 제거되지 않도록 의도 명시. M3 SSH 도입 시 opts.posix=true 로 활성.
  posix?: boolean
}

/**
 * absPath가 등록된 workspaceRoots 중 하나의 하위 경로인지 검증한다.
 * path traversal 공격 차단을 위해 path.resolve 후 비교한다.
 *
 * opts.posix (default false) — M3 SSH 원격 경로 검증용 사전 계약. 현재 M1 에선 미사용이나
 * interface 를 먼저 확립해 M3 시점 다수 호출부 동시 수정을 방지한다.
 */
export function assertInWorkspace(
  absPath: string,
  workspaceRoots: string[],
  opts?: AssertInWorkspaceOptions
): void {
  const p = opts?.posix ? path.posix : path
  const resolved = p.resolve(absPath)
  const isAllowed = workspaceRoots.some((root) => {
    const resolvedRoot = p.resolve(root)
    return resolved.startsWith(resolvedRoot + p.sep) || resolved === resolvedRoot
  })
  if (!isAllowed) {
    throw new Error('PATH_OUT_OF_WORKSPACE')
  }
}
