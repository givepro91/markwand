import { ipcMain } from 'electron'
import matter from 'gray-matter'
import { getActiveTransport } from '../transport/resolve'
import { parseSearchQueryInput } from '../security/validators'
import {
  getCachedDocsForProject,
  getCachedProjectsSnapshot,
  getOrScanDocsForProject,
} from './workspace'
import type { Doc, Project } from '../../preload/types'

const BODY_READ_BYTES = 64 * 1024
const BODY_CACHE_LIMIT = 800
const LOCAL_BODY_READ_BUDGET = 80
const SSH_BODY_READ_BUDGET = 8
const LOCAL_BODY_CONCURRENCY = 8
const SSH_BODY_CONCURRENCY = 2

export interface SearchResult {
  path: string
  projectId: string
  title: string
  snippet: string
  score: number
}

interface SearchCandidate {
  doc: Doc
  project: Project
  metadataScore: number
}

interface BodyCacheEntry {
  mtime: number
  size?: number
  content: string
  lower: string
}

const bodyCache = new Map<string, BodyCacheEntry>()

export function getBodyReadBudget(workspaceId: string): number {
  return workspaceId.startsWith('ssh:') ? SSH_BODY_READ_BUDGET : LOCAL_BODY_READ_BUDGET
}

export function getBodyReadConcurrency(workspaceId: string): number {
  return workspaceId.startsWith('ssh:') ? SSH_BODY_CONCURRENCY : LOCAL_BODY_CONCURRENCY
}

export function tokenizeQuery(query: string): string[] {
  return query
    .toLocaleLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 8)
}

function frontmatterText(doc: Doc): string {
  if (!doc.frontmatter) return ''
  const values = Object.entries(doc.frontmatter)
    .filter(([, value]) => typeof value === 'string' || typeof value === 'number' || Array.isArray(value))
    .map(([key, value]) => `${key} ${Array.isArray(value) ? value.join(' ') : String(value)}`)
  return values.join(' ')
}

export function scoreMetadata(doc: Doc, query: string, tokens: string[]): number {
  const q = query.toLocaleLowerCase()
  const name = doc.name.toLocaleLowerCase()
  const path = doc.path.toLocaleLowerCase()
  const fm = frontmatterText(doc).toLocaleLowerCase()
  const haystack = `${name} ${path} ${fm}`
  if (!tokens.every((token) => haystack.includes(token))) return 0

  let score = 20
  if (name === q) score += 120
  else if (name.startsWith(q)) score += 90
  else if (name.includes(q)) score += 70
  if (path.includes(q)) score += 35
  if (fm.includes(q)) score += 25
  score += Math.max(0, 30 - Math.floor((Date.now() - doc.mtime) / (7 * 24 * 60 * 60 * 1000)))
  return score
}

export function pickBodyReadCandidates(candidates: SearchCandidate[], workspaceId: string): SearchCandidate[] {
  const budget = getBodyReadBudget(workspaceId)
  return [...candidates]
    .filter(({ doc }) => !bodyCache.has(doc.path))
    .sort((a, b) => {
      const scoreDelta = b.metadataScore - a.metadataScore
      if (scoreDelta !== 0) return scoreDelta
      return b.doc.mtime - a.doc.mtime
    })
    .slice(0, budget)
}

function upsertBodyCache(doc: Doc, content: string): void {
  bodyCache.set(doc.path, {
    mtime: doc.mtime,
    size: doc.size,
    content,
    lower: content.toLocaleLowerCase(),
  })
  if (bodyCache.size <= BODY_CACHE_LIMIT) return
  const oldest = bodyCache.keys().next().value as string | undefined
  if (oldest) bodyCache.delete(oldest)
}

function getFreshBodyCache(doc: Doc): BodyCacheEntry | undefined {
  const cached = bodyCache.get(doc.path)
  if (!cached) return undefined
  if (cached.mtime !== doc.mtime || cached.size !== doc.size) {
    bodyCache.delete(doc.path)
    return undefined
  }
  return cached
}

function bodyMatchScore(entry: BodyCacheEntry, query: string, tokens: string[]): number {
  const q = query.toLocaleLowerCase()
  if (!tokens.every((token) => entry.lower.includes(token))) return 0
  let score = 100
  if (entry.lower.includes(q)) score += 70
  score += Math.min(30, tokens.length * 5)
  return score
}

function makeSnippet(text: string, query: string, maxLength = 140): string {
  const lower = text.toLocaleLowerCase()
  const q = query.toLocaleLowerCase()
  const index = lower.indexOf(q)
  const firstTokenIndex = q.includes(' ')
    ? -1
    : lower.indexOf(q.split(/\s+/).find(Boolean) ?? q)
  const hit = index >= 0 ? index : firstTokenIndex
  if (hit < 0) return text.replace(/\s+/g, ' ').trim().slice(0, maxLength)

  const start = Math.max(0, hit - 48)
  const end = Math.min(text.length, hit + q.length + 96)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return `${prefix}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`
}

