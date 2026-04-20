import { useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '../state/store'
import type { FsChangeEvent } from '../../preload/types'

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

  const scanDocs = useCallback(
    async (pid: string) => {
      setDocs([])
      try {
        // invoke 결과로 전체 docs 반환
        const result = await window.api.project.scanDocs(pid)
        appendDocs(result)
      } catch (err) {
        console.error('문서 스캔 실패:', err)
      }
    },
    [setDocs, appendDocs]
  )

  useEffect(() => {
    if (!projectId) return
    scanDocs(projectId)
  }, [projectId, scanDocs])

  useEffect(() => {
    // fs:change 이벤트로 실시간 업데이트
    const unsubscribe = window.api.fs.onChange(
      (_event: unknown, data: FsChangeEvent) => {
        if (!data.path.endsWith('.md')) return

        if (data.type === 'unlink') {
          removeDoc(data.path)
        } else if (data.type === 'change') {
          updateDoc(data.path, { mtime: Date.now() })
        }
      }
    )
    return unsubscribe
  }, [updateDoc, removeDoc])

  return { docs: projectDocs, scanDocs }
}
