import type { Doc, GitPulseSummary } from '../../preload/types'
import { classifyWikiDocRole, type WikiDocRole } from './projectWiki'

export type WikiGitInsightKind =
  | 'dirtyWork'
  | 'operationalCheck'
  | 'currentGuideCheck'
  | 'referenceCheck'
  | 'decisionTrace'

export type WikiGitInsightPriority = 'high' | 'medium' | 'low'

export interface WikiGitInsight {
  kind: WikiGitInsightKind
  priority: WikiGitInsightPriority
  doc?: {
    path: string
    name: string
    role: WikiDocRole
    ageDays: number
  }
  changedFile?: string
}

export interface ProjectWikiGitContext {
  branch?: string
  recentCommitCount: number
  changedFileCount: number
  dirtyCount: number
  changedAreas: string[]
  insights: WikiGitInsight[]
}

const DAY_MS = 24 * 60 * 60 * 1000

const ROLE_STALE_DAYS: Partial<Record<WikiDocRole, number>> = {
  currentGuide: 30,
  operational: 14,
  reference: 45,
}

const CODE_PATH_RE = /^(src|app|apps|packages|lib|server|main|renderer|components|hooks|utils|api|scripts|config|electron|package\.json|pnpm-lock\.yaml|vite\.config|tsconfig)/i
const OPERATIONAL_PATH_RE = /(deploy|migration|migrate|ops|runbook|infra|docker|release|installer|sign|notar)/i
const REFERENCE_PATH_RE = /(api|schema|model|type|interface|contract|architecture|adapter|service|ipc|transport)/i

function ageDays(doc: Doc, now: number): number {
  return Math.max(0, Math.floor((now - doc.mtime) / DAY_MS))
}

function isMarkdownPath(path: string): boolean {
  return /\.mdx?$/i.test(path)
}

function isCodeChange(path: string): boolean {
  return CODE_PATH_RE.test(path) && !isMarkdownPath(path)
}

function oldestRoleDoc(docs: Doc[], role: WikiDocRole, now: number): WikiGitInsight['doc'] | null {
  const threshold = ROLE_STALE_DAYS[role] ?? Number.POSITIVE_INFINITY
  const candidates = docs
    .filter((doc) => classifyWikiDocRole(doc) === role)
    .map((doc) => ({ doc, ageDays: ageDays(doc, now) }))
    .filter((item) => item.ageDays >= threshold)
    .sort((a, b) => b.ageDays - a.ageDays || a.doc.name.localeCompare(b.doc.name))

  const picked = candidates[0]
  if (!picked) return null
  return {
    path: picked.doc.path,
    name: picked.doc.name,
    role,
    ageDays: picked.ageDays,
  }
}

function firstMatchingFile(files: string[], pattern: RegExp): string | undefined {
  return files.find((file) => pattern.test(file))
}

export function buildProjectWikiGitContext(
  docs: Doc[],
  pulse: GitPulseSummary | null | undefined,
  now = Date.now()
): ProjectWikiGitContext | null {
  if (!pulse?.available) return null

  const changedFiles = pulse.changedFiles ?? []
  const codeChangedFiles = changedFiles.filter(isCodeChange)
  const activeCodeFlow = (pulse.recentCommitCount ?? 0) >= 4 || codeChangedFiles.length >= 3
  const insights: WikiGitInsight[] = []

  if ((pulse.dirtyCount ?? 0) > 0) {
    insights.push({ kind: 'dirtyWork', priority: 'medium' })
  }

  const operationalFile = firstMatchingFile(codeChangedFiles, OPERATIONAL_PATH_RE)
  const operationalDoc = operationalFile ? oldestRoleDoc(docs, 'operational', now) : null
  if (operationalDoc) {
    insights.push({
      kind: 'operationalCheck',
      priority: 'high',
      doc: operationalDoc,
      changedFile: operationalFile,
    })
  }

  const currentGuideDoc = activeCodeFlow ? oldestRoleDoc(docs, 'currentGuide', now) : null
  if (currentGuideDoc) {
    insights.push({
      kind: 'currentGuideCheck',
      priority: 'medium',
      doc: currentGuideDoc,
      changedFile: codeChangedFiles[0],
    })
  }

  const referenceFile = firstMatchingFile(codeChangedFiles, REFERENCE_PATH_RE)
  const referenceDoc = referenceFile ? oldestRoleDoc(docs, 'reference', now) : null
  if (referenceDoc) {
    insights.push({
      kind: 'referenceCheck',
      priority: 'medium',
      doc: referenceDoc,
      changedFile: referenceFile,
    })
  }

  if (activeCodeFlow) {
    const traceDoc = docs
      .filter((doc) => ['decisionRecord', 'workLog'].includes(classifyWikiDocRole(doc)))
      .sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name))[0]
    if (traceDoc) {
      insights.push({
        kind: 'decisionTrace',
        priority: 'low',
        doc: {
          path: traceDoc.path,
          name: traceDoc.name,
          role: classifyWikiDocRole(traceDoc),
          ageDays: ageDays(traceDoc, now),
        },
        changedFile: codeChangedFiles[0],
      })
    }
  }

  return {
    branch: pulse.branch,
    recentCommitCount: pulse.recentCommitCount ?? 0,
    changedFileCount: pulse.changedFileCount ?? 0,
    dirtyCount: pulse.dirtyCount ?? 0,
    changedAreas: pulse.changedAreas ?? [],
    insights: insights.slice(0, 3),
  }
}

const handoffInsightText: Record<WikiGitInsightKind, string> = {
  dirtyWork: 'Uncommitted local work exists. Capture the current intent before asking AI to act.',
  operationalCheck: 'Operational code or release flow changed. Check the related runbook only if it still guides current execution.',
  currentGuideCheck: 'Recent code activity is high. Check the current guide for newcomer-facing assumptions, but do not rewrite historical plans.',
  referenceCheck: 'API or architecture-like files changed. Confirm the related reference doc if it is still used as current guidance.',
  decisionTrace: 'Recent commits may be execution traces of planning/design docs. Preserve those docs as context unless they claim to be current guidance.',
}

export function formatProjectWikiGitContext(context: ProjectWikiGitContext | null | undefined): string[] {
  if (!context) return []

  const lines = [
    `- Branch: ${context.branch ?? 'HEAD'}`,
    `- Recent commits: ${context.recentCommitCount}`,
    `- Changed files: ${context.changedFileCount}`,
    `- Uncommitted changes: ${context.dirtyCount}`,
  ]

  if (context.changedAreas.length > 0) {
    lines.push(`- Changed areas: ${context.changedAreas.slice(0, 5).join(', ')}`)
  }

  if (context.insights.length > 0) {
    lines.push('- Role-sensitive interpretation:')
    for (const insight of context.insights) {
      const docPart = insight.doc ? ` (${insight.doc.name}, ${insight.doc.role}, ${insight.doc.ageDays}d old)` : ''
      const filePart = insight.changedFile ? ` via ${insight.changedFile}` : ''
      lines.push(`  - [${insight.priority}] ${handoffInsightText[insight.kind]}${docPart}${filePart}`)
    }
  }

  return lines
}
