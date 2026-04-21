import { useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '../state/store'
import type { Doc, FsChangeEvent } from '../../preload/types'
import { isViewable } from '../../lib/viewable'

export function useDocs(projectId: string | null) {
  const docs = useAppStore((s) => s.docs)
  const appendDocs = useAppStore((s) => s.appendDocs)
  const updateDoc = useAppStore((s) => s.updateDoc)
  const removeDoc = useAppStore((s) => s.removeDoc)

  const projectDocs = useMemo(
    () => (projectId ? docs.filter((d) => d.projectId === projectId) : []),
    [docs, projectId]
  )

  // Returns an unsubscribe fn so callers (and the effect cleanup) can cancel early.
  // Follow-up FS7 — setDocs([]) 로 전체 리셋하던 과거 동작 제거. 프로젝트 전환마다 전체 docs 목록을
  // 초기화하면 이미 스캔 완료된 다른 프로젝트들의 docs 도 함께 날아가 재스캔 유발. 대신 현 프로젝트의
  // stale docs 만 제거하고 append 방식으로 누적. main 쪽 캐시(docsCache)가 hit 이면 chunk 하나로
  // 즉시 보내주므로 flicker 도 거의 없음.
  const scanDocs = useCallback(
    (pid: string): (() => void) => {
      // 현 프로젝트의 기존 docs 제거(중복 방지). 다른 프로젝트 docs 는 유지.
      useAppStore.setState((state) => ({
        docs: state.docs.filter((d) => d.projectId !== pid),
      }))

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
    [appendDocs]
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
        // watcher가 stat으로 size를 함께 보내는 경우 Doc.size도 갱신한다.
        // size가 undefined이면(stat 실패 등) 필드 자체를 빼 기존 값을 유지.
        const patch: Partial<Doc> = { mtime: Date.now() }
        if (data.size !== undefined) patch.size = data.size
        updateDoc(data.path, patch)
      }
    })
    return unsubscribe
  }, [updateDoc, removeDoc])

  return { docs: projectDocs, scanDocs }
}
