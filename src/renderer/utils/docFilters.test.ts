import { describe, it, expect } from 'vitest'
import type { Doc } from '../../../src/preload/types'
import type { MetaFilter } from '../state/store'
import { applyMetaFilter, buildDocGroups } from './docFilters'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = Date.now()
const DAY = 86_400_000

function makeDoc(overrides: Partial<Doc> & { path: string }): Doc {
  return {
    projectId: 'proj-1',
    name: overrides.path.split('/').pop() ?? 'doc.md',
    mtime: NOW - DAY * 10, // default: 10 days ago
    ...overrides,
  }
}

const emptyFilter: MetaFilter = {
  tags: [],
  statuses: [],
  sources: [],
  updatedRange: 'all',
}

// ---------------------------------------------------------------------------
// Sample docs matching the 8 fixture combinations
// ---------------------------------------------------------------------------

const docFullClaude = makeDoc({
  path: '/p/fm-01.md',
  mtime: NOW - DAY * 5,
  frontmatter: { tags: ['ai', 'review', 'design'], status: 'draft', updated: NOW - DAY * 5, source: 'claude' },
})
const docCodex = makeDoc({
  path: '/p/fm-02.md',
  mtime: NOW - DAY * 3,
  frontmatter: { tags: ['backend', 'api'], status: 'published', updated: 1710504000000, source: 'codex' },
})
const docDesignArchived = makeDoc({
  path: '/p/fm-03.md',
  mtime: NOW - DAY * 20,
  frontmatter: { tags: ['single-tag'], status: 'archived', updated: NOW - DAY * 20, source: 'design' },
})
const docReviewNoTags = makeDoc({
  path: '/p/fm-04.md',
  mtime: NOW - DAY * 40,
  frontmatter: { status: 'published', updated: NOW - DAY * 40, source: 'review' },
})
const docEmptyTagsDraft = makeDoc({
  path: '/p/fm-05.md',
  mtime: NOW - 3600_000, // 1 hour ago (today)
  frontmatter: { tags: [], status: 'draft', source: 'unknown-custom' },
})
const docMultiTagsNoSource = makeDoc({
  path: '/p/fm-06.md',
  mtime: NOW - DAY * 2,
  frontmatter: { tags: ['frontend', 'react', 'typescript', 'performance'], updated: 1700000000000 },
})
const docSpecialTagsClaude = makeDoc({
  path: '/p/fm-07.md',
  mtime: NOW - DAY * 1,
  frontmatter: { tags: ['한국어 태그', 'tag with spaces', 'tag/slash'], status: 'published', source: 'claude' },
})
const docNoFrontmatter = makeDoc({
  path: '/p/fm-08.md',
  mtime: NOW - DAY * 60,
})

const ALL_DOCS = [
  docFullClaude, docCodex, docDesignArchived, docReviewNoTags,
  docEmptyTagsDraft, docMultiTagsNoSource, docSpecialTagsClaude, docNoFrontmatter,
]

// ---------------------------------------------------------------------------
// applyMetaFilter — multi-select filtering
// ---------------------------------------------------------------------------

