import { useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '../state/store'
import type { Doc, FsChangeEvent } from '../../preload/types'
import { isViewable } from '../../lib/viewable'

export function useDocs(projectId: string | null) {
  const docs = useAppStore((s) => s.docs)
  const setDocs = useAppStore((s) => s.setDocs)
  const appendDocs = useAppStore((s) => s.appendDocs)
  const updateDoc = useAppStore((s) => s.updateDoc)
  const removeDoc = useAppStore((s) => s.removeDoc)

  const projectDocs = useMemo(
    () => (projectId ? docs.filter((d) => d.projectId === projectId) : []),
    [docs, projectId]
  )

  // Returns an unsubscribe fn so callers (and the effect cleanup) can cancel early.
  const scanDocs = useCallback(
    (pid: string): (() => void) => {
      setDocs([])

      const unsub = window.api.project.onDocsChunk((chunk: Doc[]) => {
        const relevant = chunk.filter((d) => d.projectId === pid)
        if (relevant.length > 0) appendDocs(relevant)
      })

      window.api.project
        .scanDocs(pid)
        .then((result) => {
          console.log(`[useDocs] ${pid}: ${result.length} docs`)
        })
        .catch((err) => {
          console.error('문서 스캔 실패:', err)
        })
        .finally(() => unsub())

      return unsub
    },
    [setDocs, appendDocs]
  )

  useEffect(() => {
    if (!projectId) return
    const unsub = scanDocs(projectId)
    return unsub
  }, [projectId, scanDocs])

  useEffect(() => {
    const unsubscribe = window.api.fs.onChange((data: FsChangeEvent) => {
      // Viewable asset(md + 이미지)만 처리. 그 외 확장자는 watcher에서도 걸러지지만
      // 방어적으로 렌더러에서도 한 번 더 체크한다.
      if (!isViewable(data.path)) return
      if (data.type === 'unlink') {
        removeDoc(data.path)
      } else if (data.type === 'change') {
        updateDoc(data.path, { mtime: Date.now() })
      }
    })
    return unsubscribe
  }, [updateDoc, removeDoc])

  return { docs: projectDocs, scanDocs }
}
