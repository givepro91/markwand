import { describe, it, expect } from 'vitest'
import { extractReferences } from './extractor'

const ROOT = '/project'

// ---------------------------------------------------------------------------
// @/path pattern — kind='at'
// ---------------------------------------------------------------------------

describe('extractReferences — @/path (at)', () => {
  it('basic @/path → kind=at, resolvedPath under projectRoot', () => {
    const refs = extractReferences('See @/src/lib/foo.ts for details', ROOT)
    expect(refs).toHaveLength(1)
    expect(refs[0].kind).toBe('at')
    expect(refs[0].raw).toBe('@/src/lib/foo.ts')
    expect(refs[0].resolvedPath).toBe('/project/src/lib/foo.ts')
  })

  it('col is 1-based index of @ in line', () => {
    const refs = extractReferences('See @/foo.ts here', ROOT)
    expect(refs[0].col).toBe(5) // 'See ' = 4 chars, @ at index 4 → col 5
    expect(refs[0].line).toBe(1)
  })

  it('multiple @/path on one line — all extracted', () => {
    const refs = extractReferences('@/a.ts and @/b.ts', ROOT)
    expect(refs).toHaveLength(2)
    expect(refs[0].raw).toBe('@/a.ts')
    expect(refs[1].raw).toBe('@/b.ts')
    expect(refs[1].col).toBe(12) // '@/a.ts and ' = 11 chars, @ at index 11 → col 12
  })

  it('query string stripped from resolvedPath, kept in raw', () => {
    const refs = extractReferences('@/src/foo.ts?v=1', ROOT)
    expect(refs[0].raw).toBe('@/src/foo.ts?v=1')
    expect(refs[0].resolvedPath).toBe('/project/src/foo.ts')
  })

  it('anchor stripped from resolvedPath, kept in raw', () => {
    const refs = extractReferences('@/src/foo.ts#section', ROOT)
    expect(refs[0].raw).toBe('@/src/foo.ts#section')
    expect(refs[0].resolvedPath).toBe('/project/src/foo.ts')
  })

  it('query + anchor both stripped', () => {
    const refs = extractReferences('@/src/foo.ts?v=1#anchor', ROOT)
    expect(refs[0].resolvedPath).toBe('/project/src/foo.ts')
  })

  it('@/path inside code block → NOT extracted', () => {
    const md = '```\n@/src/foo.ts\n```'
    expect(extractReferences(md, ROOT)).toHaveLength(0)
  })

  it('line number is 1-based', () => {
    const md = 'line one\n@/foo.ts'
    const refs = extractReferences(md, ROOT)
    expect(refs[0].line).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Code block first-line hints — kind='hint'
// ---------------------------------------------------------------------------

describe('extractReferences — code block hints (hint)', () => {
  it('// path hint', () => {
    const md = '```\n// src/lib/foo.ts\n```'
    const refs = extractReferences(md, ROOT)
    expect(refs).toHaveLength(1)
    expect(refs[0].kind).toBe('hint')
    expect(refs[0].raw).toBe('// src/lib/foo.ts')
    expect(refs[0].resolvedPath).toBe('/project/src/lib/foo.ts')
    expect(refs[0].line).toBe(2)
  })

  it('col for // hint points to start of path content', () => {
    const refs = extractReferences('```\n// src/foo.ts\n```', ROOT)
    // '// ' is 3 chars, path starts at index 3 → col 4
    expect(refs[0].col).toBe(4)
  })

  it('# path hint', () => {
    const md = '```python\n# src/lib/foo.ts\n```'
    const refs = extractReferences(md, ROOT)
    expect(refs).toHaveLength(1)
    expect(refs[0].kind).toBe('hint')
    expect(refs[0].raw).toBe('# src/lib/foo.ts')
    expect(refs[0].resolvedPath).toBe('/project/src/lib/foo.ts')
  })

  it('/* path */ hint', () => {
    const md = '```\n/* src/lib/foo.ts */\n```'
    const refs = extractReferences(md, ROOT)
    expect(refs).toHaveLength(1)
    expect(refs[0].kind).toBe('hint')
    expect(refs[0].raw).toBe('/* src/lib/foo.ts */')
    expect(refs[0].resolvedPath).toBe('/project/src/lib/foo.ts')
  })

  it('/* path (no closing) hint', () => {
    const md = '```\n/* src/lib/foo.ts\n```'
    const refs = extractReferences(md, ROOT)
    expect(refs).toHaveLength(1)
    expect(refs[0].resolvedPath).toBe('/project/src/lib/foo.ts')
  })

  it('second+ line of code block NOT a hint', () => {
    const md = '```\n// src/foo.ts\n// src/bar.ts\n```'
    const refs = extractReferences(md, ROOT)
    // Only first line is checked for hint
    expect(refs).toHaveLength(1)
    expect(refs[0].raw).toBe('// src/foo.ts')
  })

  it('non-path first line → no hint extracted', () => {
    const md = '```\nconst x = 1\n```'
    expect(extractReferences(md, ROOT)).toHaveLength(0)
  })

  it('absolute path hint outside projectRoot → not extracted', () => {
    const md = '```\n// /absolute/path/to/file.ts\n```'
    expect(extractReferences(md, ROOT)).toHaveLength(0)
  })

  it('absolute path hint inside projectRoot kept as-is', () => {
    const md = '```\n// /project/src/file.ts\n```'
    const refs = extractReferences(md, ROOT)
    expect(refs[0].resolvedPath).toBe('/project/src/file.ts')
  })

  it('relative path hint resolved against projectRoot', () => {
    const md = '```\n// lib/utils.ts\n```'
    const refs = extractReferences(md, ROOT)
    expect(refs[0].resolvedPath).toBe('/project/lib/utils.ts')
  })

  it('bare filename hint is extracted for basename lookup', () => {
    const md = '```\n// toast-provider.tsx\n```'
    const refs = extractReferences(md, ROOT, '/project/docs/plan.md')
    expect(refs).toHaveLength(1)
    expect(refs[0].kind).toBe('hint')
    expect(refs[0].resolvedPath).toBe('/project/docs/toast-provider.tsx')
    expect(refs[0].fallbackPath).toBe('/project/toast-provider.tsx')
    expect(refs[0].lookupBasename).toBe('toast-provider.tsx')
  })

  it('Windows path hint — backslashes normalized', () => {
    const md = '```\n// C:\\Users\\foo\\bar.ts\n```'
    const refs = extractReferences(md, ROOT)
    expect(refs).toHaveLength(1)
    expect(refs[0].kind).toBe('hint')
    expect(refs[0].resolvedPath).toBe('C:/Users/foo/bar.ts')
  })

  it('hint query string stripped', () => {
    const md = '```\n// src/foo.ts?q=1\n```'
    const refs = extractReferences(md, ROOT)
    expect(refs[0].resolvedPath).toBe('/project/src/foo.ts')
  })

  it('hint anchor stripped', () => {
    const md = '```\n// src/foo.ts#section\n```'
    const refs = extractReferences(md, ROOT)
    expect(refs[0].resolvedPath).toBe('/project/src/foo.ts')
  })

  it('~~~  fence also works', () => {
    const md = '~~~\n// src/foo.ts\n~~~'
    const refs = extractReferences(md, ROOT)
    expect(refs).toHaveLength(1)
    expect(refs[0].kind).toBe('hint')
  })

  it('code block without hint followed by @/path in prose', () => {
    const md = '```\nconst x = 1\n```\n@/src/foo.ts'
    const refs = extractReferences(md, ROOT)
    expect(refs).toHaveLength(1)
    expect(refs[0].kind).toBe('at')
  })
})

// ---------------------------------------------------------------------------
// Inline backtick paths — kind='inline'
// ---------------------------------------------------------------------------

describe('extractReferences — inline backtick (inline)', () => {
  it('`path/to/file.ts` → kind=inline', () => {
    const refs = extractReferences('See `src/lib/foo.ts` for details', ROOT)
    expect(refs).toHaveLength(1)
    expect(refs[0].kind).toBe('inline')
    expect(refs[0].raw).toBe('`src/lib/foo.ts`')
    expect(refs[0].resolvedPath).toBe('/project/src/lib/foo.ts')
  })

  it('col is 1-based index of opening backtick', () => {
    const refs = extractReferences('See `src/foo.ts` here', ROOT)
    // 'See ' = 4 chars, backtick at index 4 → col 5
    expect(refs[0].col).toBe(5)
    expect(refs[0].line).toBe(1)
  })

  it('non-path identifier `someVar` → not extracted', () => {
    expect(extractReferences('call `someVar` here', ROOT)).toHaveLength(0)
  })

  it('bare code filename in backticks is extracted for basename lookup', () => {
    const refs = extractReferences('See `toast-provider.tsx` for the UI toast flow.', ROOT, '/project/docs/plan.md')
    expect(refs).toHaveLength(1)
    expect(refs[0].kind).toBe('inline')
    expect(refs[0].resolvedPath).toBe('/project/docs/toast-provider.tsx')
    expect(refs[0].fallbackPath).toBe('/project/toast-provider.tsx')
    expect(refs[0].lookupBasename).toBe('toast-provider.tsx')
  })

  it('URL in backtick not extracted as path', () => {
    expect(extractReferences('Visit `https://example.com/path`', ROOT)).toHaveLength(0)
  })

  it('`@/path.ts` → extracted as at kind, not inline', () => {
    const refs = extractReferences('`@/src/foo.ts`', ROOT)
    const atRefs = refs.filter((r) => r.kind === 'at')
    const inlineRefs = refs.filter((r) => r.kind === 'inline')
    expect(atRefs).toHaveLength(1)
    expect(inlineRefs).toHaveLength(0)
  })

  it('Windows path in backtick', () => {
    const refs = extractReferences('`C:\\Users\\foo\\bar.ts`', ROOT)
    expect(refs).toHaveLength(1)
    expect(refs[0].kind).toBe('inline')
    expect(refs[0].resolvedPath).toBe('C:/Users/foo/bar.ts')
  })

  it('absolute path in backtick outside projectRoot → not extracted', () => {
    expect(extractReferences('`/absolute/path/to/file.ts`', ROOT)).toHaveLength(0)
  })

  it('absolute path in backtick inside projectRoot kept as-is', () => {
    const refs = extractReferences('`/project/src/file.ts`', ROOT)
    expect(refs[0].resolvedPath).toBe('/project/src/file.ts')
  })

  it('inline backtick inside code block → not extracted', () => {
    const md = '```\n`path/to/file.ts`\n```'
    expect(extractReferences(md, ROOT)).toHaveLength(0)
  })

  it('query string stripped from inline resolvedPath', () => {
    const refs = extractReferences('`src/foo.ts?v=1`', ROOT)
    expect(refs[0].resolvedPath).toBe('/project/src/foo.ts')
  })
})

// ---------------------------------------------------------------------------
// Plain prose paths — kind='plain'
// ---------------------------------------------------------------------------

describe('extractReferences — plain prose paths (plain)', () => {
  it('extracts a project-root-like code path even when it is not wrapped in backticks', () => {
    const refs = extractReferences(
      'Check src/components/toast-provider.tsx before changing notifications.',
      ROOT,
      '/project/docs/design.md',
    )
    expect(refs).toHaveLength(1)
    expect(refs[0].kind).toBe('plain')
    expect(refs[0].raw).toBe('src/components/toast-provider.tsx')
    expect(refs[0].resolvedPath).toBe('/project/docs/src/components/toast-provider.tsx')
    expect(refs[0].fallbackPath).toBe('/project/src/components/toast-provider.tsx')
  })

  it('adds a monorepo self-prefix fallback when projectRoot is a nested package', () => {
    const refs = extractReferences(
      'Provider: `apps/lbd/src/hooks/useEngineJobs.ts`.',
      '/repo/apps/lbd',
      '/repo/apps/lbd/docs/plans/engine-polling-provider.plan.md',
    )
    expect(refs).toHaveLength(1)
    expect(refs[0].resolvedPath).toBe('/repo/apps/lbd/docs/plans/apps/lbd/src/hooks/useEngineJobs.ts')
    expect(refs[0].fallbackPaths).toEqual([
      '/repo/apps/lbd/apps/lbd/src/hooks/useEngineJobs.ts',
      '/repo/apps/lbd/src/hooks/useEngineJobs.ts',
    ])
  })

  it('does not double-count paths already wrapped in backticks', () => {
    const refs = extractReferences('Check `src/components/toast-provider.tsx`.', ROOT, '/project/docs/design.md')
    expect(refs).toHaveLength(1)
    expect(refs[0].kind).toBe('inline')
  })

  it('does not double-count identical markdown link label and href paths on the same line', () => {
    const refs = extractReferences(
      'Route: [apps/hub/src/App.tsx](apps/hub/src/App.tsx) — import 7 + Route 7.',
      '/repo',
      '/repo/docs/plans/hub.md',
    )
    expect(refs).toHaveLength(1)
    expect(refs[0].kind).toBe('plain')
    expect(refs[0].raw).toBe('apps/hub/src/App.tsx')
  })

  it('ignores URLs with path-like segments', () => {
    expect(extractReferences('Open https://example.com/src/toast-provider.tsx', ROOT)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Mixed patterns — multiple kinds in one document
// ---------------------------------------------------------------------------

describe('extractReferences — mixed patterns', () => {
  it('at + hint + inline in one document', () => {
    const md = [
      'See @/src/lib/foo.ts for context.',
      '```typescript',
      '// src/lib/bar.ts',
      'const x = 1',
      '```',
      'Also check `src/lib/baz.ts` inline.',
    ].join('\n')

    const refs = extractReferences(md, ROOT)
    const at = refs.filter((r) => r.kind === 'at')
    const hint = refs.filter((r) => r.kind === 'hint')
    const inline = refs.filter((r) => r.kind === 'inline')

    expect(at).toHaveLength(1)
    expect(hint).toHaveLength(1)
    expect(inline).toHaveLength(1)

    expect(at[0].resolvedPath).toBe('/project/src/lib/foo.ts')
    expect(hint[0].resolvedPath).toBe('/project/src/lib/bar.ts')
    expect(inline[0].resolvedPath).toBe('/project/src/lib/baz.ts')
  })

  it('multiple code blocks each yield at most one hint', () => {
    const md = [
      '```',
      '// src/a.ts',
      '```',
      '```',
      '# src/b.ts',
      '```',
    ].join('\n')

    const refs = extractReferences(md, ROOT)
    expect(refs).toHaveLength(2)
    expect(refs[0].resolvedPath).toBe('/project/src/a.ts')
    expect(refs[1].resolvedPath).toBe('/project/src/b.ts')
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('extractReferences — edge cases', () => {
  it('empty string → []', () => {
    expect(extractReferences('', ROOT)).toHaveLength(0)
  })

  it('no references → []', () => {
    expect(extractReferences('Hello world\nNo refs here.', ROOT)).toHaveLength(0)
  })

  it('unclosed code block — content not treated as prose', () => {
    // @/path inside unclosed fence should not be extracted
    const md = '```\n@/src/foo.ts'
    expect(extractReferences(md, ROOT)).toHaveLength(0)
  })

  it('projectRoot used correctly for relative paths', () => {
    const refs = extractReferences('@/lib/util.ts', '/home/user/my-project')
    expect(refs[0].resolvedPath).toBe('/home/user/my-project/lib/util.ts')
  })

  it('@ without leading slash → not matched', () => {
    expect(extractReferences('email@example.com', ROOT)).toHaveLength(0)
  })

  it('@/path at very start of document', () => {
    const refs = extractReferences('@/src/main.ts', ROOT)
    expect(refs[0].col).toBe(1)
    expect(refs[0].line).toBe(1)
  })

  it('deep nested path @/a/b/c/d/e.ts', () => {
    const refs = extractReferences('@/a/b/c/d/e.ts', ROOT)
    expect(refs[0].resolvedPath).toBe('/project/a/b/c/d/e.ts')
  })

  it('hint: comment with only text (no slash) → not a path hint', () => {
    const md = '```\n// just a comment\n```'
    expect(extractReferences(md, ROOT)).toHaveLength(0)
  })

  it('code block with language tag still extracts hint', () => {
    const md = '```typescript\n// src/foo.ts\n```'
    const refs = extractReferences(md, ROOT)
    expect(refs).toHaveLength(1)
    expect(refs[0].kind).toBe('hint')
  })

  it('CSS custom property inline backtick (`--badge-bg/text`) 는 경로 아님', () => {
    // v0.3.2+ Bug fix — 토큰 매핑 표의 `--name/variant` 가 inline 경로로 오판되어
    // drift missing 노이즈를 유발했다. `--` 로 시작하는 세그먼트는 CSS custom property.
    const md = '| 프로젝트 배지 | `--badge-bg/text` | 자동 |'
    expect(extractReferences(md, ROOT)).toHaveLength(0)
  })

  it('CSS custom property at-ref (`@/docs/--theme-color/accent`) 도 경로 아님', () => {
    // at-ref 경로 중간에 `--token` 세그가 있으면 동일 거부 (토큰 표에 `@/...` 접두 예시 드문 경우 대비)
    const md = 'See @/docs/--theme-color/accent for details.'
    expect(extractReferences(md, ROOT)).toHaveLength(0)
  })

  it('npm scoped package subpath is not a document reference', () => {
    expect(extractReferences('Use `@testing-library/jest-dom/vitest`.', ROOT)).toHaveLength(0)
  })

  it('placeholder @/path/to/... is not a document reference', () => {
    expect(extractReferences('Copy @/path/to/file.md into the prompt.', ROOT)).toHaveLength(0)
  })

  it('extensionless inline tokens are low-confidence and do not report missing', () => {
    const refs = extractReferences('Compare `origin/main` and `path/posix`.', ROOT)
    expect(refs).toHaveLength(2)
    expect(refs.every((ref) => ref.reportMissing === false)).toBe(true)
  })

  it('extensionless @/ refs are low-confidence and do not report missing', () => {
    const refs = extractReferences('API prefix is @/api/v1 and branch is @/release/main.', ROOT)
    expect(refs).toHaveLength(2)
    expect(refs.every((ref) => ref.kind === 'at')).toBe(true)
    expect(refs.every((ref) => ref.reportMissing === false)).toBe(true)
  })

  it('directory-like inline references are low-confidence and do not report missing', () => {
    const refs = extractReferences('Review `docs/plans/` before release.', ROOT)
    expect(refs).toHaveLength(1)
    expect(refs[0].reportMissing).toBe(false)
  })
})
