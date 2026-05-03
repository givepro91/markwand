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
  role?: WikiDocRole
  score?: number
  action?: WikiRiskAction
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
export type WikiRiskAction = 'fix' | 'confirm' | 'preserve'

export type WikiDocRole =
  | 'currentGuide'
  | 'operational'
  | 'reference'
  | 'decisionRecord'
  | 'workLog'
  | 'tooling'
  | 'archive'
  | 'ideaDraft'

export interface WikiDocRoleGroup {
  role: WikiDocRole
  count: number
  docs: WikiDocLink[]
}

export interface WikiDocDebt {
  path: string
  name: string
  role: WikiDocRole
  action: WikiRiskAction
  score: number
  ageDays: number
  missing: number
  stale: number
  reasons: WikiDocDebtReason[]
}

export type WikiDecisionKind = 'plan' | 'design' | 'review' | 'release' | 'decision'

export interface WikiDecisionEvent {
  path: string
  name: string
  kind: WikiDecisionKind
  status: string | null
  source: string | null
  ageDays: number
  score: number
}

export type WikiTrustLevel = 'strong' | 'watch' | 'weak'

export type WikiTrustSignalKey = 'riskRefs' | 'staleRefs' | 'staleDocs' | 'missingMetaDocs' | 'unreadDocs' | 'recentDocs'
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
    staleRefs: number
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
  kind: 'at' | 'hint' | 'inline' | 'plain'
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

export type WikiPulseTone = 'healthy' | 'active' | 'attention'
export type WikiPulseFocus = WikiSuggestedTaskIntent | 'readFirst'
export type WikiPulseReason = 'riskRefs' | 'staleRefs' | 'staleDocs' | 'missingMetaDocs' | 'unreadDocs' | 'recentDocs' | 'healthy'

export interface WikiProjectPulse {
  tone: WikiPulseTone
  focus: WikiPulseFocus
  reasons: WikiPulseReason[]
  primaryDoc: WikiDocLink | null
  actionTaskId: string | null
}

