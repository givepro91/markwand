/**
 * @vitest-environment jsdom
 *
 * Self-QA: the sidebar action should not depend on a specific AI app.
 * It must copy a portable project summary that users can paste anywhere.
 */
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { fireEvent, renderWithProviders, screen, waitFor } from '../__test-utils__/render'
import type { ProjectWikiSummary } from '../lib/projectWiki'
import type { ProjectWikiBrief } from '../lib/projectWikiBrief'
import { AiHandoffButton } from './AiHandoffButton'

let writeText: MockInstance<(data: string) => Promise<void>>

const summary: ProjectWikiSummary = {
  totalDocs: 2,
  markdownDocs: 2,
  imageDocs: 0,
  recentDocs: 1,
  unreadDocs: 1,
  sourceCounts: [],
  statusCounts: [],
  clusters: [{
    key: 'overview',
    count: 1,
    docs: [{ path: '/project/README.md', name: 'README.md', reason: 'entrypoint', score: 90 }],
  }],
  docDebt: [],
  relationships: {
    checkedDocs: 1,
    totalRefs: 1,
    okRefs: 1,
    missingRefs: 0,
    staleRefs: 0,
    hubs: [],
    riskyLinks: [],
  },
  trust: {
    score: 88,
    level: 'strong',
    penalties: { riskRefs: 0, staleRefs: 0, staleDocs: 0, missingMetaDocs: 0, unreadDocs: 1 },
    signals: [],
  },
  pulse: {
    tone: 'active',
    focus: 'buildOnboardingBrief',
    reasons: ['recentDocs'],
    primaryDoc: { path: '/project/README.md', name: 'README.md', reason: 'entrypoint', score: 90 },
    actionTaskId: null,
  },
  suggestedTasks: [],
  onboardingPath: [{ path: '/project/README.md', name: 'README.md', reason: 'entrypoint', score: 90 }],
  decisionLog: [],
  decisionTimeline: [],
  risks: {
    missingRefs: 0,
    staleRefs: 0,
    docsWithRisk: [],
  },
}

const brief: ProjectWikiBrief = {
  headline: 'Markwand makes docs easier to understand',
  overview: ['A readable guide for scattered project documents.'],
  evidence: [{
    path: '/project/README.md',
    name: 'README.md',
    title: 'README',
    excerpt: 'The starting point for the project.',
  }],
}

beforeEach(() => {
  if (!navigator.clipboard) {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => {} },
    })
  }
  writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
})

describe('AiHandoffButton', () => {
  it('copies a portable project handoff instead of launching a specific AI app', async () => {
    renderWithProviders(
      <AiHandoffButton projectName="markwand" summary={summary} brief={brief} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'aiHandoff.copyAria' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    const copied = writeText.mock.calls[0][0]
    expect(copied).toContain('# Handoff Brief: markwand')
    expect(copied).toContain('Markdown docs: 2')
    expect(copied).toContain('Markwand makes docs easier to understand')
    expect(screen.getByRole('button', { name: 'aiHandoff.copyAria' })).toHaveTextContent('aiHandoff.copied')
  })
})
