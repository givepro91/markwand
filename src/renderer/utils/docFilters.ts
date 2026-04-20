import type { Doc, SortOrder } from '../../../src/preload/types'
import type { MetaFilter } from '../state/store'

export type GroupByField = 'tag' | 'status' | 'source'

export function applyMetaFilter(docs: Doc[], filter: MetaFilter): Doc[] {
  let result = docs
  if (filter.tags.length > 0)
    result = result.filter((d) => filter.tags.some((t) => d.frontmatter?.tags?.includes(t)))
  if (filter.statuses.length > 0)
    result = result.filter(
      (d) => d.frontmatter?.status != null && filter.statuses.includes(d.frontmatter.status)
    )
  if (filter.sources.length > 0)
    result = result.filter(
      (d) =>
        d.frontmatter?.source != null &&
        filter.sources.includes(d.frontmatter.source as string)
    )
  if (filter.updatedRange !== 'all') {
    const now = Date.now()
    const ms: Record<string, number> = {
      today: 86_400_000,
      '7d': 604_800_000,
      '30d': 2_592_000_000,
    }
    result = result.filter((d) => d.mtime >= now - (ms[filter.updatedRange] ?? 0))
  }
  return result
}

export function sortDocsByOrder(docs: Doc[], order: SortOrder): Doc[] {
  if (order === 'recent') return docs.sort((a, b) => b.mtime - a.mtime)
  if (order === 'name') return docs.sort((a, b) => a.name.localeCompare(b.name))
  return docs.sort((a, b) => b.mtime - a.mtime)
}

export function buildDocGroups(
  docs: Doc[],
  by: GroupByField,
  order: SortOrder
): Array<{ label: string; docs: Doc[] }> {
  const map = new Map<string, Doc[]>()
  for (const doc of docs) {
    let keys: string[]
    if (by === 'tag') {
      keys = doc.frontmatter?.tags?.length ? [...doc.frontmatter.tags] : ['Untagged']
    } else if (by === 'status') {
      keys = doc.frontmatter?.status ? [doc.frontmatter.status] : ['Untagged']
    } else {
      keys = doc.frontmatter?.source ? [doc.frontmatter.source as string] : ['Untagged']
    }
    for (const key of keys) {
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(doc)
    }
  }

  const groups: Array<{ label: string; docs: Doc[] }> = []
  let untagged: { label: string; docs: Doc[] } | undefined
  for (const [label, items] of map) {
    const sorted = sortDocsByOrder([...items], order)
    if (label === 'Untagged') {
      untagged = { label, docs: sorted }
    } else {
      groups.push({ label, docs: sorted })
    }
  }
  groups.sort((a, b) => a.label.localeCompare(b.label))
  if (untagged) groups.push(untagged)
  return groups
}
