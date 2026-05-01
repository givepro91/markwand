import { classifyAsset } from '../../lib/viewable'
import type { Doc, DriftReport } from '../../preload/types'

export interface WikiDocLink {
  path: string
  name: string
  reason: 'entrypoint' | 'recent' | 'decision' | 'risk'
  score: number
}

export interface WikiRiskDoc {
  path: string
  name: string
  missing: number
  stale: number
}

export type WikiClusterKey =
  | 'overview'
  | 'decision'
  | 'release'
  | 'implementation'
  | 'operations'
  | 'media'
  | 'reference'

export interface WikiDocCluster {
  key: WikiClusterKey
  count: number
  docs: WikiDocLink[]
}

export type WikiDocDebtReason = 'stale' | 'risk' | 'missingMeta' | 'unread'

export interface WikiDocDebt {
  path: string
  name: string
  score: number
  ageDays: number
  missing: number
  stale: number
  reasons: WikiDocDebtReason[]
}

export type WikiTrustLevel = 'strong' | 'watch' | 'weak'

export type WikiTrustSignalKey = 'riskRefs' | 'staleDocs' | 'missingMetaDocs' | 'unreadDocs' | 'recentDocs'
export type WikiTrustSignalTone = 'danger' | 'warning' | 'neutral' | 'positive'

export interface WikiTrustSignal {
  key: WikiTrustSignalKey
  count: number
  impact: number
  tone: WikiTrustSignalTone
}

export interface WikiTrustScore {
  score: number
  level: WikiTrustLevel
  penalties: {
    riskRefs: number
    staleDocs: number
    missingMetaDocs: number
    unreadDocs: number
  }
  signals: WikiTrustSignal[]
}

export interface WikiLinkHub {
  path: string
  name: string
  inbound: number
  outbound: number
  riskRefs: number
}

export interface WikiRiskLink {
  sourcePath: string
  sourceName: string
  targetPath: string
  targetName: string
  raw: string
  status: 'missing' | 'stale'
  kind: 'at' | 'hint' | 'inline'
  line: number
}

export interface WikiRelationshipMap {
  checkedDocs: number
  totalRefs: number
  okRefs: number
  missingRefs: number
  staleRefs: number
  hubs: WikiLinkHub[]
  riskyLinks: WikiRiskLink[]
}

export type WikiSuggestedTaskIntent =
  | 'repairReferences'
  | 'refreshStaleDocs'
  | 'completeMetadata'
  | 'buildOnboardingBrief'
  | 'extractDecisionTimeline'

export type WikiSuggestedTaskPriority = 'high' | 'medium' | 'low'

export interface WikiSuggestedTask {
  id: string
  intent: WikiSuggestedTaskIntent
  priority: WikiSuggestedTaskPriority
  docs: WikiDocLink[]
}

export interface ProjectWikiSummary {
  totalDocs: number
  markdownDocs: number
  imageDocs: number
  recentDocs: number
  unreadDocs: number
  sourceCounts: Array<{ source: string; count: number }>
  statusCounts: Array<{ status: string; count: number }>
  clusters: WikiDocCluster[]
  docDebt: WikiDocDebt[]
  trust: WikiTrustScore
  relationships: WikiRelationshipMap
  suggestedTasks: WikiSuggestedTask[]
  onboardingPath: WikiDocLink[]
  decisionLog: WikiDocLink[]
  risks: {
    missingRefs: number
    staleRefs: number
    docsWithRisk: WikiRiskDoc[]
  }
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const STALE_DOC_DAYS = 30

function sortSourceCounts(counts: Map<string, number>): Array<{ source: string; count: number }> {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([source, count]) => ({ source, count }))
}

function sortStatusCounts(counts: Map<string, number>): Array<{ status: string; count: number }> {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([status, count]) => ({ status, count }))
}

function addUniqueDoc(
  target: WikiDocLink[],
  seen: Set<string>,
  doc: Doc,
  reason: WikiDocLink['reason'],
  score: number,
  displayName = doc.name
): void {
  if (seen.has(doc.path)) return
  seen.add(doc.path)
  target.push({ path: doc.path, name: displayName, reason, score })
}

function pathSegments(path: string): string[] {
  return path.split(/[\\/]/).filter(Boolean)
}

