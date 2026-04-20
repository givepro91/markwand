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

function resolveRef(rawPath: string, kind: ReferenceKind, projectRoot: string): string {
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

  return path.resolve(projectRoot, cleaned)
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

export function extractReferences(md: string, projectRoot: string): Reference[] {
  const lines = md.split('\n')
  const results: Reference[] = []

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

      // @/path references
      for (const m of line.matchAll(AT_REF_RE)) {
        const rawMatch = m[0]
        const pathPart = m[1]
        const col = (m.index ?? 0) + 1
        results.push({
          raw: rawMatch,
          resolvedPath: resolveRef(pathPart, 'at', projectRoot),
          kind: 'at',
          line: lineNum,
          col,
        })
      }

      // Inline backtick paths — skip if content is an @/ ref (already captured above)
      for (const m of line.matchAll(INLINE_BACKTICK_RE)) {
        const inner = m[1]
        if (isPathLike(inner) && !inner.startsWith('@/')) {
          const col = (m.index ?? 0) + 1
          results.push({
            raw: m[0],
            resolvedPath: resolveRef(inner, 'inline', projectRoot),
            kind: 'inline',
            line: lineNum,
            col,
          })
        }
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
          results.push({
            raw: line.trim(),
            resolvedPath: resolveRef(hint.pathStr, 'hint', projectRoot),
            kind: 'hint',
            line: lineNum,
            col: hint.col,
          })
        }
      }
    }
  }

  return results
}
