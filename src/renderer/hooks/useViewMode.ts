import { useCallback } from 'react'
import { useAppStore } from '../state/store'
import type { ViewMode } from '../../../src/preload/types'

export function useViewMode() {
  const { viewMode, setViewMode } = useAppStore()

  const changeViewMode = useCallback(
    async (mode: ViewMode) => {
      setViewMode(mode)
      await window.api.prefs.set('viewMode', mode)
    },
    [setViewMode]
  )

  return { viewMode, setViewMode: changeViewMode }
}
