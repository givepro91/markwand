import { describe, expect, it } from 'vitest'
import type { Doc } from '../../preload/types'
import {
  buildProjectWikiBrief,
  extractProjectWikiEvidence,
  formatProjectWikiHandoffBrief,
  formatProjectWikiOnboardingBrief,
  formatProjectWikiTaskPrompt,
} from './projectWikiBrief'
import type { ProjectWikiSummary } from './projectWiki'

const doc: Doc = {
  path: '/project/README.md',
  projectId: 'p1',
  name: 'README.md',
  mtime: 1,
}

function summary(overrides: Partial<ProjectWikiSummary> = {}): ProjectWikiSummary {
  return {
    totalDocs: 2,
    markdownDocs: 2,
    imageDocs: 0,
    recentDocs: 1,
    unreadDocs: 2,
    sourceCounts: [],
    statusCounts: [],
    onboardingPath: [],
    decisionLog: [],
    decisionTimeline: [],
    risks: { missingRefs: 0, staleRefs: 0, docsWithRisk: [] },
    clusters: [],
    docDebt: [],
    relationships: {
      checkedDocs: 0,
      totalRefs: 0,
      okRefs: 0,
      missingRefs: 0,
      staleRefs: 0,
      hubs: [],
      riskyLinks: [],
    },
    suggestedTasks: [],
    trust: {
      score: 90,
      level: 'strong',
      penalties: { riskRefs: 0, staleRefs: 0, staleDocs: 0, missingMetaDocs: 0, unreadDocs: 0 },
      signals: [],
    },
    pulse: {
      tone: 'healthy',
      focus: 'readFirst',
      reasons: ['healthy'],
      primaryDoc: null,
      actionTaskId: null,
    },
    ...overrides,
  }
}

describe('extractProjectWikiEvidence', () => {
  it('extracts H1 and first useful paragraph while ignoring frontmatter', () => {
    const evidence = extractProjectWikiEvidence(
      doc,
      [
        '---',
        'status: draft',
        '---',
        '# Markwand',
        '',
        '![demo](demo.png)',
        '',
        'An AI-output curator for your desktop that finds scattered markdown docs.',
      ].join('\n')
    )

    expect(evidence.title).toBe('Markwand')
    expect(evidence.excerpt).toBe('An AI-output curator for your desktop that finds scattered markdown docs.')
  })
})

describe('buildProjectWikiBrief', () => {
  it('builds a citation-ready brief from evidence and project signals', () => {
    const brief = buildProjectWikiBrief(
      'markwand',
      summary({ risks: { missingRefs: 2, staleRefs: 1, docsWithRisk: [] } }),
      [
        {
          path: doc.path,
          name: doc.name,
          title: 'Markwand',
          excerpt: 'Markwand turns scattered AI-generated project notes into a living project map.',
        },
      ]
    )

    expect(brief.headline).toBe('Markwand')
    expect(brief.overview).toContain('Markwand turns scattered AI-generated project notes into a living project map.')
    expect(brief.overview).toContain('1 documents changed in the last 7 days, so this project is currently active.')
    expect(brief.overview).toContain('3 reference issues need review before treating the docs as fully trustworthy.')
    expect(brief.evidence).toHaveLength(1)
  })
})

describe('formatProjectWikiHandoffBrief', () => {
  it('formats an AI-ready markdown handoff with evidence and risk context', () => {
    const handoffSummary = summary({
      clusters: [{ key: 'overview', count: 1, docs: [{ path: doc.path, name: doc.name, reason: 'recent', score: 1 }] }],
      docDebt: [{
        path: '/project/risky.md',
        name: 'risky.md',
        score: 52,
        ageDays: 45,
        missing: 1,
        stale: 1,
        reasons: ['stale', 'risk'],
      }],
      onboardingPath: [{ path: doc.path, name: doc.name, reason: 'entrypoint', score: 100 }],
      risks: {
        missingRefs: 1,
        staleRefs: 1,
        docsWithRisk: [{ path: '/project/risky.md', name: 'risky.md', missing: 1, stale: 1 }],
      },
      relationships: {
        checkedDocs: 2,
        totalRefs: 4,
        okRefs: 2,
        missingRefs: 1,
        staleRefs: 1,
        hubs: [{
          path: doc.path,
          name: doc.name,
          inbound: 2,
          outbound: 1,
          riskRefs: 0,
        }],
        riskyLinks: [{
          sourcePath: '/project/risky.md',
          sourceName: 'risky.md',
          targetPath: '/project/missing.md',
          targetName: 'missing.md',
          raw: '@missing.md',
          status: 'missing',
          kind: 'at',
          line: 9,
        }],
      },
      trust: {
        score: 74,
        level: 'watch',
        penalties: { riskRefs: 2, staleRefs: 0, staleDocs: 1, missingMetaDocs: 0, unreadDocs: 0 },
        signals: [
          { key: 'riskRefs', count: 2, impact: -20, tone: 'danger' },
          { key: 'staleDocs', count: 1, impact: -8, tone: 'warning' },
          { key: 'recentDocs', count: 1, impact: 2, tone: 'positive' },
        ],
      },
      suggestedTasks: [{
        id: 'repair-references',
        intent: 'repairReferences',
        priority: 'high',
        docs: [{ path: '/project/risky.md', name: 'risky.md', reason: 'risk', score: 40 }],
      }],
    })
    const brief = buildProjectWikiBrief(
      'markwand',
      handoffSummary,
      [
        {
          path: doc.path,
          name: doc.name,
          title: 'Markwand',
          excerpt: 'Markwand turns scattered markdown into a project map.',
        },
      ]
    )

    const text = formatProjectWikiHandoffBrief('markwand', handoffSummary, brief)

    expect(text).toContain('# Handoff Brief: markwand')
    expect(text).toContain('- Trust score: 74/100 (watch)')
    expect(text).toContain('## Trust Signals')
    expect(text).toContain('- riskRefs: 2 (-20 pts)')
    expect(text).toContain('- recentDocs: 1 (+2 pts)')
    expect(text).toContain('## Evidence Docs')
    expect(text).toContain('## Knowledge Map')
    expect(text).toContain('- overview: 1 docs')
    expect(text).toContain('## Doc Debt Radar')
    expect(text).toContain('- risky.md: score 52, 45d old (stale, risk)')
    expect(text).toContain('## Link Graph')
    expect(text).toContain('- References: 4 (2 ok, 1 broken, 1 stale)')
    expect(text).toContain('- Hub: README.md: 2 inbound, 1 outbound, 0 risky (/project/README.md)')
    expect(text).toContain('- Risk link: risky.md -> missing.md (missing, line 9, @missing.md)')
    expect(text).toContain('## AI Task Suggestions')
    expect(text).toContain('- [high] Repair risky document references')
    expect(text).toContain('Prompt: Review the listed documents')
    expect(text).toContain('Doc: risky.md: /project/risky.md')
    expect(text).toContain('- Markwand: /project/README.md')
    expect(text).toContain('- risky.md: 1 broken, 1 stale refs (/project/risky.md)')
    expect(text).toContain('## Recommended AI Task')
  })
})