function commonDirectoryPrefix(paths: string[]): string {
  if (paths.length === 0) return ''
  const splitPaths = paths.map(pathSegments)
  const first = splitPaths[0]
  const prefix: string[] = []
  for (let i = 0; i < first.length - 1; i += 1) {
    if (splitPaths.every((segments) => segments[i] === first[i])) {
      prefix.push(first[i])
    } else {
      break
    }
  }
  return prefix.length > 0 ? `/${prefix.join('/')}` : ''
}

function relativeDocPath(docPath: string, commonRoot: string): string {
  if (commonRoot && docPath.startsWith(`${commonRoot}/`)) {
    return docPath.slice(commonRoot.length + 1)
  }
  return docPath
}

function buildDisplayNameMap(docs: Doc[]): Map<string, string> {
  const commonRoot = commonDirectoryPrefix(docs.map((doc) => doc.path))
  const byName = new Map<string, Doc[]>()
  for (const doc of docs) {
    const items = byName.get(doc.name) ?? []
    items.push(doc)
    byName.set(doc.name, items)
  }

  const names = new Map<string, string>()
  for (const doc of docs) {
    const siblings = byName.get(doc.name) ?? []
    names.set(doc.path, siblings.length > 1 ? relativeDocPath(doc.path, commonRoot) : doc.name)
  }
  return names
}

function displayNameFor(displayNames: Map<string, string>, doc: Doc): string {
  return displayNames.get(doc.path) ?? doc.name
}

function isEntrypointDoc(doc: Doc): boolean {
  const p = doc.path.toLowerCase()
  const n = doc.name.toLowerCase()
  return (
    n === 'readme.md' ||
    n === 'claude.md' ||
    n === 'agents.md' ||
    n === 'nova-state.md' ||
    p.includes('/docs/overview') ||
    p.includes('/docs/index') ||
    p.includes('/docs/start') ||
    p.includes('/docs/onboarding')
  )
}

function isDecisionDoc(doc: Doc): boolean {
  const p = doc.path.toLowerCase()
  const n = doc.name.toLowerCase()
  const source = String(doc.frontmatter?.source ?? '').toLowerCase()
  return (
    source === 'design' ||
    source === 'review' ||
    n.includes('adr') ||
    n.includes('decision') ||
    n.includes('design') ||
    n.includes('plan') ||
    n.includes('review') ||
    n.includes('release') ||
    p.includes('/docs/design') ||
    p.includes('/docs/plan') ||
    p.includes('/docs/release')
  )
}

function scoreEntrypoint(doc: Doc): number {
  const n = doc.name.toLowerCase()
  if (n === 'readme.md') return 100
  if (n === 'claude.md' || n === 'agents.md') return 90
  if (n === 'nova-state.md') return 85
  return 70
}

function clusterDoc(doc: Doc): WikiClusterKey {
  if (classifyAsset(doc.path) === 'image') return 'media'

  const p = doc.path.toLowerCase()
  const n = doc.name.toLowerCase()
  const source = String(doc.frontmatter?.source ?? '').toLowerCase()
  const status = String(doc.frontmatter?.status ?? '').toLowerCase()

  if (isEntrypointDoc(doc)) return 'overview'
  if (isDecisionDoc(doc)) return 'decision'
  if (source === 'release' || n.includes('release') || p.includes('/release')) return 'release'
  if (
    source === 'ops' ||
    source === 'operation' ||
    source === 'runbook' ||
    status === 'runbook' ||
    n.includes('runbook') ||
    n.includes('deploy') ||
    p.includes('/ops') ||
    p.includes('/runbook')
  ) {
    return 'operations'
  }
  if (
    source === 'implementation' ||
    source === 'code' ||
    n.includes('api') ||
    n.includes('hook') ||
    n.includes('component') ||
    p.includes('/src/') ||
    p.includes('/implementation')
  ) {
    return 'implementation'
  }

  return 'reference'
}

