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

  it('absolute path hint kept as-is', () => {
    const md = '```\n// /absolute/path/to/file.ts\n```'
    const refs = extractReferences(md, ROOT)
    expect(refs[0].resolvedPath).toBe('/absolute/path/to/file.ts')
  })

  it('relative path hint resolved against projectRoot', () => {
    const md = '```\n// lib/utils.ts\n```'
    const refs = extractReferences(md, ROOT)
    expect(refs[0].resolvedPath).toBe('/project/lib/utils.ts')
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

  it('absolute path in backtick kept as-is', () => {
    const refs = extractReferences('`/absolute/path/to/file.ts`', ROOT)
    expect(refs[0].resolvedPath).toBe('/absolute/path/to/file.ts')
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
})
