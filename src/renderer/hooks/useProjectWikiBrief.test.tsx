/**
 * @vitest-environment jsdom
 *
 * Self-QA: Project Wiki Brief reads multiple docs asynchronously.
 * These tests lock the race where a slower previous readDoc result could overwrite
 * the brief after the user switches project/doc sets.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { Doc, ReadDocResult } from '../../preload/types'
import type { ProjectWikiSummary, WikiDocLink } from '../lib/projectWiki'
import { installApiMock } from '../__test-utils__/apiMock'
import { useProjectWikiBrief } from './useProjectWikiBrief'

function makeDoc(name: string, overrides: Partial<Doc> = {}): Doc {
  return {
    path: `/project/${name}`,
    projectId: 'p1',
    name,
    mtime: 1700000000000,
    ...overrides,
  }
}

function makeSummary(items: WikiDocLink[], overrides: Partial<ProjectWikiSummary> = {}): ProjectWikiSummary {
  return {
    totalDocs: items.length,
    markdownDocs: items.length,
    imageDocs: 0,
    recentDocs: 0,
    unreadDocs: items.length,
    sourceCounts: [],
    statusCounts: [],
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
      primaryDoc: items[0] ?? null,
      actionTaskId: null,
    },
    onboardingPath: items,
    decisionLog: [],
    decisionTimeline: [],
    risks: { missingRefs: 0, staleRefs: 0, docsWithRisk: [] },
    ...overrides,
  }
}

function makeLink(doc: Doc): WikiDocLink {
  return {
    path: doc.path,
    name: doc.name,
    reason: 'entrypoint',
    score: 100,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useProjectWikiBrief', () => {
  it('reads picked docs and builds a citation-ready brief', async () => {
    const readDoc = vi.fn(async (path: string): Promise<ReadDocResult> => ({
      content: `# ${path.includes('README') ? 'Markwand' : 'Design'}\n\nThis document explains a useful project signal for the wiki brief.`,
      mtime: 1,
    }))
    installApiMock({ fs: { readDoc } })

    const readme = makeDoc('README.md')
    const design = makeDoc('design.md')
    const summary = makeSummary([makeLink(readme), makeLink(design)])
    const docsByPath = new Map([
      [readme.path, readme],
      [design.path, design],
    ])

    const { result } = renderHook(() => useProjectWikiBrief('markwand', summary, docsByPath))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(readDoc).toHaveBeenCalledTimes(2)
    expect(result.current.brief?.headline).toBe('Markwand')
    expect(result.current.brief?.evidence.map((item) => item.path)).toEqual([readme.path, design.path])
  })

  it('does not let a stale readDoc response overwrite a newer project brief', async () => {
    const oldRead = deferred<ReadDocResult>()
    const newRead = deferred<ReadDocResult>()
    const readDoc = vi.fn((path: string) => {
      if (path.includes('old')) return oldRead.promise
      return newRead.promise
    })
    installApiMock({ fs: { readDoc } })

    const oldDoc = makeDoc('old.md')
    const newDoc = makeDoc('new.md', { projectId: 'p2', path: '/next/new.md' })
    const oldSummary = makeSummary([makeLink(oldDoc)])
    const newSummary = makeSummary([makeLink(newDoc)])
    const oldDocsByPath = new Map([[oldDoc.path, oldDoc]])
    const newDocsByPath = new Map([[newDoc.path, newDoc]])

    const { result, rerender } = renderHook(
      ({ projectName, summary, docsByPath }) => useProjectWikiBrief(projectName, summary, docsByPath),
      { initialProps: { projectName: 'old-project', summary: oldSummary, docsByPath: oldDocsByPath } }
    )

    rerender({ projectName: 'new-project', summary: newSummary, docsByPath: newDocsByPath })

    await act(async () => {
      newRead.resolve({
        content: '# New Project\n\nThis newer project brief must win over the slower old read.',
        mtime: 2,
      })
      await newRead.promise
    })
    await waitFor(() => expect(result.current.brief?.headline).toBe('New Project'))

    await act(async () => {
      oldRead.resolve({
        content: '# Old Project\n\nThis stale result should be ignored after rerender cleanup.',
        mtime: 1,
      })
      await oldRead.promise
    })

    expect(result.current.brief?.headline).toBe('New Project')
  })

  it('does not refetch when only the summary object identity changes', async () => {
    const readDoc = vi.fn(async (): Promise<ReadDocResult> => ({
      content: '# Stable Project\n\nThis stable project brief should not refetch on equivalent summary objects.',
      mtime: 1,
    }))
    installApiMock({ fs: { readDoc } })

    const doc = makeDoc('README.md')
    const docsByPath = new Map([[doc.path, doc]])

    const { result, rerender } = renderHook(
      ({ summary }) => useProjectWikiBrief('markwand', summary, docsByPath),
      { initialProps: { summary: makeSummary([makeLink(doc)]) } }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(readDoc).toHaveBeenCalledTimes(1)

    rerender({ summary: makeSummary([makeLink(doc)]) })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(readDoc).toHaveBeenCalledTimes(1)
    expect(result.current.brief?.headline).toBe('Stable Project')
  })

  it('updates activity wording without rereading document evidence', async () => {
    const readDoc = vi.fn(async (): Promise<ReadDocResult> => ({
      content: '# Risky Project\n\nThis project brief evidence should be reused while risk counts change.',
      mtime: 1,
    }))
    installApiMock({ fs: { readDoc } })

    const doc = makeDoc('README.md')
    const docsByPath = new Map([[doc.path, doc]])
    const initialSummary = makeSummary([makeLink(doc)])
    const activeSummary = makeSummary([makeLink(doc)], {
      recentDocs: 2,
    })

    const { result, rerender } = renderHook(
      ({ summary }) => useProjectWikiBrief('markwand', summary, docsByPath),
      { initialProps: { summary: initialSummary } }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(readDoc).toHaveBeenCalledTimes(1)

    rerender({ summary: activeSummary })

    await waitFor(() => {
      expect(result.current.brief?.overview).toContain(
        '2 documents changed in the last 7 days, so this project is currently active.'
      )
    })
    expect(readDoc).toHaveBeenCalledTimes(1)
  })

  it('clears loading state when doc evidence cannot be read', async () => {
    installApiMock({
      fs: {
        readDoc: vi.fn(async () => {
          throw new Error('read failed')
        }),
      },
    })

    const doc = makeDoc('README.md')
    const summary = makeSummary([makeLink(doc)])
    const docsByPath = new Map([[doc.path, doc]])

    const { result } = renderHook(() => useProjectWikiBrief('markwand', summary, docsByPath))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.brief).toBeNull()
  })
})