export interface ProjectWikiSummary {
  totalDocs: number
  markdownDocs: number
  imageDocs: number
  recentDocs: number
  unreadDocs: number
  sourceCounts: Array<{ source: string; count: number }>
  statusCounts: Array<{ status: string; count: number }>
  roleGroups?: WikiDocRoleGroup[]
  clusters: WikiDocCluster[]
  docDebt: WikiDocDebt[]
  trust: WikiTrustScore
  pulse: WikiProjectPulse
  relationships: WikiRelationshipMap
  suggestedTasks: WikiSuggestedTask[]
  onboardingPath: WikiDocLink[]
  decisionLog: WikiDocLink[]
  decisionTimeline: WikiDecisionEvent[]
  risks: {
    missingRefs: number
    staleRefs: number
    docsWithRisk: WikiRiskDoc[]
  }
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

interface WikiDocRolePolicy {
  staleAfterDays: number
  staleDocImpact: number
  missingRefImpact: number
  staleRefImpact: number
  missingMetaImpact: number
  unreadImpact: number
  maintenanceSensitivity: number
}

const ROLE_POLICY: Record<WikiDocRole, WikiDocRolePolicy> = {
  currentGuide: {
    staleAfterDays: 30,
    staleDocImpact: 8,
    missingRefImpact: 12,
    staleRefImpact: 4,
    missingMetaImpact: 4,
    unreadImpact: 2,
    maintenanceSensitivity: 1,
  },
  operational: {
    staleAfterDays: 14,
    staleDocImpact: 12,
    missingRefImpact: 15,
    staleRefImpact: 5,
    missingMetaImpact: 4,
    unreadImpact: 2,
    maintenanceSensitivity: 1.2,
  },
  reference: {
    staleAfterDays: 45,
    staleDocImpact: 6,
    missingRefImpact: 10,
    staleRefImpact: 3,
    missingMetaImpact: 3,
    unreadImpact: 1.5,
    maintenanceSensitivity: 0.85,
  },
  decisionRecord: {
    staleAfterDays: 90,
    staleDocImpact: 3,
    missingRefImpact: 7,
    staleRefImpact: 1.5,
    missingMetaImpact: 2,
    unreadImpact: 1,
    maintenanceSensitivity: 0.55,
  },
  workLog: {
    staleAfterDays: Number.POSITIVE_INFINITY,
    staleDocImpact: 0,
    missingRefImpact: 3,
    staleRefImpact: 0.5,
    missingMetaImpact: 1,
    unreadImpact: 0,
    maintenanceSensitivity: 0.2,
  },
  tooling: {
    staleAfterDays: Number.POSITIVE_INFINITY,
    staleDocImpact: 0,
    missingRefImpact: 1,
    staleRefImpact: 0,
    missingMetaImpact: 0,
    unreadImpact: 0,
    maintenanceSensitivity: 0.05,
  },
  archive: {
    staleAfterDays: Number.POSITIVE_INFINITY,
    staleDocImpact: 0,
    missingRefImpact: 1,
    staleRefImpact: 0,
    missingMetaImpact: 0,
    unreadImpact: 0,
    maintenanceSensitivity: 0.05,
  },
  ideaDraft: {
    staleAfterDays: Number.POSITIVE_INFINITY,
    staleDocImpact: 0,
    missingRefImpact: 2,
    staleRefImpact: 0.5,
    missingMetaImpact: 1,
    unreadImpact: 0,
    maintenanceSensitivity: 0.15,
  },
}

function riskActionFor(role: WikiDocRole, missing: number, stale: number): WikiRiskAction {
  if (role === 'workLog' || role === 'archive' || role === 'tooling' || role === 'ideaDraft') {
    return 'preserve'
  }
  if (missing > 0 && (role === 'currentGuide' || role === 'operational' || role === 'reference')) {
    return 'fix'
  }
  if (missing > 0 && role === 'decisionRecord') {
    return 'confirm'
  }
  if (stale > 0) {
    return 'confirm'
  }
  return role === 'currentGuide' || role === 'operational' ? 'confirm' : 'preserve'
}

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

function normalizedDocPath(doc: Doc): string {
  return doc.path.toLowerCase().replace(/\\/g, '/')
}

function isToolingSessionDoc(doc: Doc): boolean {
  const p = normalizedDocPath(doc)
  return p.includes('/.claude/sessions/')
}

function isToolingSupportDoc(doc: Doc): boolean {
  const p = normalizedDocPath(doc)
  return (
    p.includes('/.claude/') ||
    p.includes('/.agents/skills/') ||
    p.includes('/.claude/agents/') ||
    p.includes('/.claude/commands/') ||
    p.includes('/.claude/rules/')
  )
}

function isEntrypointDoc(doc: Doc): boolean {
  if (isToolingSessionDoc(doc) || isToolingSupportDoc(doc)) return false
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
  if (isToolingSessionDoc(doc) || isToolingSupportDoc(doc)) return false
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

export function classifyWikiDocRole(doc: Doc): WikiDocRole {
  const p = doc.path.toLowerCase()
  const n = doc.name.toLowerCase()
  const base = basename(doc.path).toLowerCase()
  const source = String(doc.frontmatter?.source ?? '').toLowerCase()
  const status = String(doc.frontmatter?.status ?? '').toLowerCase()

  if (isToolingSessionDoc(doc)) return 'workLog'
  if (isToolingSupportDoc(doc)) return 'tooling'

  if (
    p.includes('/archive/') ||
    p.includes('/archived/') ||
    p.includes('/legacy/') ||
    n.includes('archive') ||
    n.includes('archived') ||
    n.includes('legacy') ||
    base.startsWith('old-')
  ) {
    return 'archive'
  }

  if (
    source === 'ops' ||
    source === 'operation' ||
    source === 'runbook' ||
    status === 'runbook' ||
    n.includes('deploy') ||
    n.includes('runbook') ||
    n.includes('migration') ||
    n.includes('incident') ||
    n.includes('oncall') ||
    p.includes('/docs/ops/') ||
    p.includes('/ops/') ||
    p.includes('/runbook') ||
    p.includes('/migration')
  ) {
    return 'operational'
  }

  if (
    isEntrypointDoc(doc) ||
    n.includes('setup') ||
    n.includes('install') ||
    n.includes('getting-started') ||
    n.includes('manual') ||
    p.includes('/docs/start') ||
    p.includes('/docs/onboarding')
  ) {
    return 'currentGuide'
  }

  if (
    n.includes('brief') ||
    n.includes('brainstorm') ||
    n.includes('proposal') ||
    n.includes('idea') ||
    n.includes('concept') ||
    source === 'proposal' ||
    source === 'idea'
  ) {
    return 'ideaDraft'
  }

  if (
    n.includes('plan') ||
    n.includes('sprint') ||
    n.includes('retrospective') ||
    n.includes('log') ||
    p.includes('/docs/plan') ||
    p.includes('/docs/plans') ||
    p.includes('/sprint') ||
    p.includes('/retrospective')
  ) {
    return 'workLog'
  }

  if (
    source === 'design' ||
    source === 'review' ||
    source === 'release' ||
    source === 'decision' ||
    n.includes('adr') ||
    n.includes('decision') ||
    n.includes('design') ||
    n.includes('review') ||
    n.includes('release') ||
    p.includes('/docs/design') ||
    p.includes('/docs/release')
  ) {
    return 'decisionRecord'
  }

  return 'reference'
}

function classifyDecisionKind(doc: Doc): WikiDecisionKind {
  const p = doc.path.toLowerCase()
  const n = doc.name.toLowerCase()
  const source = String(doc.frontmatter?.source ?? '').toLowerCase()

  if (source === 'release' || n.includes('release') || p.includes('/release')) return 'release'
  if (source === 'review' || n.includes('review') || p.includes('/review')) return 'review'
  if (n.includes('plan') || p.includes('/plan')) return 'plan'
  if (source === 'design' || n.includes('design') || n.includes('adr') || p.includes('/design')) return 'design'
  return 'decision'
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

function buildRoleGroups(docs: Doc[], displayNames: Map<string, string>): WikiDocRoleGroup[] {
  const buckets = new Map<WikiDocRole, Doc[]>()
  for (const doc of docs) {
    const role = classifyWikiDocRole(doc)
    const bucket = buckets.get(role) ?? []
    bucket.push(doc)
    buckets.set(role, bucket)
  }

  const roleOrder: Record<WikiDocRole, number> = {
    currentGuide: 0,
    operational: 1,
    reference: 2,
    decisionRecord: 3,
    workLog: 4,
    tooling: 5,
    archive: 6,
    ideaDraft: 7,
  }

  return Array.from(buckets.entries())
    .map(([role, bucket]) => ({
      role,
      count: bucket.length,
      docs: bucket
        .sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name))
        .slice(0, 3)
        .map((doc) => ({
          path: doc.path,
          name: displayNameFor(displayNames, doc),
          reason: isEntrypointDoc(doc) ? 'entrypoint' as const : 'recent' as const,
          score: doc.mtime,
        })),
    }))
    .sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || b.count - a.count)
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

function isRelationshipGraphRole(role: WikiDocRole): boolean {
  return role !== 'tooling'
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
    if (!isRelationshipGraphRole(classifyWikiDocRole(sourceDoc))) continue
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
      if (targetDoc && isRelationshipGraphRole(classifyWikiDocRole(targetDoc))) {
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
      const role = classifyWikiDocRole(doc)
      const policy = ROLE_POLICY[role]
      const report = driftReports[doc.path]
      const missing = report?.counts.missing ?? 0
      const stale = report?.counts.stale ?? 0
      const ageDays = Math.max(0, Math.floor((now - doc.mtime) / DAY_MS))
      const reasons: WikiDocDebtReason[] = []
      let score = 0

      if (ageDays >= policy.staleAfterDays && policy.staleDocImpact > 0) {
        reasons.push('stale')
        score += Math.min(40, Math.floor(ageDays / 7) * policy.maintenanceSensitivity * 4)
      }
      if (missing > 0 || stale > 0) {
        reasons.push('risk')
        score += missing * policy.missingRefImpact + stale * policy.staleRefImpact
      }
      if (!doc.frontmatter?.source || !doc.frontmatter?.status) {
        reasons.push('missingMeta')
        score += policy.missingMetaImpact
      }
      if (!readDocs[doc.path]) {
        reasons.push('unread')
        score += policy.unreadImpact
      }

      return {
        path: doc.path,
        name: displayNameFor(displayNames, doc),
        role,
        action: riskActionFor(role, missing, stale),
        score: Math.round(score),
        ageDays,
        missing,
        stale,
        reasons,
      }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.ageDays - a.ageDays || a.name.localeCompare(b.name))
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
  staleRefs: number,
  docsWithRisk: WikiRiskDoc[]
): WikiTrustScore {
  const riskRefs = missingRefs
  const staleDocs = docDebt.filter((item) => item.reasons.includes('stale')).length
  const missingMetaDocs = docs.filter((doc) => !doc.frontmatter?.source || !doc.frontmatter?.status).length
  const riskImpact = Math.min(
    45,
    Math.round(
      docsWithRisk.reduce((total, doc) => {
        const role = doc.role ?? 'reference'
        return total + doc.missing * ROLE_POLICY[role].missingRefImpact
      }, 0)
    )
  )
  const staleRefImpact = Math.min(
    15,
    Math.round(
      docsWithRisk.reduce((total, doc) => {
        const role = doc.role ?? 'reference'
        return total + doc.stale * ROLE_POLICY[role].staleRefImpact
      }, 0)
    )
  )
  const staleImpact = Math.min(
    25,
    Math.round(
      docDebt
        .filter((item) => item.reasons.includes('stale'))
        .reduce((total, item) => total + ROLE_POLICY[item.role].staleDocImpact, 0)
    )
  )
  const missingMetaImpact = Math.min(
    20,
    Math.round(
      docs.reduce((total, doc) => {
        if (doc.frontmatter?.source && doc.frontmatter?.status) return total
        return total + ROLE_POLICY[classifyWikiDocRole(doc)].missingMetaImpact
      }, 0)
    )
  )
  const unreadImpact = Math.min(
    10,
    Math.round(
      docs.reduce((total, doc) => {
        if (!docDebt.some((item) => item.path === doc.path && item.reasons.includes('unread'))) return total
        return total + ROLE_POLICY[classifyWikiDocRole(doc)].unreadImpact
      }, 0)
    )
  )
  const recentBoost = Math.min(10, recentDocs * 2)
  const score = clampScore(
    100 - riskImpact - staleRefImpact - staleImpact - missingMetaImpact - unreadImpact + recentBoost
  )
  const level: WikiTrustLevel = score >= 80 ? 'strong' : score >= 55 ? 'watch' : 'weak'
  const allSignals: WikiTrustSignal[] = [
    { key: 'riskRefs', count: riskRefs, impact: -riskImpact, tone: 'danger' },
    { key: 'staleRefs', count: staleRefs, impact: -staleRefImpact, tone: 'warning' },
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
      staleRefs,
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

  const docsWithMissingRefs = docsWithRisk.filter((doc) => doc.missing > 0)
  const actionableMissingRefs = docsWithMissingRefs.filter((doc) => doc.action === 'fix' && (doc.score ?? 0) >= 8)
  if (actionableMissingRefs.length > 0) {
    addTask({
      id: 'repair-references',
      intent: 'repairReferences',
      priority: 'high',
      docs: actionableMissingRefs.slice(0, 3).map((doc) => ({
        path: doc.path,
        name: doc.name,
        reason: 'risk',
        score: doc.score ?? doc.missing * 10 + doc.stale * 3,
      })),
    })
  }

  const staleRefDocs = docsWithRisk
    .filter((doc) => doc.action === 'confirm' && doc.stale > 0 && doc.missing === 0 && (doc.score ?? 0) >= 5)
    .map((doc) => ({
      path: doc.path,
      name: doc.name,
      reason: 'risk' as const,
      score: doc.score ?? doc.stale * 3,
    }))
  const staleDocs = docDebt
    .filter((item) => item.reasons.includes('stale'))
    .map(docDebtToLink)
  const refreshDocs = [...staleRefDocs, ...staleDocs]
    .filter((doc, index, docs) => docs.findIndex((item) => item.path === doc.path) === index)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  if (refreshDocs.length > 0) {
    addTask({
      id: 'refresh-stale-docs',
      intent: 'refreshStaleDocs',
      priority: trust.level === 'weak' ? 'high' : 'medium',
      docs: refreshDocs.slice(0, 3),
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

function buildDecisionTimeline(
  decisionDocs: Doc[],
  displayNames: Map<string, string>,
  now: number
): WikiDecisionEvent[] {
  return decisionDocs
    .map((doc) => {
      const status = typeof doc.frontmatter?.status === 'string' && doc.frontmatter.status.trim()
        ? doc.frontmatter.status.trim()
        : null
      const source = typeof doc.frontmatter?.source === 'string' && doc.frontmatter.source.trim()
        ? doc.frontmatter.source.trim()
        : null
      const ageDays = Math.max(0, Math.floor((now - doc.mtime) / DAY_MS))
      const kind = classifyDecisionKind(doc)
      const recencyScore = Math.max(0, 120 - ageDays)
      const kindWeight: Record<WikiDecisionKind, number> = {
        release: 50,
        review: 45,
        design: 40,
        plan: 35,
        decision: 30,
      }

      return {
        path: doc.path,
        name: displayNameFor(displayNames, doc),
        kind,
        status,
        source,
        ageDays,
        score: recencyScore + kindWeight[kind],
      }
    })
    .sort((a, b) => b.score - a.score || a.ageDays - b.ageDays || a.name.localeCompare(b.name))
    .slice(0, 7)
}

function buildProjectPulse(
  trust: WikiTrustScore,
  suggestedTasks: WikiSuggestedTask[],
  onboardingPath: WikiDocLink[],
  recentDocs: number
): WikiProjectPulse {
  const topTask = suggestedTasks[0]
  const riskRefs = trust.penalties.riskRefs
  const staleRefs = trust.penalties.staleRefs
  const staleDocs = trust.penalties.staleDocs
  const missingMetaDocs = trust.penalties.missingMetaDocs
  const unreadDocs = trust.penalties.unreadDocs
  const reasons: WikiPulseReason[] = []

  if (riskRefs > 0) reasons.push('riskRefs')
  if (staleRefs > 0) reasons.push('staleRefs')
  if (staleDocs > 0) reasons.push('staleDocs')
  if (missingMetaDocs > 0) reasons.push('missingMetaDocs')
  if (unreadDocs > 0) reasons.push('unreadDocs')
  if (recentDocs > 0) reasons.push('recentDocs')
  if (reasons.length === 0) reasons.push('healthy')

  if (riskRefs === 0 && staleRefs === 0 && staleDocs === 0 && missingMetaDocs === 0 && unreadDocs === 0 && trust.level === 'strong') {
    return {
      tone: 'healthy',
      focus: 'readFirst',
      reasons: ['healthy'],
      primaryDoc: onboardingPath[0] ?? null,
      actionTaskId: null,
    }
  }

  if (topTask) {
    return {
      tone: topTask.priority === 'high' || trust.level === 'weak' ? 'attention' : 'active',
      focus: topTask.intent,
      reasons: reasons.slice(0, 3),
      primaryDoc: topTask.docs[0] ?? null,
      actionTaskId: topTask.id,
    }
  }

  return {
    tone: trust.level === 'strong' ? 'healthy' : 'active',
    focus: 'readFirst',
    reasons: reasons.slice(0, 3),
    primaryDoc: onboardingPath[0] ?? null,
    actionTaskId: null,
  }
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
  const onboardingFallbackDocs = recentSorted.filter((doc) => {
    const role = classifyWikiDocRole(doc)
    return role !== 'archive' && role !== 'ideaDraft' && role !== 'workLog' && role !== 'tooling'
  })
  for (const doc of onboardingFallbackDocs) {
    addUniqueDoc(onboardingPath, onboardingSeen, doc, 'recent', Math.max(1, Math.round(doc.mtime / 1_000_000)), displayNameFor(displayNames, doc))
    if (onboardingPath.length >= 5) break
  }

  const decisionDocs = markdownDocs
    .filter(isDecisionDoc)
    .sort((a, b) => b.mtime - a.mtime)
  const decisionLog = decisionDocs
    .slice(0, 6)
    .map((doc) => ({ path: doc.path, name: displayNameFor(displayNames, doc), reason: 'decision' as const, score: doc.mtime }))
  const decisionTimeline = buildDecisionTimeline(decisionDocs, displayNames, now)

  const docsWithRisk: WikiRiskDoc[] = []
  let missingRefs = 0
  let staleRefs = 0
  for (const doc of markdownDocs) {
    const report = driftReports[doc.path]
    if (!report) continue
    const role = classifyWikiDocRole(doc)
    if (role === 'tooling') continue
    missingRefs += report.counts.missing
    staleRefs += report.counts.stale
    if (report.counts.missing > 0 || report.counts.stale > 0) {
      const policy = ROLE_POLICY[role]
      docsWithRisk.push({
        path: doc.path,
        name: displayNameFor(displayNames, doc),
        missing: report.counts.missing,
        stale: report.counts.stale,
        role,
        score: Math.round(report.counts.missing * policy.missingRefImpact + report.counts.stale * policy.staleRefImpact),
        action: riskActionFor(role, report.counts.missing, report.counts.stale),
      })
    }
  }
  docsWithRisk.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.missing * 5 + b.stale) - (a.missing * 5 + a.stale) || a.name.localeCompare(b.name))
  const unreadDocs = markdownDocs.filter((doc) => !readDocs[doc.path]).length
  const recentDocs = markdownDocs.filter((doc) => doc.mtime >= recentCutoff).length
  const allDocDebt = buildDocDebt(markdownDocs, driftReports, readDocs, displayNames, now)
  const trust = buildTrustScore(markdownDocs, allDocDebt, unreadDocs, recentDocs, missingRefs, staleRefs, docsWithRisk)
  const relationships = buildRelationshipMap(markdownDocs, driftReports, displayNames)
  const suggestedTasks = buildSuggestedTasks(onboardingPath, decisionLog, docsWithRisk, allDocDebt, trust)

  return {
    totalDocs: docs.length,
    markdownDocs: markdownDocs.length,
    imageDocs: imageDocs.length,
    recentDocs,
    unreadDocs,
    sourceCounts: sortSourceCounts(sourceCounts).slice(0, 5),
    statusCounts: sortStatusCounts(statusCounts).slice(0, 5),
    roleGroups: buildRoleGroups(markdownDocs, displayNames),
    clusters: buildClusters([...markdownDocs, ...imageDocs], displayNames).slice(0, 6),
    docDebt: allDocDebt.slice(0, 5),
    trust,
    pulse: buildProjectPulse(trust, suggestedTasks, onboardingPath, recentDocs),
    relationships,
    suggestedTasks,
    onboardingPath,
    decisionLog,
    decisionTimeline,
    risks: {
      missingRefs,
      staleRefs,
      docsWithRisk: docsWithRisk.slice(0, 5),
    },
  }
}
