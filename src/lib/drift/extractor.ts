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

function isPathLike(s: string): boolean {
  if (!s || s.length < 2) return false
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(s)) return false
  return s.includes('/') || s.includes('\\')
}

// Path 후보 허용 문자 화이트리스트.
// 영/숫자, `_-./\+@~#` 만 허용. 공백·수식기호(×,÷,±,%,&,|,=,$)·괄호·쉼표·따옴표·한글 등이 섞이면 path 아님.
// 한글 파일명은 이 regex 에서 제외됨 — 수식 false positive (`원`, `면적`) 를 거르기 위한 절충.
const PATH_CHAR_RE = /^[\w\-./\\+@~#?]+$/

// npm scoped 패키지 이름: `@scope/name` — 파일 경로가 아니므로 drift 추출에서 제외.
// (프로젝트 루트 ref 인 `@/path` 는 항상 `@` 직후 `/` 이므로 구별 가능)
const NPM_SCOPE_RE = /^@[a-z0-9][a-z0-9\-_.]*\/[a-z0-9][a-z0-9\-_.]*$/i
function isNpmScopePackage(s: string): boolean {
  return NPM_SCOPE_RE.test(s)
}

// glob 패턴 / 문서 placeholder 탐지 — 실제 파일 경로로 해석하면 항상 missing 오판.
// 예: `@/apps/**`, `packages/<name>/src`, `**/*.test.ts`
function isGlobOrPlaceholder(s: string): boolean {
  return /[*<>{}]/.test(s) || s.includes('**')
}

// 의미 있는 경로 후보인지 검사 — path 표기 같아 보여도 실제로는 아닌 경우 거름.
// 거부하는 주요 카테고리:
//   - 허용 문자 외 포함: 공백, 한글, 수식기호, 쉼표 등
//   - 날짜/비율/분수: `2024/11/05`, `10/10` (모든 세그먼트 숫자)
//   - 단위: `km/h`, `m/s`, `req/s` (모든 세그먼트가 짧은 영문)
//   - 홈 디렉토리: `~/.bashrc` (home 해석 안 함)
//   - 1-2자 단일 세그먼트 + 확장자 없음: `@/cd`, `@/a`
function isMeaningfulPathCandidate(s: string): boolean {
  if (!PATH_CHAR_RE.test(s)) return false
  // 홈 디렉토리 레퍼런스 — projectRoot 기반 resolve 로는 항상 미스.
  if (s === '~' || s.startsWith('~/') || s.startsWith('~\\')) return false

  const stripped = s.replace(/^@?\/?/, '')
  const segs = stripped.split(/[/\\]/).filter(Boolean)
  if (segs.length === 0) return false

  // 모든 세그먼트가 숫자만 → 날짜·비율·분수
  if (segs.every((seg) => /^\d+$/.test(seg))) return false

  const lastSeg = segs[segs.length - 1]
  const hasExt = /\.[a-z0-9]{1,8}$/i.test(lastSeg)

  // 확장자가 있는 경우, 마지막 세그를 제외한 나머지 세그는 2자 이상이어야 함.
  // (예: `src/a.ts` ok, `s/foo/bar.ts` 의 `s` 는 불허 — sed/regex 변종 차단)
  if (hasExt) {
    const nonExt = segs.slice(0, -1)
    if (nonExt.some((seg) => seg.length < 2)) return false
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
): string {
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
    return path.normalize(cleaned)
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

      // 라인 내 인라인 백틱 범위를 먼저 수집 — AT_REF 가 백틱 내부에 있으면 스킵(이중 추출 방지 + 쉘 커맨드·수식 오인 차단).
      const backtickRanges: Array<[number, number]> = []
      for (const m of line.matchAll(INLINE_BACKTICK_RE)) {
        const s = m.index ?? 0
        backtickRanges.push([s, s + m[0].length])
      }
      const isInBacktick = (idx: number): boolean =>
        backtickRanges.some(([s, e]) => idx >= s && idx < e)

      // @/path references — 가드: 백틱 내부 / glob · placeholder / 무의미 경로 전부 스킵
      for (const m of line.matchAll(AT_REF_RE)) {
        const rawMatch = m[0]
        const pathPart = m[1]
        const idx = m.index ?? 0
        if (isInBacktick(idx)) continue
        if (isGlobOrPlaceholder(pathPart)) continue
        if (!isMeaningfulPathCandidate(pathPart)) continue
        results.push({
          raw: rawMatch,
          resolvedPath: resolveRef(pathPart, 'at', projectRoot),
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
        // 백틱 안 절대 경로는 "예시 경로"일 가능성이 높다 (`/Users/someone/...`) — 현재 머신에 없으면 항상 missing 되어 노이즈.
        if (path.isAbsolute(stripPathExtras(inner))) continue
        if (!isMeaningfulPathCandidate(inner)) continue
        const col = (m.index ?? 0) + 1
        const primary = resolveRef(inner, 'inline', projectRoot, docDir)
        const fallback = docDir ? resolveRef(inner, 'inline', projectRoot) : undefined
        results.push({
          raw: m[0],
          resolvedPath: primary,
          fallbackPath: fallback && fallback !== primary ? fallback : undefined,
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
            const fallback = docDir ? resolveRef(hint.pathStr, 'hint', projectRoot) : undefined
            results.push({
              raw: line.trim(),
              resolvedPath: primary,
              fallbackPath: fallback && fallback !== primary ? fallback : undefined,
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
