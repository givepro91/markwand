/**
 * @vitest-environment jsdom
 *
 * Self-QA: Project Wiki AI task cards should produce copy-ready prompts.
 * This catches the user-visible regression where a suggested task is visible but
 * cannot be handed off to an AI tool from the card itself.
 */
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { fireEvent, renderWithProviders, screen, waitFor } from '../__test-utils__/render'
import type { Doc, GitPulseSummary } from '../../preload/types'
import type { ProjectWikiSummary } from '../lib/projectWiki'
import type { ProjectWikiBrief } from '../lib/projectWikiBrief'
import { ProjectWikiPanel } from './ProjectWikiPanel'

let writeText: MockInstance<(data: string) => Promise<void>>

const doc: Doc = {
  path: '/project/risky.md',
  projectId: 'p1',
  name: 'risky.md',
  mtime: Date.parse('2026-05-01T00:00:00Z'),
}

const summary: ProjectWikiSummary = {
  totalDocs: 1,
  markdownDocs: 1,
  imageDocs: 0,
  recentDocs: 1,
  unreadDocs: 1,
  sourceCounts: [],
  statusCounts: [],
  clusters: [],
  docDebt: [],
  relationships: {
    checkedDocs: 1,
    totalRefs: 2,
    okRefs: 0,
    missingRefs: 1,
    staleRefs: 1,
    hubs: [{
      path: doc.path,
      name: doc.name,
      inbound: 0,
      outbound: 2,
      riskRefs: 2,
    }],
    riskyLinks: [{
      sourcePath: doc.path,
      sourceName: doc.name,
      targetPath: '/project/missing.md',
      targetName: 'missing.md',
      raw: '@missing.md',
      status: 'missing',
      kind: 'at',
      line: 7,
    }],
  },
  trust: {
    score: 70,
    level: 'watch',
    penalties: { riskRefs: 2, staleRefs: 0, staleDocs: 0, missingMetaDocs: 0, unreadDocs: 1 },
    signals: [
      { key: 'riskRefs', count: 2, impact: -20, tone: 'danger' },
      { key: 'recentDocs', count: 1, impact: 2, tone: 'positive' },
    ],
  },
  pulse: {
    tone: 'attention',
    focus: 'repairReferences',
    reasons: ['riskRefs', 'unreadDocs', 'recentDocs'],
    primaryDoc: { path: doc.path, name: doc.name, reason: 'risk', score: 40 },
    actionTaskId: 'repair-references',
  },
  suggestedTasks: [{
    id: 'repair-references',
    intent: 'repairReferences',
    priority: 'high',
    docs: [{ path: doc.path, name: doc.name, reason: 'risk', score: 40 }],
  }],
  onboardingPath: [{ path: doc.path, name: doc.name, reason: 'entrypoint', score: 100 }],
  decisionLog: [],
  decisionTimeline: [{
    path: doc.path,
    name: doc.name,
    kind: 'review',
    status: 'draft',
    source: 'review',
    ageDays: 2,
    score: 150,
  }],
  risks: {
    missingRefs: 1,
    staleRefs: 1,
    docsWithRisk: [{ path: doc.path, name: doc.name, missing: 1, stale: 1 }],
  },
}

const brief: ProjectWikiBrief = {
  headline: 'Markwand',
  overview: ['Markwand turns scattered markdown into a project map.'],
  evidence: [{
    path: doc.path,
    name: doc.name,
    title: 'Markwand',
    excerpt: 'Markwand turns scattered markdown into a project map.',
  }],
}

const gitPulse: GitPulseSummary = {
  available: true,
  branch: 'main',
  head: 'abc123',
  dirtyCount: 1,
  recentCommitCount: 4,
  changedFileCount: 6,
  changedAreas: ['src/renderer', 'docs'],
  latestTag: 'v0.4.0-beta.10',
  commits: [
    { hash: 'abc123', subject: 'feat: add wiki trust signals', author: 'jay', relativeTime: '2 hours ago' },
    { hash: 'def456', subject: 'fix: keep side panel usable', author: 'jay', relativeTime: '1 day ago' },
  ],
  cachedAt: Date.now(),
}

beforeEach(() => {
  if (!navigator.clipboard) {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => {} },
    })
  }
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: undefined,
  })
  writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
})

