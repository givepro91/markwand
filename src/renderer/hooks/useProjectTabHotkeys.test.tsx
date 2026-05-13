/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { installApiMock } from '../__test-utils__/apiMock'
import { act, renderHook } from '../__test-utils__/render'
import { useAppStore } from '../state/store'
import { useProjectTabHotkeys } from './useProjectTabHotkeys'

function dispatchMetaKey(key: string, options: { code?: string; shiftKey?: boolean } = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    code: options.code,
    metaKey: true,
    shiftKey: options.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  })
  window.dispatchEvent(event)
  return event
}

beforeEach(() => {
  installApiMock()
  useAppStore.setState({
    activeProjectId: 'p1',
    openProjectTabs: ['p1', 'p2', 'p3'],
    recentlyClosedProjectTabs: [],
    projectViewSessions: {},
    viewMode: 'project',
  })
})

describe('useProjectTabHotkeys', () => {
  it('Cmd+number activates that project tab and persists project view mode', () => {
    const api = installApiMock()
    renderHook(() => useProjectTabHotkeys())

    const event = dispatchMetaKey('2')

    expect(event.defaultPrevented).toBe(true)
    expect(useAppStore.getState().activeProjectId).toBe('p2')
    expect(useAppStore.getState().viewMode).toBe('project')
    expect(api.prefs.set).toHaveBeenCalledWith('viewMode', 'project')
  })

  it('Cmd+Shift+brackets cycles through open tabs and wraps around', () => {
    renderHook(() => useProjectTabHotkeys())

    act(() => {
      dispatchMetaKey('{', { code: 'BracketLeft', shiftKey: true })
    })
    expect(useAppStore.getState().activeProjectId).toBe('p3')

    act(() => {
      dispatchMetaKey('}', { code: 'BracketRight', shiftKey: true })
    })
    expect(useAppStore.getState().activeProjectId).toBe('p1')
  })

  it('Cmd+W closes the active project tab', () => {
    renderHook(() => useProjectTabHotkeys())

    const event = dispatchMetaKey('w')

    expect(event.defaultPrevented).toBe(true)
    expect(useAppStore.getState().openProjectTabs).toEqual(['p2', 'p3'])
    expect(useAppStore.getState().activeProjectId).toBe('p2')
    expect(useAppStore.getState().viewMode).toBe('project')
  })

  it('Cmd+W still closes the active tab outside project view', () => {
    useAppStore.setState({ viewMode: 'all' })
    renderHook(() => useProjectTabHotkeys())

    const event = dispatchMetaKey('w')

    expect(event.defaultPrevented).toBe(true)
    expect(useAppStore.getState().openProjectTabs).toEqual(['p2', 'p3'])
    expect(useAppStore.getState().activeProjectId).toBe('p2')
  })

  it('Cmd+W is swallowed as a no-op when there are no project tabs', () => {
    useAppStore.setState({
      activeProjectId: null,
      openProjectTabs: [],
      recentlyClosedProjectTabs: [],
      viewMode: 'all',
    })
    renderHook(() => useProjectTabHotkeys())

    const event = dispatchMetaKey('w')

    expect(event.defaultPrevented).toBe(true)
    expect(useAppStore.getState().openProjectTabs).toEqual([])
    expect(useAppStore.getState().activeProjectId).toBeNull()
  })

  it('Cmd+Shift+T reopens the last closed project tab and restores its session', () => {
    const api = installApiMock()
    useAppStore.setState({
      activeProjectId: 'p1',
      openProjectTabs: ['p1'],
      recentlyClosedProjectTabs: [
        {
          projectId: 'p2',
          session: { selectedDocPath: '/p2/a.md', showWiki: false, scrollTop: 64 },
        },
      ],
      projectViewSessions: {},
      viewMode: 'all',
    })
    renderHook(() => useProjectTabHotkeys())

    const event = dispatchMetaKey('T', { shiftKey: true })

    expect(event.defaultPrevented).toBe(true)
    expect(useAppStore.getState().openProjectTabs).toEqual(['p1', 'p2'])
    expect(useAppStore.getState().activeProjectId).toBe('p2')
    expect(useAppStore.getState().viewMode).toBe('project')
    expect(useAppStore.getState().projectViewSessions.p2).toEqual({
      selectedDocPath: '/p2/a.md',
      showWiki: false,
      scrollTop: 64,
    })
    expect(api.prefs.set).toHaveBeenCalledWith('viewMode', 'project')
  })
})
