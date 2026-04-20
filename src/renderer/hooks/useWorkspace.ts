import { useEffect, useCallback } from 'react'
import { useAppStore } from '../state/store'

export function useWorkspace() {
  const {
    workspaces,
    activeWorkspaceId,
    setWorkspaces,
    addWorkspace,
    removeWorkspace: removeFromStore,
    setActiveWorkspaceId,
  } = useAppStore()

  useEffect(() => {
    window.api.workspace.list().then((list) => {
      setWorkspaces(list)
      // 저장된 activeWorkspaceId 복원
      window.api.prefs.get('activeWorkspaceId').then((id) => {
        if (typeof id === 'string' && list.some((w) => w.id === id)) {
          setActiveWorkspaceId(id)
        } else if (list.length > 0) {
          setActiveWorkspaceId(list[0].id)
        }
      })
    })
  }, [setWorkspaces, setActiveWorkspaceId])

  const addWorkspaceAction = useCallback(async () => {
    try {
      const workspace = await window.api.workspace.add('')
      addWorkspace(workspace)
      setActiveWorkspaceId(workspace.id)
      await window.api.prefs.set('activeWorkspaceId', workspace.id)
      return workspace
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message !== 'DIALOG_CANCELED') {
        console.error('워크스페이스 추가 실패:', err)
      }
      return null
    }
  }, [addWorkspace, setActiveWorkspaceId])

  const removeWorkspaceAction = useCallback(
    async (id: string) => {
      await window.api.workspace.remove(id)
      removeFromStore(id)
      if (activeWorkspaceId === id) {
        const remaining = workspaces.filter((w) => w.id !== id)
        const nextId = remaining.length > 0 ? remaining[0].id : null
        setActiveWorkspaceId(nextId)
        await window.api.prefs.set('activeWorkspaceId', nextId)
      }
    },
    [activeWorkspaceId, workspaces, removeFromStore, setActiveWorkspaceId]
  )

  return {
    workspaces,
    activeWorkspaceId,
    activeWorkspace: workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
    addWorkspace: addWorkspaceAction,
    removeWorkspace: removeWorkspaceAction,
    setActiveWorkspaceId,
  }
}