function buildClusters(docs: Doc[], displayNames: Map<string, string>): WikiDocCluster[] {
  const buckets = new Map<WikiClusterKey, Doc[]>()
  for (const doc of docs) {
    const key = clusterDoc(doc)
    const bucket = buckets.get(key) ?? []
    bucket.push(doc)
    buckets.set(key, bucket)
  }

  return Array.from(buckets.entries())
    .map(([key, bucket]) => ({
      key,
      count: bucket.length,
      docs: bucket
        .sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name))
        .slice(0, 3)
        .map((doc) => ({ path: doc.path, name: displayNameFor(displayNames, doc), reason: 'recent' as const, score: doc.mtime })),
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

function buildRelationshipMap(
  docs: Doc[],
  driftReports: Record<string, DriftReport>,
  displayNames: Map<string, string>
): WikiRelationshipMap {
  const docsByPath = new Map(docs.map((doc) => [doc.path, doc]))
  const hubStats = new Map<string, WikiLinkHub>()
  const riskyLinks: WikiRiskLink[] = []
  let checkedDocs = 0
  let totalRefs = 0
  let okRefs = 0
  let missingRefs = 0
  let staleRefs = 0

  const ensureHub = (doc: Doc): WikiLinkHub => {
    const existing = hubStats.get(doc.path)
    if (existing) return existing
    const next: WikiLinkHub = {
      path: doc.path,
      name: displayNameFor(displayNames, doc),
      inbound: 0,
      outbound: 0,
      riskRefs: 0,
    }
    hubStats.set(doc.path, next)
    return next
  }

  for (const sourceDoc of docs) {
    const report = driftReports[sourceDoc.path]
    if (!report) continue

    checkedDocs += 1
    totalRefs += report.references.length
    okRefs += report.counts.ok
    missingRefs += report.counts.missing
    staleRefs += report.counts.stale

    const sourceHub = ensureHub(sourceDoc)
    sourceHub.outbound += report.references.length
    sourceHub.riskRefs += report.counts.missing + report.counts.stale

    for (const ref of report.references) {
      const targetDoc = docsByPath.get(ref.resolvedPath) ?? (ref.fallbackPath ? docsByPath.get(ref.fallbackPath) : undefined)
      if (targetDoc) {
        ensureHub(targetDoc).inbound += 1
      }

      if (ref.status === 'missing' || ref.status === 'stale') {
        riskyLinks.push({
          sourcePath: sourceDoc.path,
          sourceName: displayNameFor(displayNames, sourceDoc),
          targetPath: targetDoc?.path ?? ref.resolvedPath,
          targetName: targetDoc ? displayNameFor(displayNames, targetDoc) : basename(ref.resolvedPath),
          raw: ref.raw,
          status: ref.status,
          kind: ref.kind,
          line: ref.line,
        })
      }
    }
  }

  const hubs = Array.from(hubStats.values())
    .filter((hub) => hub.inbound > 0 || hub.outbound > 0 || hub.riskRefs > 0)
    .sort((a, b) => {
      const aScore = a.inbound * 3 + a.outbound + a.riskRefs * 4
      const bScore = b.inbound * 3 + b.outbound + b.riskRefs * 4
      return bScore - aScore || b.inbound - a.inbound || a.name.localeCompare(b.name)
    })
    .slice(0, 5)

  riskyLinks.sort((a, b) => {
    const statusWeight = { missing: 2, stale: 1 }
    return statusWeight[b.status] - statusWeight[a.status] || a.sourceName.localeCompare(b.sourceName) || a.line - b.line
  })

  return {
    checkedDocs,
    totalRefs,
    okRefs,
    missingRefs,
    staleRefs,
    hubs,
    riskyLinks: riskyLinks.slice(0, 5),
  }
}

function buildDocDebt(
  docs: Doc[],
  driftReports: Record<string, DriftReport>,
  readDocs: Record<string, number>,
  displayNames: Map<string, string>,
  now: number
): WikiDocDebt[] {
  return docs
    .map((doc) => {
      const report = driftReports[doc.path]
      const missing = report?.counts.missing ?? 0
      const stale = report?.counts.stale ?? 0
      const ageDays = Math.max(0, Math.floor((now - doc.mtime) / DAY_MS))
      const reasons: WikiDocDebtReason[] = []
      let score = 0

      if (ageDays >= STALE_DOC_DAYS) {
        reasons.push('stale')
        score += Math.min(40, Math.floor(ageDays / 7) * 4)
      }
      if (missing > 0 || stale > 0) {
        reasons.push('risk')
        score += missing * 25 + stale * 15
      }
      if (!doc.frontmatter?.source || !doc.frontmatter?.status) {
        reasons.push('missingMeta')
        score += 12
      }
      if (!readDocs[doc.path]) {
        reasons.push('unread')
        score += 5
      }

      return {
        path: doc.path,
        name: displayNameFor(displayNames, doc),
        score,
        ageDays,
        missing,
        stale,
        reasons,
      }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.ageDays - a.ageDays || a.name.localeCompare(b.name))
    .slice(0, 5)
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function buildTrustScore(
  docs: Doc[],
  docDebt: WikiDocDebt[],
  unreadDocs: number,
  recentDocs: number,
  missingRefs: number,
  staleRefs: number
): WikiTrustScore {
  const riskRefs = missingRefs + staleRefs
  const staleDocs = docDebt.filter((item) => item.reasons.includes('stale')).length
  const missingMetaDocs = docs.filter((doc) => !doc.frontmatter?.source || !doc.frontmatter?.status).length
  const riskImpact = Math.min(45, riskRefs * 10)
  const staleImpact = Math.min(25, staleDocs * 8)
  const missingMetaImpact = Math.min(20, missingMetaDocs * 4)
  const unreadImpact = Math.min(10, unreadDocs * 2)
  const recentBoost = Math.min(10, recentDocs * 2)
  const score = clampScore(
    100 - riskImpact - staleImpact - missingMetaImpact - unreadImpact + recentBoost
  )
  const level: WikiTrustLevel = score >= 80 ? 'strong' : score >= 55 ? 'watch' : 'weak'
  const allSignals: WikiTrustSignal[] = [
    { key: 'riskRefs', count: riskRefs, impact: -riskImpact, tone: 'danger' },
    { key: 'staleDocs', count: staleDocs, impact: -staleImpact, tone: 'warning' },
    { key: 'missingMetaDocs', count: missingMetaDocs, impact: -missingMetaImpact, tone: 'neutral' },
    { key: 'unreadDocs', count: unreadDocs, impact: -unreadImpact, tone: 'neutral' },
    { key: 'recentDocs', count: recentDocs, impact: recentBoost, tone: 'positive' },
  ]
  const signals = allSignals.filter((signal) => signal.count > 0 && signal.impact !== 0)

  return {
    score,
    level,
    penalties: {
      riskRefs,
      staleDocs,
      missingMetaDocs,
      unreadDocs,
    },
    signals,
  }
}

function docDebtToLink(item: WikiDocDebt): WikiDocLink {
  return {
    path: item.path,
    name: item.name,
    reason: item.reasons.includes('risk') ? 'risk' : 'recent',
    score: item.score,
  }
}

function buildSuggestedTasks(
  onboardingPath: WikiDocLink[],
  decisionLog: WikiDocLink[],
  docsWithRisk: WikiRiskDoc[],
  docDebt: WikiDocDebt[],
  trust: WikiTrustScore
): WikiSuggestedTask[] {
  const tasks: WikiSuggestedTask[] = []
  const addTask = (task: WikiSuggestedTask) => {
    if (tasks.some((item) => item.id === task.id)) return
    tasks.push(task)
  }

  if (docsWithRisk.length > 0) {
    addTask({
      id: 'repair-references',
      intent: 'repairReferences',
      priority: 'high',
      docs: docsWithRisk.slice(0, 3).map((doc) => ({
        path: doc.path,
        name: doc.name,
        reason: 'risk',
        score: doc.missing * 25 + doc.stale * 15,
      })),
    })
  }

  const staleDocs = docDebt.filter((item) => item.reasons.includes('stale'))
  if (staleDocs.length > 0) {
    addTask({
      id: 'refresh-stale-docs',
      intent: 'refreshStaleDocs',
      priority: trust.level === 'weak' ? 'high' : 'medium',
      docs: staleDocs.slice(0, 3).map(docDebtToLink),
    })
  }

  const missingMetaDocs = docDebt.filter((item) => item.reasons.includes('missingMeta'))
  if (missingMetaDocs.length > 0) {
    addTask({
      id: 'complete-metadata',
      intent: 'completeMetadata',
      priority: 'medium',
      docs: missingMetaDocs.slice(0, 3).map(docDebtToLink),
    })
  }

  if (onboardingPath.length > 0) {
    addTask({
      id: 'build-onboarding-brief',
      intent: 'buildOnboardingBrief',
      priority: tasks.length === 0 ? 'high' : 'low',
      docs: onboardingPath.slice(0, 4),
    })
  }

  if (decisionLog.length >= 2) {
    addTask({
      id: 'extract-decision-timeline',
      intent: 'extractDecisionTimeline',
      priority: 'low',
      docs: decisionLog.slice(0, 4),
    })
  }

  const priorityWeight: Record<WikiSuggestedTaskPriority, number> = { high: 3, medium: 2, low: 1 }
  const intentWeight: Record<WikiSuggestedTaskIntent, number> = {
    repairReferences: 5,
    refreshStaleDocs: 4,
    completeMetadata: 3,
    buildOnboardingBrief: 2,
    extractDecisionTimeline: 1,
  }
  return tasks
    .sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority] || intentWeight[b.intent] - intentWeight[a.intent])
    .slice(0, 3)
}

export function buildProjectWikiSummary(
  docs: Doc[],
  driftReports: Record<string, DriftReport>,
  readDocs: Record<string, number>,
  now = Date.now()
): ProjectWikiSummary {
  const markdownDocs = docs.filter((doc) => classifyAsset(doc.path) === 'md')
  const imageDocs = docs.filter((doc) => classifyAsset(doc.path) === 'image')
  const displayNames = buildDisplayNameMap([...markdownDocs, ...imageDocs])
  const recentCutoff = now - WEEK_MS
  const sourceCounts = new Map<string, number>()
  const statusCounts = new Map<string, number>()

  for (const doc of markdownDocs) {
    const source = doc.frontmatter?.source
    if (typeof source === 'string' && source.trim()) {
      sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1)
    }
    const status = doc.frontmatter?.status
    if (typeof status === 'string' && status.trim()) {
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1)
    }
  }

  const recentSorted = [...markdownDocs].sort((a, b) => b.mtime - a.mtime)
  const onboardingPath: WikiDocLink[] = []
  const onboardingSeen = new Set<string>()
  for (const doc of markdownDocs.filter(isEntrypointDoc).sort((a, b) => scoreEntrypoint(b) - scoreEntrypoint(a))) {
    addUniqueDoc(onboardingPath, onboardingSeen, doc, 'entrypoint', scoreEntrypoint(doc), displayNameFor(displayNames, doc))
    if (onboardingPath.length >= 5) break
  }
  for (const doc of recentSorted) {
    addUniqueDoc(onboardingPath, onboardingSeen, doc, 'recent', Math.max(1, Math.round(doc.mtime / 1_000_000)), displayNameFor(displayNames, doc))
    if (onboardingPath.length >= 5) break
  }

  const decisionLog = markdownDocs
    .filter(isDecisionDoc)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 6)
    .map((doc) => ({ path: doc.path, name: displayNameFor(displayNames, doc), reason: 'decision' as const, score: doc.mtime }))

  const docsWithRisk: WikiRiskDoc[] = []
  let missingRefs = 0
  let staleRefs = 0
  for (const doc of markdownDocs) {
    const report = driftReports[doc.path]
    if (!report) continue
    missingRefs += report.counts.missing
    staleRefs += report.counts.stale
    if (report.counts.missing > 0 || report.counts.stale > 0) {
      docsWithRisk.push({
        path: doc.path,
        name: displayNameFor(displayNames, doc),
        missing: report.counts.missing,
        stale: report.counts.stale,
      })
    }
  }
  docsWithRisk.sort((a, b) => (b.missing + b.stale) - (a.missing + a.stale) || a.name.localeCompare(b.name))
  const unreadDocs = markdownDocs.filter((doc) => !readDocs[doc.path]).length
  const recentDocs = markdownDocs.filter((doc) => doc.mtime >= recentCutoff).length
  const docDebt = buildDocDebt(markdownDocs, driftReports, readDocs, displayNames, now)
  const trust = buildTrustScore(markdownDocs, docDebt, unreadDocs, recentDocs, missingRefs, staleRefs)
  const relationships = buildRelationshipMap(markdownDocs, driftReports, displayNames)

  return {
    totalDocs: docs.length,
    markdownDocs: markdownDocs.length,
    imageDocs: imageDocs.length,
    recentDocs,
    unreadDocs,
    sourceCounts: sortSourceCounts(sourceCounts).slice(0, 5),
    statusCounts: sortStatusCounts(statusCounts).slice(0, 5),
    clusters: buildClusters([...markdownDocs, ...imageDocs], displayNames).slice(0, 6),
    docDebt,
    trust,
    relationships,
    suggestedTasks: buildSuggestedTasks(onboardingPath, decisionLog, docsWithRisk, docDebt, trust),
    onboardingPath,
    decisionLog,
    risks: {
      missingRefs,
      staleRefs,
      docsWithRisk: docsWithRisk.slice(0, 5),
    },
  }
}
