/**
 * @vitest-environment jsdom
 *
 * Self-QA: Project Wiki AI task cards should produce copy-ready prompts.
 * This catches the user-visible regression where a suggested task is visible but
 * cannot be handed off to an AI tool from the card itself.
 */
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { fireEvent, renderWithProviders, screen, waitFor } from '../__test-utils__/render'
import type { Doc } from '../../preload/types'
import type { ProjectWikiSummary } from '../lib/projectWiki'
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
    penalties: { riskRefs: 2, staleDocs: 0, missingMetaDocs: 0, unreadDocs: 1 },
    signals: [
      { key: 'riskRefs', count: 2, impact: -20, tone: 'danger' },
      { key: 'recentDocs', count: 1, impact: 2, tone: 'positive' },
    ],
  },
  suggestedTasks: [{
    id: 'repair-references',
    intent: 'repairReferences',
    priority: 'high',
    docs: [{ path: doc.path, name: doc.name, reason: 'risk', score: 40 }],
  }],
  onboardingPath: [{ path: doc.path, name: doc.name, reason: 'entrypoint', score: 100 }],
  decisionLog: [],
  risks: {
    missingRefs: 1,
    staleRefs: 1,
    docsWithRisk: [{ path: doc.path, name: doc.name, missing: 1, stale: 1 }],
  },
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

    fireEvent.click(screen.getByRole('button', { name: 'projectWiki.navLinks' }))

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
  })
})
