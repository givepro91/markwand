import { ipcMain } from 'electron'
import { execa } from 'execa'
import path from 'path'
import { getStore } from '../services/store'
import { assertInWorkspace, parseGitSummaryInput } from '../security/validators'
import type { GitPulseSummary, Workspace } from '../../preload/types'

const GIT_TIMEOUT_MS = 2_000
const CACHE_TTL_MS = 30_000
const MAX_COMMITS = 6

interface GitPulseCacheEntry {
  head: string
  dirtySignature: string
  summary: GitPulseSummary
  cachedAt: number
}

const cache = new Map<string, GitPulseCacheEntry>()

function localWorkspaceRoots(workspaces: Workspace[]): string[] {
  return workspaces.filter((workspace) => workspace.transport?.type !== 'ssh').map((workspace) => workspace.root)
}

function isSshWorkspaceRoot(projectRoot: string, workspaces: Workspace[]): boolean {
  return workspaces.some((workspace) => {
    if (workspace.transport?.type !== 'ssh') return false
    const root = workspace.root.endsWith('/') ? workspace.root : `${workspace.root}/`
    return projectRoot === workspace.root || projectRoot.startsWith(root)
  })
}

async function git(args: string[], cwd: string): Promise<string> {
  const result = await execa('git', args, {
    cwd,
    timeout: GIT_TIMEOUT_MS,
    reject: false,
    stripFinalNewline: true,
  })
  if (result.timedOut) throw new Error('GIT_TIMEOUT')
  if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout || 'GIT_FAILED')
  return result.stdout
}

function parseRecentCommits(raw: string): NonNullable<GitPulseSummary['commits']> {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash = '', relativeTime = '', author = '', ...subjectParts] = line.split('\t')
      return {
        hash,
        relativeTime,
        author,
        subject: subjectParts.join('\t') || hash,
      }
    })
}

function changedAreasFromFiles(raw: string): string[] {
  const areas = new Map<string, number>()
  for (const line of raw.split('\n')) {
    const file = line.trim()
    if (!file) continue
    const parts = file.split('/').filter(Boolean)
    const area = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0] ?? file
    areas.set(area, (areas.get(area) ?? 0) + 1)
  }
  return Array.from(areas.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([area]) => area)
}

function reasonFromError(err: unknown): GitPulseSummary['reason'] {
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('GIT_TIMEOUT') || message.includes('timed out')) return 'timeout'
  if (message.includes('not a git repository')) return 'not-git'
  return 'error'
}

export async function buildLocalGitPulseSummary(projectRoot: string, now = Date.now()): Promise<GitPulseSummary> {
  try {
    const [inside, head, dirtyRaw] = await Promise.all([
      git(['rev-parse', '--is-inside-work-tree'], projectRoot),
      git(['rev-parse', '--short', 'HEAD'], projectRoot),
      git(['status', '--porcelain'], projectRoot),
    ])
    if (inside.trim() !== 'true') return { available: false, reason: 'not-git' }

    const dirtySignature = dirtyRaw
    const cached = cache.get(projectRoot)
    if (cached && cached.head === head && cached.dirtySignature === dirtySignature && now - cached.cachedAt < CACHE_TTL_MS) {
      return { ...cached.summary, cachedAt: cached.cachedAt }
    }

    const [branch, recentCountRaw, changedFilesRaw, latestTagRaw, commitsRaw] = await Promise.all([
      git(['branch', '--show-current'], projectRoot).catch(() => ''),
      git(['rev-list', '--count', '--since=14.days', 'HEAD'], projectRoot).catch(() => '0'),
      git(['log', '--since=14.days', '--name-only', '--pretty=format:'], projectRoot).catch(() => ''),
      git(['describe', '--tags', '--abbrev=0'], projectRoot).catch(() => ''),
      git(['log', `-${MAX_COMMITS}`, '--date=relative', '--pretty=format:%h%x09%cr%x09%an%x09%s'], projectRoot).catch(() => ''),
    ])

    const changedFiles = Array.from(new Set(changedFilesRaw.split('\n').map((line) => line.trim()).filter(Boolean)))
    const summary: GitPulseSummary = {
      available: true,
      branch: branch || 'HEAD',
      head,
      dirtyCount: dirtyRaw.split('\n').filter(Boolean).length,
      recentCommitCount: Number.parseInt(recentCountRaw, 10) || 0,
      changedFileCount: changedFiles.length,
      changedAreas: changedAreasFromFiles(changedFilesRaw),
      latestTag: latestTagRaw || undefined,
      commits: parseRecentCommits(commitsRaw),
      cachedAt: now,
    }
    cache.set(projectRoot, { head, dirtySignature, summary, cachedAt: now })
    return summary
  } catch (err) {
    return { available: false, reason: reasonFromError(err), cachedAt: now }
  }
}

export function registerGitHandlers(): void {
  ipcMain.handle('project:git-summary', async (_event, raw: unknown): Promise<GitPulseSummary> => {
    const { projectRoot } = parseGitSummaryInput(raw)
    const normalizedRoot = path.resolve(projectRoot)
    const store = await getStore()
    const workspaces = store.get('workspaces')

    if (isSshWorkspaceRoot(projectRoot, workspaces)) {
      return { available: false, reason: 'ssh-unsupported', cachedAt: Date.now() }
    }

    assertInWorkspace(normalizedRoot, localWorkspaceRoots(workspaces))
    return buildLocalGitPulseSummary(normalizedRoot)
  })
}
