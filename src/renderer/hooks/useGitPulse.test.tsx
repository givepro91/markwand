/**
 * @vitest-environment jsdom
 *
 * Self-QA: Git Pulse is async IPC data. These tests lock the project-switch race
 * so a slower previous workspace cannot overwrite the currently selected project.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitPulseSummary } from '../../preload/types'
import { installApiMock } from '../__test-utils__/apiMock'
import { useGitPulse } from './useGitPulse'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function makeSummary(branch: string): GitPulseSummary {
  return {
    available: true,
    branch,
    head: 'abc123',
    dirtyCount: 0,
    recentCommitCount: 1,
    changedFileCount: 1,
    changedAreas: ['src'],
    commits: [{ hash: 'abc123', subject: `feat: update ${branch}`, relativeTime: '1 minute ago' }],
    cachedAt: Date.now(),
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useGitPulse', () => {
  it('loads a local git pulse summary for the selected project root', async () => {
    const gitSummary = vi.fn(async () => makeSummary('main'))
    installApiMock({ project: { gitSummary } })

    const { result } = renderHook(() => useGitPulse('/workspace/markwand'))

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(gitSummary).toHaveBeenCalledWith('/workspace/markwand')
    expect(result.current.summary?.available).toBe(true)
    expect(result.current.summary?.branch).toBe('main')
  })

  it('does not let a stale gitSummary response overwrite a newer project root', async () => {
    const oldPulse = deferred<GitPulseSummary>()
    const newPulse = deferred<GitPulseSummary>()
    const gitSummary = vi.fn((projectRoot: string) => {
      if (projectRoot.includes('old')) return oldPulse.promise
      return newPulse.promise
    })
    installApiMock({ project: { gitSummary } })

    const { result, rerender } = renderHook(({ projectRoot }) => useGitPulse(projectRoot), {
      initialProps: { projectRoot: '/workspace/old' },
    })

    rerender({ projectRoot: '/workspace/new' })

    await act(async () => {
      newPulse.resolve(makeSummary('new-branch'))
      await newPulse.promise
    })
    await waitFor(() => expect(result.current.summary?.branch).toBe('new-branch'))

    await act(async () => {
      oldPulse.resolve(makeSummary('old-branch'))
      await oldPulse.promise
    })

    expect(result.current.summary?.branch).toBe('new-branch')
    expect(result.current.loading).toBe(false)
  })

  it('returns an unavailable summary instead of leaving the UI loading on IPC failure', async () => {
    installApiMock({
      project: {
        gitSummary: vi.fn(async () => {
          throw new Error('ipc failed')
        }),
      },
    })

    const { result } = renderHook(() => useGitPulse('/workspace/markwand'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.summary).toMatchObject({ available: false, reason: 'error' })
  })
})
