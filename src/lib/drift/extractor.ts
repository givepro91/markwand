import path from 'path'
import type { Reference, ReferenceKind } from './types'

// Matches @/path — stops at whitespace and common markdown/HTML delimiters
const AT_REF_RE = /@(\/[^\s"'`\]>)]+)/g

// Matches `inner content` on a single line
const INLINE_BACKTICK_RE = /`([^`\n]+)`/g

// Opening fence: ``` or ~~~, optionally followed by language specifier
const FENCE_OPEN_RE = /^(`{3,}|~{3,})/

function stripPathExtras(p: string): string {
  return p.replace(/[?#].*$/, '').replace(/\\/g, '/')
}

function isWindowsAbsolutePath(s: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(s)
}

function isPathLike(s: string): boolean {
  if (!s || s.length < 2) return false
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(s)) return false
  return s.includes('/') || s.includes('\\')
}

// Path 후보 허용 문자 화이트리스트.
// 영/숫자, `_-./\+@~#` 만 허용. 공백·수식기호(×,÷,±,%,&,|,=,$)·괄호·쉼표·따옴표·한글 등이 섞이면 path 아님.
// 한글 파일명은 이 regex 에서 제외됨 — 수식 false positive (`원`, `면적`) 를 거르기 위한 절충.
const PATH_CHAR_RE = /^[\w\-./\\+@~#?]+$/

// npm scoped 패키지 이름: `@scope/name[/subpath]` — 파일 경로가 아니므로 drift 추출에서 제외.
// (프로젝트 루트 ref 인 `@/path` 는 항상 `@` 직후 `/` 이므로 구별 가능)
const NPM_SCOPE_RE = /^@[a-z0-9][a-z0-9\-_.]*\/[a-z0-9][a-z0-9\-_.]*(?:\/[a-z0-9][a-z0-9\-_.]*)*$/i
function isNpmScopePackage(s: string): boolean {
  return NPM_SCOPE_RE.test(s)
}

// glob 패턴 / 문서 placeholder 탐지 — 실제 파일 경로로 해석하면 항상 missing 오판.
// 예: `@/apps/**`, `packages/<name>/src`, `**/*.test.ts`
function isGlobOrPlaceholder(s: string): boolean {
  const cleaned = stripPathExtras(s)
  const segs = cleaned.replace(/^@?\//, '').split(/[/\\]/).filter(Boolean)
  return /[*<>{}]/.test(cleaned) || cleaned.includes('**') || (
    segs[0] === 'path' && segs[1] === 'to'
  )
}

const FILE_EXTENSIONS = new Set([
  'md', 'mdx', 'txt', 'json', 'jsonc', 'yaml', 'yml', 'toml', 'xml', 'html', 'css',
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'vue', 'svelte',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'cs',
  'sh', 'bash', 'zsh', 'fish', 'sql', 'graphql', 'gql',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf',
])

function getLastExtension(s: string): string | null {
  const cleaned = stripPathExtras(s)
  const segs = cleaned.split(/[/\\]/).filter(Boolean)
  const lastSeg = segs[segs.length - 1]
  const m = lastSeg?.match(/\.([a-z0-9]{1,8})$/i)
  return m ? m[1].toLowerCase() : null
}

function hasKnownFileExtension(s: string): boolean {
  const ext = getLastExtension(s)
  return ext != null && FILE_EXTENSIONS.has(ext)
}

function isDirectoryLikePath(s: string): boolean {
  return /[/\\]$/.test(stripPathExtras(s))
}

function shouldReportMissing(rawPath: string, kind: ReferenceKind): boolean {
  if (isDirectoryLikePath(rawPath)) return false
  // Extensionless refs such as `@/api/v1`, `origin/main`, or `docs/plans`
  // are too ambiguous to report as broken. If the target exists we still keep
  // the relationship, but a miss stays silent to avoid slash-heavy prose noise.
  if (kind === 'at') return hasKnownFileExtension(rawPath)
  return hasKnownFileExtension(rawPath)
}

function isInsideRoot(absPath: string, projectRoot: string): boolean {
  const root = path.resolve(projectRoot)
  const target = path.resolve(absPath)
  return target === root || target.startsWith(root + path.sep)
}

// 의미 있는 경로 후보인지 검사 — path 표기 같아 보여도 실제로는 아닌 경우 거름.
// 거부하는 주요 카테고리:
//   - 허용 문자 외 포함: 공백, 한글, 수식기호, 쉼표 등
//   - 날짜/비율/분수: `2024/11/05`, `10/10` (모든 세그먼트 숫자)
//   - 단위: `km/h`, `m/s`, `req/s` (모든 세그먼트가 짧은 영문)
//   - 홈 디렉토리: `~/.bashrc` (home 해석 안 함)
//   - 1-2자 단일 세그먼트 + 확장자 없음: `@/cd`, `@/a`
function isMeaningfulPathCandidate(s: string): boolean {
  const candidate = stripPathExtras(s)
  if (isWindowsAbsolutePath(candidate)) return true
  if (!PATH_CHAR_RE.test(candidate)) return false
  // 홈 디렉토리 레퍼런스 — projectRoot 기반 resolve 로는 항상 미스.
  if (candidate === '~' || candidate.startsWith('~/') || candidate.startsWith('~\\')) return false

  const stripped = candidate.replace(/^@?\/?/, '')
  const segs = stripped.split(/[/\\]/).filter(Boolean)
  if (segs.length === 0) return false

  // CSS custom property 패턴 — `--name/value` 형태는 토큰 표기이지 경로 아님.
  // (예: `--badge-bg/text`, `--color-warning/muted` — markdown 토큰 매핑 표에 흔함)
  // 파일명이 `--` 로 시작하는 경우는 사실상 없으므로 보수적 거부가 안전.
  if (segs.some((seg) => seg.startsWith('--'))) return false

  // 모든 세그먼트가 숫자만 → 날짜·비율·분수
  if (segs.every((seg) => /^\d+$/.test(seg))) return false

  const lastSeg = segs[segs.length - 1]
  const hasExt = /\.[a-z0-9]{1,8}$/i.test(lastSeg)

  // 확장자가 있는 경로는 실제 파일 참조일 가능성이 높다.
  if (hasExt) {
    return true
  }

  // 확장자 없음: 어느 세그라도 1자이면 단위·명령어·regex 로 간주 → 거부.
  // (예: `req/s`, `s/old/new/g`, `km/h`, `m/s`)
  if (segs.some((seg) => seg.length < 2)) return false

  // 모든 세그 길이 ≤ 2 도 거부 (`aa/bb` 같은 더미 예시)
  if (segs.every((seg) => seg.length <= 2)) return false

  // 단일 세그먼트 + 확장자 없음 + 길이 < 3 → 거부 (`@/cd`, `@/a`)
  if (segs.length === 1 && segs[0].length < 3) return false

  return true
}

function resolveRef(
  rawPath: string,
  kind: ReferenceKind,
  projectRoot: string,
  docDir?: string
): string | null {
  const cleaned = stripPathExtras(rawPath)

  if (kind === 'at') {
    // @/path — leading / is a project-root separator, not filesystem root
    const relative = cleaned.startsWith('/') ? cleaned.slice(1) : cleaned
    return path.join(projectRoot, relative)
  }

  // Windows absolute path: C:/... or C:\...
  if (/^[A-Za-z]:[\\/]/.test(rawPath)) {
    return cleaned
  }

  if (path.isAbsolute(cleaned)) {
    const normalized = path.normalize(cleaned)
    return isInsideRoot(normalized, projectRoot) ? normalized : null
  }

  // inline/hint 상대 경로: 문서 디렉토리 기준 resolve 가 자연스럽다.
  // (작성자는 보통 "이 문서가 있는 폴더 기준" 으로 참조를 적는다 — projectRoot 기준이 아님)
  const base = docDir ?? projectRoot
  return path.resolve(base, cleaned)
}

function extractHintComment(line: string): { pathStr: string; col: number } | null {
  let m: RegExpMatchArray | null

  // // path  (or //path)
  m = line.match(/^(\s*\/\/\s*)(.+)$/)
  if (m) {
    const pathStr = m[2].trim()
    if (isPathLike(pathStr)) return { pathStr, col: m[1].length + 1 }
  }

  // # path  (or #path)
  m = line.match(/^(\s*#\s*)(.+)$/)
  if (m) {
    const pathStr = m[2].trim()
    if (isPathLike(pathStr)) return { pathStr, col: m[1].length + 1 }
  }

  // /* path */ or /* path
  m = line.replace(/\*\/\s*$/, '').match(/^(\s*\/\*\s*)(.+)$/)
  if (m) {
    const pathStr = m[2].trim()
    if (isPathLike(pathStr)) return { pathStr, col: m[1].length + 1 }
  }

  return null
}

export function extractReferences(
  md: string,
  projectRoot: string,
  docPath?: string
): Reference[] {
  const lines = md.split('\n')
  const results: Reference[] = []
  const docDir = docPath ? path.dirname(docPath) : undefined

  let inCodeBlock = false
  let fenceMarker = ''
  let nextIsHint = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNum = i + 1

    if (!inCodeBlock) {
      const fenceMatch = line.match(FENCE_OPEN_RE)
      if (fenceMatch) {
        inCodeBlock = true
        fenceMarker = fenceMatch[1]
        nextIsHint = true
        continue
      }

      // @/path references — glob · placeholder / 무의미 경로 전부 스킵
      for (const m of line.matchAll(AT_REF_RE)) {
        const rawMatch = m[0]
        const pathPart = m[1]
        const idx = m.index ?? 0
        if (isGlobOrPlaceholder(pathPart)) continue
        if (!isMeaningfulPathCandidate(pathPart)) continue
        const resolvedPath = resolveRef(pathPart, 'at', projectRoot)
        if (!resolvedPath) continue
        results.push({
          raw: rawMatch,
          resolvedPath,
          reportMissing: shouldReportMissing(pathPart, 'at'),
          kind: 'at',
          line: lineNum,
          col: idx + 1,
        })
      }

      // Inline backtick paths — path-like 이면서 모든 가드 통과해야.
      for (const m of line.matchAll(INLINE_BACKTICK_RE)) {
        const inner = m[1]
        if (!isPathLike(inner)) continue
        if (inner.startsWith('@/')) continue // at-ref 로 이미 처리됨
        if (isNpmScopePackage(inner)) continue
        if (isGlobOrPlaceholder(inner)) continue
        if (!isMeaningfulPathCandidate(inner)) continue
        const col = (m.index ?? 0) + 1
        const primary = resolveRef(inner, 'inline', projectRoot, docDir)
        if (!primary) continue
        const fallback = docDir ? resolveRef(inner, 'inline', projectRoot) : undefined
        results.push({
          raw: m[0],
          resolvedPath: primary,
          fallbackPath: fallback && fallback !== primary ? fallback : undefined,
          reportMissing: shouldReportMissing(inner, 'inline'),
          kind: 'inline',
          line: lineNum,
          col,
        })
      }
    } else {
      // Closing fence must match the opening marker exactly
      if (new RegExp(`^${fenceMarker}\\s*$`).test(line)) {
        inCodeBlock = false
        fenceMarker = ''
        nextIsHint = false
        continue
      }

      if (nextIsHint) {
        nextIsHint = false
        const hint = extractHintComment(line)
        if (hint) {
          // code block hint 도 동일 가드
          if (
            !isNpmScopePackage(hint.pathStr) &&
            !isGlobOrPlaceholder(hint.pathStr) &&
            isMeaningfulPathCandidate(hint.pathStr)
          ) {
            const primary = resolveRef(hint.pathStr, 'hint', projectRoot, docDir)
            if (!primary) continue
            const fallback = docDir ? resolveRef(hint.pathStr, 'hint', projectRoot) : undefined
            results.push({
              raw: line.trim(),
              resolvedPath: primary,
              fallbackPath: fallback && fallback !== primary ? fallback : undefined,
              reportMissing: shouldReportMissing(hint.pathStr, 'hint'),
              kind: 'hint',
              line: lineNum,
              col: hint.col,
            })
          }
        }
      }
    }
  }

  return results
}
