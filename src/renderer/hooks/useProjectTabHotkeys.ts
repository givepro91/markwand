import { useCallback, useEffect } from 'react'
import { useAppStore } from '../state/store'

export function useProjectTabHotkeys(): void {
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const openProjectTabs = useAppStore((s) => s.openProjectTabs)
  const openProjectTabsLength = openProjectTabs.length
  const recentlyClosedProjectTabsLength = useAppStore((s) => s.recentlyClosedProjectTabs.length)
  const closeProjectTab = useAppStore((s) => s.closeProjectTab)
  const reopenClosedProjectTab = useAppStore((s) => s.reopenClosedProjectTab)
  const activateProjectTabAt = useAppStore((s) => s.activateProjectTabAt)
  const activateAdjacentProjectTab = useAppStore((s) => s.activateAdjacentProjectTab)

  const persistCurrentViewMode = useCallback(() => {
    const nextViewMode = useAppStore.getState().viewMode
    void window.api.prefs.set('viewMode', nextViewMode).catch(() => undefined)
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey || e.ctrlKey || e.altKey) return

      const key = e.key.toLowerCase()
      if (!e.shiftKey && key >= '1' && key <= '9') {
        const index = Number(key) - 1
        if (index >= openProjectTabsLength) return
        e.preventDefault()
        activateProjectTabAt(index)
        persistCurrentViewMode()
        return
      }

      if (!e.shiftKey && key === 'w') {
        e.preventDefault()
        if (openProjectTabsLength === 0) return
        const tabToClose =
          activeProjectId && openProjectTabs.includes(activeProjectId)
            ? activeProjectId
            : openProjectTabs[0]
        closeProjectTab(tabToClose)
        persistCurrentViewMode()
        return
      }

      if (!e.shiftKey) return
      if (key === 't') {
        e.preventDefault()
        if (recentlyClosedProjectTabsLength === 0) return
        reopenClosedProjectTab()
        persistCurrentViewMode()
        return
      }

      if (e.code === 'BracketLeft' || e.key === '[' || e.key === '{') {
        if (openProjectTabsLength === 0) return
        e.preventDefault()
        activateAdjacentProjectTab(-1)
        persistCurrentViewMode()
      } else if (e.code === 'BracketRight' || e.key === ']' || e.key === '}') {
        if (openProjectTabsLength === 0) return
        e.preventDefault()
        activateAdjacentProjectTab(1)
        persistCurrentViewMode()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    activeProjectId,
    activateAdjacentProjectTab,
    activateProjectTabAt,
    closeProjectTab,
    openProjectTabs,
    openProjectTabsLength,
    persistCurrentViewMode,
    recentlyClosedProjectTabsLength,
    reopenClosedProjectTab,
  ])
}