function makeMetadataSnippet(doc: Doc, project: Project): string {
  const parts = [project.name, doc.path]
  const fm = frontmatterText(doc)
  if (fm) parts.push(fm)
  return parts.join(' · ')
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  let cursor = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]
      results.push(await fn(item))
    }
  })
  await Promise.all(workers)
  return results
}

async function readBodyCandidates(candidates: SearchCandidate[]): Promise<void> {
  const byWorkspace = new Map<string, SearchCandidate[]>()
  for (const candidate of candidates) {
    const list = byWorkspace.get(candidate.project.workspaceId) ?? []
    list.push(candidate)
    byWorkspace.set(candidate.project.workspaceId, list)
  }

  for (const [workspaceId, group] of byWorkspace) {
    const transport = await getActiveTransport(workspaceId).catch(() => null)
    if (!transport) continue
    await mapLimit(group, getBodyReadConcurrency(workspaceId), async ({ doc }) => {
      try {
        const buf = await transport.fs.readFile(doc.path, { maxBytes: BODY_READ_BYTES })
        const parsed = matter(buf.toString('utf-8'))
        upsertBodyCache(doc, parsed.content)
      } catch {
        // Search must degrade silently: path/title matches remain available even when
        // a remote file is slow, too large, or temporarily offline.
      }
    })
  }
}

async function collectSearchCandidates(projectIds?: string[]): Promise<SearchCandidate[]> {
  const projectFilter = projectIds ? new Set(projectIds) : null
  const projects = getCachedProjectsSnapshot().filter((project) => !projectFilter || projectFilter.has(project.id))
  const candidates: SearchCandidate[] = []

  for (const project of projects) {
    let docs = getCachedDocsForProject(project.id)
    if (!docs && !project.workspaceId.startsWith('ssh:')) {
      docs = await getOrScanDocsForProject(project.id, { allowSshScan: false }).catch(() => undefined)
    }
    // SSH safety: never trigger a fresh remote doc scan from search. The project
    // view scan populates this cache explicitly, so search cannot surprise users
    // with a high-latency SFTP crawl.
    if (!docs) continue
    for (const doc of docs) {
      candidates.push({ doc, project, metadataScore: 0 })
    }
  }
  return candidates
}

export async function searchDocs(input: {
  query: string
  limit: number
  projectIds?: string[]
}): Promise<{ results: SearchResult[] }> {
  const query = input.query.trim()
  const tokens = tokenizeQuery(query)
  if (tokens.length === 0) return { results: [] }

  const candidates = await collectSearchCandidates(input.projectIds)
  for (const candidate of candidates) {
    candidate.metadataScore = scoreMetadata(candidate.doc, query, tokens)
  }

  // Single-character probes are common while typing. They should use metadata
  // and already-cached bodies only, not trigger fresh SFTP reads.
  if ([...query].length >= 2) {
    const readCandidatesByWorkspace = new Map<string, SearchCandidate[]>()
    for (const candidate of candidates) {
      const list = readCandidatesByWorkspace.get(candidate.project.workspaceId) ?? []
      list.push(candidate)
      readCandidatesByWorkspace.set(candidate.project.workspaceId, list)
    }
    await Promise.all(
      [...readCandidatesByWorkspace.entries()].map(([, group]) => {
        const workspaceId = group[0]?.project.workspaceId
        return workspaceId ? readBodyCandidates(pickBodyReadCandidates(group, workspaceId)) : Promise.resolve()
      })
    )
  }

  const results = new Map<string, SearchResult>()
  for (const candidate of candidates) {
    const { doc, project, metadataScore } = candidate
    const body = getFreshBodyCache(doc)
    const bodyScore = body ? bodyMatchScore(body, query, tokens) : 0
    const score = metadataScore + bodyScore
    if (score <= 0) continue
    results.set(doc.path, {
      path: doc.path,
      projectId: doc.projectId,
      title: doc.name,
      snippet: bodyScore > 0 && body
        ? makeSnippet(body.content, query)
        : makeMetadataSnippet(doc, project),
      score,
    })
  }

  return {
    results: [...results.values()]
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
      .slice(0, input.limit),
  }
}

export function registerSearchHandlers(): void {
  ipcMain.handle('workspace:search-docs', async (_event, raw: unknown) => {
    const input = parseSearchQueryInput(raw)
    return searchDocs(input)
  })
}
