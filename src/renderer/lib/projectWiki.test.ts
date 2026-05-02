import { describe, expect, it } from 'vitest'
import { buildProjectWikiSummary, classifyWikiDocRole } from './projectWiki'
import type { Doc, DriftReport, VerifiedReference } from '../../preload/types'

const NOW = Date.parse('2026-05-01T00:00:00Z')

function doc(name: string, overrides: Partial<Doc> = {}): Doc {
  return {
    path: `/project/${name}`,
    projectId: 'p1',
    name,
    mtime: NOW - 60_000,
    ...overrides,
  }
}

function drift(docPath: string, missing: number, stale: number, references: VerifiedReference[] = []): DriftReport {
  return {
    docPath,
    docMtime: NOW,
    projectRoot: '/project',
    references,
    counts: {
      ok: references.length > 0 ? references.filter((ref) => ref.status === 'ok').length : 1,
      missing,
      stale,
    },
    verifiedAt: NOW,
  }
}

function ref(target: string, status: VerifiedReference['status'], overrides: Partial<VerifiedReference> = {}): VerifiedReference {
  return {
    raw: `@${target}`,
    resolvedPath: target,
    kind: 'at',
    line: 3,
    col: 1,
    status,
    ...overrides,
  }
}

describe('buildProjectWikiSummary', () => {
  it('builds overview counts, source/status facets, and onboarding path', () => {
    const docs: Doc[] = [
      doc('README.md', { frontmatter: { source: 'claude', status: 'draft' } }),
      doc('CLAUDE.md', { frontmatter: { source: 'claude', status: 'published' } }),
      doc('docs/plans/v1-plan.md', { frontmatter: { source: 'design', status: 'draft' } }),
      doc('docs/release-notes/v1.md', { frontmatter: { source: 'review' } }),
      doc('screenshot.png'),
    ]

    const summary = buildProjectWikiSummary(docs, {}, { '/project/README.md': NOW }, NOW)

    expect(summary.totalDocs).toBe(5)
    expect(summary.markdownDocs).toBe(4)
    expect(summary.imageDocs).toBe(1)
    expect(summary.recentDocs).toBe(4)
    expect(summary.unreadDocs).toBe(3)
    expect(summary.sourceCounts).toEqual([
      { source: 'claude', count: 2 },
      { source: 'design', count: 1 },
      { source: 'review', count: 1 },
    ])
    expect(summary.statusCounts).toEqual([
      { status: 'draft', count: 2 },
      { status: 'published', count: 1 },
    ])
    expect(summary.onboardingPath.map((item) => item.name)).toEqual([
      'README.md',
      'CLAUDE.md',
      'docs/release-notes/v1.md',
    ])
    expect(summary.decisionLog.map((item) => item.name)).toEqual([
      'docs/plans/v1-plan.md',
      'docs/release-notes/v1.md',
    ])
    expect(summary.decisionTimeline.map((item) => ({ name: item.name, kind: item.kind, status: item.status, source: item.source }))).toEqual([
      { name: 'docs/release-notes/v1.md', kind: 'release', status: null, source: 'review' },
      { name: 'docs/plans/v1-plan.md', kind: 'plan', status: 'draft', source: 'design' },
    ])
    expect(summary.clusters.map((item) => ({ key: item.key, count: item.count }))).toEqual([
      { key: 'decision', count: 2 },
      { key: 'overview', count: 2 },
      { key: 'media', count: 1 },
    ])
    expect(summary.docDebt[0]).toMatchObject({
      name: 'docs/release-notes/v1.md',
      reasons: ['missingMeta', 'unread'],
    })
    expect(summary.trust).toMatchObject({
      score: 100,
      level: 'strong',
      penalties: {
        riskRefs: 0,
        staleRefs: 0,
        staleDocs: 0,
        missingMetaDocs: 1,
        unreadDocs: 3,
      },
    })
    expect(summary.trust.signals).toEqual([
      { key: 'missingMetaDocs', count: 1, impact: -2, tone: 'neutral' },
      { key: 'unreadDocs', count: 3, impact: -3, tone: 'neutral' },
      { key: 'recentDocs', count: 4, impact: 8, tone: 'positive' },
    ])
    expect(summary.roleGroups?.map((item) => ({ role: item.role, count: item.count }))).toEqual([
      { role: 'currentGuide', count: 2 },
      { role: 'decisionRecord', count: 1 },
      { role: 'workLog', count: 1 },
    ])
    expect(summary.suggestedTasks.map((item) => item.intent)).toEqual([
      'completeMetadata',
      'buildOnboardingBrief',
      'extractDecisionTimeline',
    ])
    expect(summary.pulse).toMatchObject({
      tone: 'active',
      focus: 'completeMetadata',
      primaryDoc: { name: 'docs/release-notes/v1.md' },
      actionTaskId: 'complete-metadata',
    })
    expect(summary.relationships).toMatchObject({
      checkedDocs: 0,
      totalRefs: 0,
      hubs: [],
      riskyLinks: [],
    })
  })

  it('keeps agent tooling and session logs out of first-read and cleanup pressure', () => {
    const old = NOW - 100 * 24 * 60 * 60 * 1000
    const docs: Doc[] = [
      doc('README.md'),
      doc('docs/ROADMAP.md'),
      doc('.agents/skills/vercel-react-best-practices/README.md', { mtime: old }),
      doc('.agents/skills/vercel-react-best-practices/AGENTS.md', { mtime: old }),
      doc('.claude/agents/reviewer.md', { mtime: old }),
      doc('apps/landinsight/.claude/design/api-contracts.md', { mtime: old }),
      doc('.claude/sessions/2026-02-26-harness-setup.md', { mtime: old }),
    ]

    const summary = buildProjectWikiSummary(docs, {}, {}, NOW)

    expect(classifyWikiDocRole(docs[2])).toBe('tooling')
    expect(classifyWikiDocRole(docs[5])).toBe('tooling')
    expect(classifyWikiDocRole(docs[6])).toBe('workLog')
    expect(summary.onboardingPath.map((item) => item.name)).toEqual([
      'README.md',
      'docs/ROADMAP.md',
    ])
    expect(summary.decisionLog.map((item) => item.name)).not.toContain('.claude/sessions/2026-02-26-harness-setup.md')
    expect(summary.decisionLog.map((item) => item.name)).not.toContain('apps/landinsight/.claude/design/api-contracts.md')
    expect(summary.docDebt.map((item) => item.name)).not.toContain('.agents/skills/vercel-react-best-practices/README.md')
    expect(summary.docDebt.map((item) => item.name)).not.toContain('.agents/skills/vercel-react-best-practices/AGENTS.md')
    expect(summary.docDebt.map((item) => item.name)).not.toContain('.claude/agents/reviewer.md')
    expect(summary.docDebt.map((item) => item.name)).not.toContain('apps/landinsight/.claude/design/api-contracts.md')
    expect(summary.docDebt.find((item) => item.name === '.claude/sessions/2026-02-26-harness-setup.md')?.reasons).not.toContain('stale')
    expect(summary.roleGroups?.map((item) => ({ role: item.role, count: item.count }))).toEqual([
      { role: 'currentGuide', count: 1 },
      { role: 'reference', count: 1 },
      { role: 'workLog', count: 1 },
      { role: 'tooling', count: 4 },
    ])
  })

  it('summarizes drift risks by document and total counts', () => {
    const risky = doc('docs/api.md')
    const ok = doc('README.md')

    const summary = buildProjectWikiSummary(
      [risky, ok],
      {
        [risky.path]: drift(risky.path, 2, 1),
        [ok.path]: drift(ok.path, 0, 0),
      },
      {},
      NOW
    )

    expect(summary.risks.missingRefs).toBe(2)
    expect(summary.risks.staleRefs).toBe(1)
    expect(summary.risks.docsWithRisk).toEqual([
      { path: risky.path, name: risky.name, missing: 2, stale: 1, role: 'reference', score: 23 },
    ])
    expect(summary.docDebt[0]).toMatchObject({
      path: risky.path,
      missing: 2,
      stale: 1,
      reasons: ['risk', 'missingMeta', 'unread'],
    })
    expect(summary.trust.level).toBe('watch')
    expect(summary.trust.penalties).toMatchObject({ riskRefs: 2, staleRefs: 1 })
    expect(summary.trust.signals[0]).toEqual({ key: 'riskRefs', count: 2, impact: -20, tone: 'danger' })
    expect(summary.trust.signals[1]).toEqual({ key: 'staleRefs', count: 1, impact: -3, tone: 'warning' })
    expect(summary.suggestedTasks[0]).toMatchObject({
      id: 'repair-references',
      intent: 'repairReferences',
      priority: 'high',
      docs: [{ path: risky.path, name: risky.name, reason: 'risk' }],
    })
    expect(summary.pulse).toMatchObject({
      tone: 'attention',
      focus: 'repairReferences',
      reasons: ['riskRefs', 'staleRefs', 'missingMetaDocs'],
      primaryDoc: { path: risky.path, name: risky.name },
      actionTaskId: 'repair-references',
    })
  })

  it('treats stale-only references as review work instead of broken-link repair', () => {
    const staleOnly = doc('docs/implementation.md', {
      frontmatter: { source: 'design', status: 'published' },
    })

    const summary = buildProjectWikiSummary(
      [staleOnly],
      { [staleOnly.path]: drift(staleOnly.path, 0, 3) },
      { [staleOnly.path]: NOW },
      NOW
    )

    expect(summary.risks).toMatchObject({
      missingRefs: 0,
      staleRefs: 3,
    })
    expect(summary.trust).toMatchObject({
      level: 'strong',
      penalties: {
        riskRefs: 0,
        staleRefs: 3,
        staleDocs: 0,
        missingMetaDocs: 0,
        unreadDocs: 0,
      },
    })
    expect(summary.trust.signals).toEqual([
      { key: 'staleRefs', count: 3, impact: -5, tone: 'warning' },
      { key: 'recentDocs', count: 1, impact: 2, tone: 'positive' },
    ])
    expect(summary.suggestedTasks.map((item) => ({ intent: item.intent, priority: item.priority }))).toEqual([
      { intent: 'refreshStaleDocs', priority: 'medium' },
      { intent: 'buildOnboardingBrief', priority: 'low' },
    ])
    expect(summary.suggestedTasks.some((item) => item.intent === 'repairReferences')).toBe(false)
    expect(summary.pulse).toMatchObject({
      tone: 'active',
      focus: 'refreshStaleDocs',
      reasons: ['staleRefs', 'recentDocs'],
      actionTaskId: 'refresh-stale-docs',
    })
  })

  it('builds a relationship map from verified document references', () => {
    const overview = doc('README.md')
    const plan = doc('docs/plan.md')
    const archive = doc('docs/archive.md')
    const missingTarget = '/project/docs/missing.md'

    const summary = buildProjectWikiSummary(
      [overview, plan, archive],
      {
        [overview.path]: drift(overview.path, 1, 1, [
          ref(plan.path, 'ok'),
          ref(archive.path, 'stale', { raw: './docs/archive.md', kind: 'inline', line: 12 }),
          ref(missingTarget, 'missing', { raw: '@docs/missing.md', line: 14 }),
        ]),
        [plan.path]: drift(plan.path, 0, 0, [
          ref(overview.path, 'ok', { raw: '@README.md', line: 2 }),
        ]),
      },
      {},
      NOW
    )

    expect(summary.relationships).toMatchObject({
      checkedDocs: 2,
      totalRefs: 4,
      okRefs: 2,
      missingRefs: 1,
      staleRefs: 1,
    })
    expect(summary.relationships.hubs[0]).toMatchObject({
      path: overview.path,
      inbound: 1,
      outbound: 3,
      riskRefs: 2,
    })
    expect(summary.relationships.riskyLinks).toEqual([
      expect.objectContaining({
        sourcePath: overview.path,
        targetPath: missingTarget,
        targetName: 'missing.md',
        status: 'missing',
        raw: '@docs/missing.md',
      }),
      expect.objectContaining({
        sourcePath: overview.path,
        targetPath: archive.path,
        targetName: archive.name,
        status: 'stale',
        kind: 'inline',
      }),
    ])
  })

  it('excludes internal tooling docs from relationship risk totals and hubs', () => {
    const readme = doc('README.md')
    const tooling = doc('.agents/skills/vercel-react-best-practices/README.md')
    const missingTarget = '/project/.agents/skills/vercel-react-best-practices/rules/_template.md'

    const summary = buildProjectWikiSummary(
      [readme, tooling],
      {
        [readme.path]: drift(readme.path, 0, 0, [
          ref(readme.path, 'ok', { raw: '@README.md', line: 1 }),
        ]),
        [tooling.path]: drift(tooling.path, 3, 0, [
          ref(missingTarget, 'missing', { raw: '`rules/_template.md`', kind: 'inline', line: 48 }),
        ]),
      },
      {},
      NOW
    )

    expect(summary.risks.missingRefs).toBe(0)
    expect(summary.relationships).toMatchObject({
      checkedDocs: 1,
      totalRefs: 1,
      okRefs: 1,
      missingRefs: 0,
      staleRefs: 0,
    })
    expect(summary.relationships.hubs.map((hub) => hub.name)).toEqual(['README.md'])
    expect(summary.relationships.riskyLinks).toEqual([])
    expect(summary.suggestedTasks.some((task) => task.intent === 'repairReferences')).toBe(false)
  })

  it('clusters docs into a knowledge map by document role', () => {
    const docs: Doc[] = [
      doc('README.md'),
      doc('src/hooks/useDocs.md'),
      doc('ops/deploy-runbook.md'),
      doc('architecture/adr-auth.md'),
      doc('notes/random.md'),
      doc('diagram.png'),
    ]

    const summary = buildProjectWikiSummary(docs, {}, {}, NOW)

    expect(summary.clusters.map((item) => item.key)).toEqual([
      'decision',
      'implementation',
      'media',
      'operations',
      'overview',
      'reference',
    ])
    expect(summary.clusters.find((item) => item.key === 'implementation')?.docs[0].name).toBe('src/hooks/useDocs.md')
  })

  it('disambiguates duplicate basenames with relative paths across wiki sections', () => {
    const rootClaude = doc('CLAUDE.md')
    const nestedClaude = doc('CLAUDE.md', {
      path: '/project/.claude/CLAUDE.md',
    })
    const designInputA = doc('claude-design-input.md', {
      path: '/project/docs/design/claude-design-input.md',
      frontmatter: { source: 'design', status: 'draft' },
    })
    const designInputB = doc('claude-design-input.md', {
      path: '/project/archive/claude-design-input.md',
      frontmatter: { source: 'review', status: 'draft' },
    })

    const summary = buildProjectWikiSummary(
      [rootClaude, nestedClaude, designInputA, designInputB],
      { [designInputA.path]: drift(designInputA.path, 2, 0) },
      {},
      NOW
    )

    expect(summary.onboardingPath.map((item) => item.name)).toContain('CLAUDE.md')
    expect(summary.onboardingPath.map((item) => item.name)).not.toContain('.claude/CLAUDE.md')
    expect(summary.decisionLog.map((item) => item.name)).toContain('docs/design/claude-design-input.md')
    expect(summary.decisionLog.map((item) => item.name)).toContain('archive/claude-design-input.md')
    expect(summary.decisionTimeline.map((item) => item.name)).toContain('docs/design/claude-design-input.md')
    expect(summary.risks.docsWithRisk[0].name).toBe('docs/design/claude-design-input.md')
    expect(summary.suggestedTasks[0].docs[0].name).toBe('docs/design/claude-design-input.md')
  })

  it('prioritizes stale and under-specified docs in the doc debt radar', () => {
    const old = doc('docs/reference/overview.md', {
      mtime: NOW - 90 * 24 * 60 * 60 * 1000,
      frontmatter: { source: 'claude', status: 'draft' },
    })
    const risky = doc('docs/risky.md', {
      frontmatter: { source: 'design', status: 'draft' },
    })
    const fresh = doc('docs/fresh.md', {
      frontmatter: { source: 'review', status: 'published' },
    })

    const summary = buildProjectWikiSummary(
      [old, risky, fresh],
      { [risky.path]: drift(risky.path, 2, 0) },
      { [old.path]: NOW, [risky.path]: NOW, [fresh.path]: NOW },
      NOW
    )

    expect(summary.docDebt.map((item) => item.name)).toEqual(['docs/reference/overview.md', 'docs/risky.md'])
    expect(summary.docDebt[0]).toMatchObject({ reasons: ['stale'], role: 'reference' })
    expect(summary.docDebt[1]).toMatchObject({ reasons: ['risk'], role: 'decisionRecord' })
    expect(summary.trust).toMatchObject({
      level: 'strong',
      penalties: {
        riskRefs: 2,
        staleRefs: 0,
        staleDocs: 1,
        missingMetaDocs: 0,
        unreadDocs: 0,
      },
    })
    expect(summary.trust.signals).toEqual([
      { key: 'riskRefs', count: 2, impact: -14, tone: 'danger' },
      { key: 'staleDocs', count: 1, impact: -6, tone: 'warning' },
      { key: 'recentDocs', count: 2, impact: 4, tone: 'positive' },
    ])
    expect(summary.suggestedTasks.map((item) => item.intent)).toEqual([
      'repairReferences',
      'refreshStaleDocs',
      'buildOnboardingBrief',
    ])
    expect(summary.suggestedTasks[1]).toMatchObject({
      id: 'refresh-stale-docs',
      priority: 'medium',
      docs: [{ path: old.path, name: old.name }],
    })
  })

  it('does not force old work logs to be refreshed while operational docs stay sensitive', () => {
    const oldPlan = doc('docs/plans/2026-04-architecture-plan.md', {
      mtime: NOW - 120 * 24 * 60 * 60 * 1000,
      frontmatter: { source: 'design', status: 'done' },
    })
    const deploy = doc('docs/ops/deploy.md', {
      mtime: NOW - 20 * 24 * 60 * 60 * 1000,
      frontmatter: { source: 'ops', status: 'runbook' },
    })

    const summary = buildProjectWikiSummary(
      [oldPlan, deploy],
      {},
      { [oldPlan.path]: NOW, [deploy.path]: NOW },
      NOW
    )

    expect(summary.roleGroups?.map((item) => item.role)).toEqual(['operational', 'workLog'])
    expect(summary.docDebt.map((item) => item.path)).toEqual([deploy.path])
    expect(summary.docDebt[0]).toMatchObject({ role: 'operational', reasons: ['stale'] })
    expect(summary.suggestedTasks.find((item) => item.intent === 'refreshStaleDocs')).toMatchObject({
      docs: [{ path: deploy.path, name: deploy.name }],
    })
    expect(summary.suggestedTasks.find((item) => item.intent === 'refreshStaleDocs')?.docs.map((doc) => doc.path)).not.toContain(oldPlan.path)
  })

  it('keeps archived broken references low priority instead of creating a repair task', () => {
    const archive = doc('docs/archived/old-sprint-plan.md', {
      frontmatter: { source: 'design', status: 'done' },
    })

    const summary = buildProjectWikiSummary(
      [archive],
      { [archive.path]: drift(archive.path, 4, 2) },
      { [archive.path]: NOW },
      NOW
    )

    expect(summary.risks.docsWithRisk[0]).toMatchObject({
      path: archive.path,
      role: 'archive',
      score: 4,
    })
    expect(summary.suggestedTasks.some((item) => item.intent === 'repairReferences')).toBe(false)
    expect(summary.suggestedTasks).toEqual([])
    expect(summary.pulse.tone).not.toBe('attention')
    expect(summary.docDebt[0]).toMatchObject({ role: 'archive', reasons: ['risk'] })
  })

  it('calculates trust from all risky docs even when the radar only displays the top five', () => {
    const docs = Array.from({ length: 6 }, (_, index) => doc(`docs/designs/d${index + 1}.md`, {
      frontmatter: { source: 'design', status: 'published' },
    }))

    const summary = buildProjectWikiSummary(
      docs,
      Object.fromEntries(docs.map((item) => [item.path, drift(item.path, 1, 0)])),
      Object.fromEntries(docs.map((item) => [item.path, NOW])),
      NOW
    )

    expect(summary.docDebt).toHaveLength(5)
    expect(summary.trust.signals[0]).toEqual({ key: 'riskRefs', count: 6, impact: -42, tone: 'danger' })
  })

  it('marks low-trust projects as weak when docs are risky and under-specified', () => {
    const docs: Doc[] = [
      doc('docs/a.md', { mtime: NOW - 120 * 24 * 60 * 60 * 1000 }),
      doc('docs/b.md', { mtime: NOW - 100 * 24 * 60 * 60 * 1000 }),
      doc('docs/c.md', { mtime: NOW - 80 * 24 * 60 * 60 * 1000 }),
    ]

    const summary = buildProjectWikiSummary(
      docs,
      {
        [docs[0].path]: drift(docs[0].path, 3, 2),
        [docs[1].path]: drift(docs[1].path, 2, 1),
      },
      {},
      NOW
    )

    expect(summary.trust.score).toBeLessThan(55)
    expect(summary.trust.level).toBe('weak')
    expect(summary.suggestedTasks.map((item) => ({ intent: item.intent, priority: item.priority }))).toEqual([
      { intent: 'repairReferences', priority: 'high' },
      { intent: 'refreshStaleDocs', priority: 'high' },
      { intent: 'completeMetadata', priority: 'medium' },
    ])
    expect(summary.pulse.tone).toBe('attention')
    expect(summary.pulse.focus).toBe('repairReferences')
  })

  it('falls back to a calm reading pulse when docs have no generated maintenance tasks', () => {
    const readme = doc('README.md', {
      frontmatter: { source: 'human', status: 'published' },
    })

    const summary = buildProjectWikiSummary([readme], {}, { [readme.path]: NOW }, NOW + 14 * 24 * 60 * 60 * 1000)

    expect(summary.suggestedTasks.map((item) => item.intent)).toEqual(['buildOnboardingBrief'])
    expect(summary.pulse).toMatchObject({
      tone: 'healthy',
      focus: 'readFirst',
      reasons: ['healthy'],
      primaryDoc: { path: readme.path, name: readme.name },
      actionTaskId: null,
    })
  })
})