describe('formatProjectWikiOnboardingBrief', () => {
  it('formats a lighter starter brief with reading order, checks, and first actions', () => {
    const onboardingSummary = summary({
      unreadDocs: 4,
      recentDocs: 2,
      onboardingPath: [
        { path: doc.path, name: doc.name, reason: 'entrypoint', score: 100 },
        { path: '/project/docs/plan.md', name: 'docs/plan.md', reason: 'recent', score: 80 },
      ],
      risks: {
        missingRefs: 1,
        staleRefs: 2,
        docsWithRisk: [{ path: '/project/docs/plan.md', name: 'docs/plan.md', missing: 1, stale: 2 }],
      },
      docDebt: [{
        path: '/project/docs/plan.md',
        name: 'docs/plan.md',
        score: 44,
        ageDays: 17,
        missing: 1,
        stale: 2,
        reasons: ['risk'],
      }],
      suggestedTasks: [{
        id: 'build-onboarding-brief',
        intent: 'buildOnboardingBrief',
        priority: 'medium',
        docs: [{ path: doc.path, name: doc.name, reason: 'entrypoint', score: 100 }],
      }],
      trust: {
        score: 81,
        level: 'strong',
        penalties: { riskRefs: 1, staleRefs: 2, staleDocs: 0, missingMetaDocs: 0, unreadDocs: 4 },
        signals: [],
      },
    })
    const brief = buildProjectWikiBrief('markwand', onboardingSummary, [{
      path: doc.path,
      name: doc.name,
      title: 'Markwand',
      excerpt: 'Markwand turns scattered markdown into a project map.',
    }])

    const text = formatProjectWikiOnboardingBrief('markwand', onboardingSummary, brief)

    expect(text).toContain('# Onboarding Brief: markwand')
    expect(text).toContain('## What This Project Is')
    expect(text).toContain('- Markwand turns scattered markdown into a project map.')
    expect(text).toContain('1. README.md - /project/README.md')
    expect(text).toContain('2. docs/plan.md - /project/docs/plan.md')
    expect(text).toContain('- Reference status: 1 broken links, 2 stale refs to review')
    expect(text).toContain('## Documents That May Need Cleanup')
    expect(text).toContain('- docs/plan.md: score 44, reasons risk (/project/docs/plan.md)')
    expect(text).toContain('## Suggested First Actions')
    expect(text).toContain('- Create an onboarding brief (medium)')
    expect(text).toContain('## Evidence Used')
  })
})

describe('formatProjectWikiTaskPrompt', () => {
  it('formats a copy-ready AI task prompt with goals, docs, and completion criteria', () => {
    const task = {
      id: 'repair-references',
      intent: 'repairReferences' as const,
      priority: 'high' as const,
      docs: [{ path: '/project/risky.md', name: 'risky.md', reason: 'risk' as const, score: 40 }],
    }
    const text = formatProjectWikiTaskPrompt(
      'markwand',
      summary({
        unreadDocs: 3,
        risks: {
          missingRefs: 2,
          staleRefs: 1,
          docsWithRisk: [{ path: '/project/risky.md', name: 'risky.md', missing: 2, stale: 1 }],
        },
        trust: {
          score: 61,
          level: 'watch',
          penalties: { riskRefs: 3, staleRefs: 0, staleDocs: 0, missingMetaDocs: 0, unreadDocs: 3 },
          signals: [
            { key: 'riskRefs', count: 3, impact: -30, tone: 'danger' },
            { key: 'unreadDocs', count: 3, impact: -6, tone: 'neutral' },
          ],
        },
      }),
      task
    )

    expect(text).toContain('# AI Task: Repair risky document references')
    expect(text).toContain('Project: markwand')
    expect(text).toContain('Trust score: 61/100 (watch)')
    expect(text).toContain('## Why This Task Now')
    expect(text).toContain('- riskRefs: 3 (-30 pts)')
    expect(text).toContain('- risky.md: /project/risky.md')
    expect(text).toContain('## Completion Criteria')
    expect(text).toContain('- Recommended edits or actions')
  })
})