describe('ProjectWikiPanel — AI task prompt copy', () => {
  it('keeps wiki section navigation collapsed until the user asks for it', async () => {
    renderWithProviders(
      <ProjectWikiPanel
        projectName="markwand"
        summary={summary}
        brief={null}
        briefLoading={false}
        docsByPath={new Map([[doc.path, doc]])}
        onOpenDoc={vi.fn()}
      />
    )

    const header = screen.getByRole('banner')
    expect(header).toContainElement(screen.getByRole('button', { name: 'projectWiki.navToggle' }))
    expect(screen.queryByRole('button', { name: 'projectWiki.navBrief' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'projectWiki.navToggle' }))

    expect(screen.getByRole('button', { name: 'projectWiki.navBrief' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'projectWiki.navRisks' })).toBeInTheDocument()
  })

  it('copies a focused AI task prompt from the suggested task card', async () => {
    renderWithProviders(
      <ProjectWikiPanel
        projectName="markwand"
        summary={summary}
        brief={null}
        briefLoading={false}
        docsByPath={new Map([[doc.path, doc]])}
        onOpenDoc={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'projectWiki.copyTaskPromptAria' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    const copied = writeText.mock.calls[0][0]
    expect(copied).toContain('# AI Task: Repair risky document references')
    expect(copied).toContain('Project: markwand')
    expect(copied).toContain('- risky.md: /project/risky.md')
    expect(copied).toContain('## Completion Criteria')
  })

  it('shows local Git Pulse when a repository summary is available', () => {
    renderWithProviders(
      <ProjectWikiPanel
        projectName="markwand"
        summary={summary}
        gitPulse={gitPulse}
        gitPulseLoading={false}
        brief={null}
        briefLoading={false}
        docsByPath={new Map([[doc.path, doc]])}
        onOpenDoc={vi.fn()}
      />
    )

    expect(screen.getByText('projectWiki.git.title')).toBeInTheDocument()
    expect(screen.getByText('projectWiki.git.branch')).toBeInTheDocument()
    expect(screen.getByText('src/renderer')).toBeInTheDocument()
    expect(screen.getByText('feat: add wiki trust signals')).toBeInTheDocument()
  })

  it('hides Git Pulse for unsupported projects such as SSH workspaces', () => {
    renderWithProviders(
      <ProjectWikiPanel
        projectName="markwand"
        summary={summary}
        gitPulse={{ available: false, reason: 'ssh-unsupported' }}
        gitPulseLoading={false}
        brief={null}
        briefLoading={false}
        docsByPath={new Map([[doc.path, doc]])}
        onOpenDoc={vi.fn()}
      />
    )

    expect(screen.queryByText('projectWiki.git.title')).not.toBeInTheDocument()
  })

  it('opens the first related document from a suggested task card', async () => {
    const onOpenDoc = vi.fn()
    renderWithProviders(
      <ProjectWikiPanel
        projectName="markwand"
        summary={summary}
        brief={null}
        briefLoading={false}
        docsByPath={new Map([[doc.path, doc]])}
        onOpenDoc={onOpenDoc}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'projectWiki.openTaskDocAria' }))

    expect(onOpenDoc).toHaveBeenCalledWith(doc)
  })

  it('opens the Project Pulse focus document', async () => {
    const onOpenDoc = vi.fn()
    renderWithProviders(
      <ProjectWikiPanel
        projectName="markwand"
        summary={summary}
        brief={null}
        briefLoading={false}
        docsByPath={new Map([[doc.path, doc]])}
        onOpenDoc={onOpenDoc}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'projectWiki.pulse.openFocusDocAria' }))

    expect(onOpenDoc).toHaveBeenCalledWith(doc)
  })

  it('copies the Project Pulse task prompt', async () => {
    renderWithProviders(
      <ProjectWikiPanel
        projectName="markwand"
        summary={summary}
        brief={null}
        briefLoading={false}
        docsByPath={new Map([[doc.path, doc]])}
        onOpenDoc={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'projectWiki.pulse.copyPromptAria' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    expect(writeText.mock.calls[0][0]).toContain('# AI Task: Repair risky document references')
  })

  it('copies a lightweight onboarding brief from the project brief card', async () => {
    renderWithProviders(
      <ProjectWikiPanel
        projectName="markwand"
        summary={summary}
        brief={brief}
        briefLoading={false}
        docsByPath={new Map([[doc.path, doc]])}
        onOpenDoc={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'projectWiki.copyOnboardingBriefAria' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    const copied = writeText.mock.calls[0][0]
    expect(copied).toContain('# Onboarding Brief: markwand')
    expect(copied).toContain('## Read This First')
    expect(copied).toContain('1. risky.md - /project/risky.md')
    expect(copied).toContain('## Suggested First Actions')
  })

  it('opens the source document from a risky link graph row', () => {
    const onOpenDoc = vi.fn()
    renderWithProviders(
      <ProjectWikiPanel
        projectName="markwand"
        summary={summary}
        brief={null}
        briefLoading={false}
        docsByPath={new Map([[doc.path, doc]])}
        onOpenDoc={onOpenDoc}
      />
    )

    fireEvent.click(screen.getByText('risky.md → missing.md'))

    expect(onOpenDoc).toHaveBeenCalledWith(doc)
  })

  it('opens a document from the decision timeline', () => {
    const onOpenDoc = vi.fn()
    renderWithProviders(
      <ProjectWikiPanel
        projectName="markwand"
        summary={summary}
        brief={null}
        briefLoading={false}
        docsByPath={new Map([[doc.path, doc]])}
        onOpenDoc={onOpenDoc}
      />
    )

    fireEvent.click(screen.getByText('projectWiki.decisionAge'))

    expect(onOpenDoc).toHaveBeenCalledWith(doc)
  })

  it('keeps dense wiki cards shrinkable when file names and badges are long', () => {
    const longName = 'web/public/docs/designs/2026-04-30-extremely-long-product-decision-record-that-used-to-overflow.md'
    const overflowSummary: ProjectWikiSummary = {
      ...summary,
      docDebt: [{
        path: '/project/overflow.md',
        name: longName,
        role: 'reference',
        score: 1667,
        missing: 42,
        stale: 7,
        reasons: ['risk', 'missingMeta', 'unread'],
        ageDays: 39,
      }],
      decisionTimeline: [{
        path: '/project/overflow.md',
        name: longName,
        kind: 'design',
        status: 'frontmatter-status-that-should-not-push-the-card-wide',
        source: 'frontmatter-source-that-should-stay-contained',
        ageDays: 0,
        score: 1667,
      }],
    }

    renderWithProviders(
      <ProjectWikiPanel
        projectName="markwand"
        summary={overflowSummary}
        brief={null}
        briefLoading={false}
        docsByPath={new Map([['/project/overflow.md', { ...doc, path: '/project/overflow.md', name: longName }]])}
        onOpenDoc={vi.fn()}
      />
    )

    const [debtTitle, timelineTitle] = screen.getAllByText(longName)
    const docDebtSection = screen.getByText('projectWiki.docDebtTitle').closest('section')
    const decisionSection = screen.getByText('projectWiki.decisionsTitle').closest('section')
    const debtButton = debtTitle.closest('button')
    const timelineButton = timelineTitle.closest('button')

    expect(docDebtSection).toHaveStyle({ minWidth: '0' })
    expect(decisionSection).toHaveStyle({ minWidth: '0' })
    expect(debtButton).toHaveStyle({ minWidth: '0', width: '100%', boxSizing: 'border-box' })
    expect(timelineButton).toHaveStyle({ minWidth: '0', width: '100%', boxSizing: 'border-box' })
    expect(debtTitle).toHaveStyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
    expect(timelineTitle).toHaveStyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
  })

  it('jumps to wiki sections from the sticky section navigation', () => {
    renderWithProviders(
      <ProjectWikiPanel
        projectName="markwand"
        summary={summary}
        brief={null}
        briefLoading={false}
        docsByPath={new Map([[doc.path, doc]])}
        onOpenDoc={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'projectWiki.navToggle' }))
    fireEvent.click(screen.getByRole('button', { name: 'projectWiki.navLinks' }))

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('respects reduced-motion preference when jumping between wiki sections', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    })

    renderWithProviders(
      <ProjectWikiPanel
        projectName="markwand"
        summary={summary}
        brief={null}
        briefLoading={false}
        docsByPath={new Map([[doc.path, doc]])}
        onOpenDoc={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'projectWiki.navToggle' }))
    fireEvent.click(screen.getByRole('button', { name: 'projectWiki.navLinks' }))

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
  })
})