describe('applyMetaFilter', () => {
  it('empty filter passes all docs', () => {
    expect(applyMetaFilter(ALL_DOCS, emptyFilter)).toHaveLength(ALL_DOCS.length)
  })

  it('tags filter: single tag — OR match within doc tags', () => {
    const result = applyMetaFilter(ALL_DOCS, { ...emptyFilter, tags: ['ai'] })
    expect(result).toContain(docFullClaude)
    expect(result).not.toContain(docCodex)
  })

  it('tags filter: multi-select — doc with ANY selected tag passes', () => {
    const result = applyMetaFilter(ALL_DOCS, { ...emptyFilter, tags: ['ai', 'backend'] })
    expect(result).toContain(docFullClaude)
    expect(result).toContain(docCodex)
    expect(result).not.toContain(docDesignArchived)
  })

  it('tags filter: doc with empty tags array is excluded', () => {
    const result = applyMetaFilter(ALL_DOCS, { ...emptyFilter, tags: ['design'] })
    expect(result).not.toContain(docEmptyTagsDraft)
  })

  it('tags filter: doc with undefined frontmatter is excluded', () => {
    const result = applyMetaFilter(ALL_DOCS, { ...emptyFilter, tags: ['ai'] })
    expect(result).not.toContain(docNoFrontmatter)
  })

  it('statuses filter: single status', () => {
    const result = applyMetaFilter(ALL_DOCS, { ...emptyFilter, statuses: ['draft'] })
    expect(result).toContain(docFullClaude)
    expect(result).toContain(docEmptyTagsDraft)
    expect(result).not.toContain(docCodex) // published
  })

  it('statuses filter: multi-select (draft + published)', () => {
    const result = applyMetaFilter(ALL_DOCS, { ...emptyFilter, statuses: ['draft', 'published'] })
    expect(result).toContain(docFullClaude) // draft
    expect(result).toContain(docCodex) // published
    expect(result).not.toContain(docDesignArchived) // archived
    expect(result).not.toContain(docNoFrontmatter) // no status
  })

  it('statuses filter: doc without status is excluded', () => {
    const result = applyMetaFilter(ALL_DOCS, { ...emptyFilter, statuses: ['draft'] })
    expect(result).not.toContain(docNoFrontmatter)
    expect(result).not.toContain(docMultiTagsNoSource) // no status
  })

  it('sources filter: single source', () => {
    const result = applyMetaFilter(ALL_DOCS, { ...emptyFilter, sources: ['claude'] })
    expect(result).toContain(docFullClaude)
    expect(result).toContain(docSpecialTagsClaude)
    expect(result).not.toContain(docCodex)
  })

  it('sources filter: multi-select (claude + codex)', () => {
    const result = applyMetaFilter(ALL_DOCS, { ...emptyFilter, sources: ['claude', 'codex'] })
    expect(result).toContain(docFullClaude)
    expect(result).toContain(docCodex)
    expect(result).not.toContain(docDesignArchived) // design
    expect(result).not.toContain(docReviewNoTags) // review
  })

  it('updatedRange: today — only docs with mtime in last 24h', () => {
    const result = applyMetaFilter(ALL_DOCS, { ...emptyFilter, updatedRange: 'today' })
    expect(result).toContain(docEmptyTagsDraft) // 1 hour ago
    expect(result).not.toContain(docFullClaude) // 5 days ago
    expect(result).not.toContain(docNoFrontmatter) // 60 days ago
  })

  it('updatedRange: 7d — docs with mtime within 7 days', () => {
    const result = applyMetaFilter(ALL_DOCS, { ...emptyFilter, updatedRange: '7d' })
    expect(result).toContain(docEmptyTagsDraft) // 1h ago
    expect(result).toContain(docFullClaude) // 5d ago
    expect(result).toContain(docSpecialTagsClaude) // 1d ago
    expect(result).not.toContain(docDesignArchived) // 20d ago
  })

  it('updatedRange: 30d — docs with mtime within 30 days', () => {
    const result = applyMetaFilter(ALL_DOCS, { ...emptyFilter, updatedRange: '30d' })
    expect(result).toContain(docDesignArchived) // 20d ago
    expect(result).not.toContain(docReviewNoTags) // 40d ago
    expect(result).not.toContain(docNoFrontmatter) // 60d ago
  })

  it('updatedRange: active range excludes image assets (md-only guard)', () => {
    // 날짜 필터가 켜지면 이미지는 제외되어야 한다 (Known Gap v0.3.1).
    const mdRecent = makeDoc({ path: '/p/recent.md', mtime: NOW - 3600_000 })
    const imgRecent = makeDoc({ path: '/p/screenshot.png', mtime: NOW - 3600_000 })
    const imgSvg = makeDoc({ path: '/p/diagram.svg', mtime: NOW - 3600_000 })
    const result = applyMetaFilter([mdRecent, imgRecent, imgSvg], {
      ...emptyFilter,
      updatedRange: 'today',
    })
    expect(result).toContain(mdRecent)
    expect(result).not.toContain(imgRecent)
    expect(result).not.toContain(imgSvg)
  })

  it("updatedRange: 'all' keeps images (no md-only guard when filter off)", () => {
    const mdRecent = makeDoc({ path: '/p/recent.md', mtime: NOW - 3600_000 })
    const imgRecent = makeDoc({ path: '/p/screenshot.png', mtime: NOW - 3600_000 })
    const result = applyMetaFilter([mdRecent, imgRecent], {
      ...emptyFilter,
      updatedRange: 'all',
    })
    expect(result).toContain(mdRecent)
    expect(result).toContain(imgRecent)
  })

  it('updatedRange + tags: md-only guard still applies to frontmatter-tagged images', () => {
    // 이미지에 frontmatter.tags가 달렸더라도(이론상 가능), 날짜 필터가 켜지면
    // md-only 가드가 복합 조건의 AND 체인에서 이미지를 제거한다.
    const mdTagged = makeDoc({
      path: '/p/doc.md',
      mtime: NOW - 3600_000,
      frontmatter: { tags: ['shared'] },
    })
    const imgTagged = makeDoc({
      path: '/p/chart.png',
      mtime: NOW - 3600_000,
      frontmatter: { tags: ['shared'] },
    })
    const result = applyMetaFilter([mdTagged, imgTagged], {
      ...emptyFilter,
      tags: ['shared'],
      updatedRange: '7d',
    })
    expect(result).toContain(mdTagged)
    expect(result).not.toContain(imgTagged)
  })

  it('combined filters: tags AND statuses AND sources — AND logic between categories', () => {
    const result = applyMetaFilter(ALL_DOCS, {
      tags: ['ai'],
      statuses: ['draft'],
      sources: ['claude'],
      updatedRange: 'all',
    })
    expect(result).toContain(docFullClaude) // matches all three
    expect(result).toHaveLength(1)
  })

  it('combined filters: impossible combination → empty result', () => {
    const result = applyMetaFilter(ALL_DOCS, {
      tags: ['ai'],
      statuses: ['archived'],
      sources: ['claude'],
      updatedRange: 'all',
    })
    expect(result).toHaveLength(0)
  })

  it('empty docs array → empty result regardless of filter', () => {
    const result = applyMetaFilter([], { ...emptyFilter, tags: ['ai'] })
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// buildDocGroups — grouping logic
// ---------------------------------------------------------------------------

describe('buildDocGroups — by tag', () => {
  it('doc with 3 tags appears in 3 groups', () => {
    const groups = buildDocGroups([docFullClaude], 'tag', 'recent')
    const labels = groups.map((g) => g.label)
    expect(labels).toContain('ai')
    expect(labels).toContain('review')
    expect(labels).toContain('design')
    expect(groups).toHaveLength(3)
  })

  it('doc with no tags (undefined) goes to Untagged group', () => {
    const groups = buildDocGroups([docNoFrontmatter], 'tag', 'recent')
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('Untagged')
    expect(groups[0].docs).toContain(docNoFrontmatter)
  })

  it('doc with empty tags array goes to Untagged group', () => {
    const groups = buildDocGroups([docEmptyTagsDraft], 'tag', 'recent')
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('Untagged')
  })

  it('Untagged group appears last (after named groups)', () => {
    const groups = buildDocGroups([docFullClaude, docNoFrontmatter], 'tag', 'recent')
    const lastGroup = groups[groups.length - 1]
    expect(lastGroup.label).toBe('Untagged')
  })

  it('named groups sorted alphabetically', () => {
    const docs = [docMultiTagsNoSource] // tags: frontend, react, typescript, performance
    const groups = buildDocGroups(docs, 'tag', 'recent')
    const named = groups.filter((g) => g.label !== 'Untagged')
    const labels = named.map((g) => g.label)
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)))
  })

  it('multiple docs sharing a tag appear together in that group', () => {
    const docA = makeDoc({ path: '/p/a.md', frontmatter: { tags: ['shared'] } })
    const docB = makeDoc({ path: '/p/b.md', frontmatter: { tags: ['shared', 'other'] } })
    const groups = buildDocGroups([docA, docB], 'tag', 'recent')
    const sharedGroup = groups.find((g) => g.label === 'shared')
    expect(sharedGroup).toBeDefined()
    expect(sharedGroup!.docs).toContain(docA)
    expect(sharedGroup!.docs).toContain(docB)
  })

  it('empty docs array returns empty groups', () => {
    expect(buildDocGroups([], 'tag', 'recent')).toHaveLength(0)
  })
})

describe('buildDocGroups — by status', () => {
  it('groups by status value', () => {
    const docs = [docFullClaude, docCodex, docDesignArchived]
    const groups = buildDocGroups(docs, 'status', 'recent')
    const labels = groups.map((g) => g.label)
    expect(labels).toContain('draft')
    expect(labels).toContain('published')
    expect(labels).toContain('archived')
  })

  it('doc without status goes to Untagged', () => {
    const groups = buildDocGroups([docMultiTagsNoSource], 'status', 'recent')
    expect(groups[0].label).toBe('Untagged')
  })

  it('Untagged appears last', () => {
    const docs = [docFullClaude, docNoFrontmatter] // draft + no status
    const groups = buildDocGroups(docs, 'status', 'recent')
    expect(groups[groups.length - 1].label).toBe('Untagged')
  })
})

describe('buildDocGroups — by source', () => {
  it('groups by source value', () => {
    const docs = [docFullClaude, docCodex, docDesignArchived, docReviewNoTags]
    const groups = buildDocGroups(docs, 'source', 'recent')
    const labels = groups.map((g) => g.label)
    expect(labels).toContain('claude')
    expect(labels).toContain('codex')
    expect(labels).toContain('design')
    expect(labels).toContain('review')
  })

  it('doc without source goes to Untagged', () => {
    const groups = buildDocGroups([docMultiTagsNoSource], 'source', 'recent')
    expect(groups[0].label).toBe('Untagged')
  })

  it('custom source value is treated as a group', () => {
    const groups = buildDocGroups([docEmptyTagsDraft], 'source', 'recent')
    // source: 'unknown-custom' — not in known sources, but still groups correctly
    expect(groups[0].label).toBe('unknown-custom')
  })
})

describe('buildDocGroups — sorting within groups', () => {
  const older = makeDoc({ path: '/p/older.md', mtime: NOW - DAY * 10, frontmatter: { tags: ['t'] } })
  const newer = makeDoc({ path: '/p/newer.md', mtime: NOW - DAY * 1, frontmatter: { tags: ['t'] } })

  it('sort by recent: newer docs first', () => {
    const groups = buildDocGroups([older, newer], 'tag', 'recent')
    const group = groups.find((g) => g.label === 't')!
    expect(group.docs[0]).toBe(newer)
    expect(group.docs[1]).toBe(older)
  })

  it('sort by name: alphabetical order', () => {
    const groups = buildDocGroups([older, newer], 'tag', 'name')
    const group = groups.find((g) => g.label === 't')!
    const names = group.docs.map((d) => d.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })
})
