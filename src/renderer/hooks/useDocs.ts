import { useEffect, useCallback, useMemo, useState } from 'react'
import { useAppStore } from '../state/store'
import type { Doc, FsChangeEvent } from '../../preload/types'
import { isViewable } from '../../lib/viewable'

// B: O(1) per-project selector (Map lookup)
export function useDocsOf(projectId: string): Doc[] {
  return useAppStore((s) => s.docsByProject.get(projectId) ?? [])
}

// B: flat all-docs accessor (cachedFlat 참조)
export function useAllDocsFlat(): Doc[] {
  return useAppStore((s) => s.docs)
}

// B: frontmatter 인덱스 → Array (Set → sorted array)
export function useFrontmatterIndex(): { statuses: string[]; sources: string[] } {
  return useAppStore((s) => ({
    statuses: [...s.frontmatterIndex.statuses].sort(),
    sources: [...s.frontmatterIndex.sources].sort(),
  }))
}

export function useDocs(projectId: string | null) {
  const appendDocs = useAppStore((s) => s.appendDocs)
  const updateDoc = useAppStore((s) => s.updateDoc)
  const removeDoc = useAppStore((s) => s.removeDoc)
  // Follow-up FS9-B — 좌측 파일 트리 로딩 UI 용. SSH 원격은 수 초 걸려 빈 상태가 버그처럼 보이는 문제 해소.
  const [isScanning, setIsScanning] = useState(false)

  // B: useDocsOf를 내부 위임으로 사용
  const projectDocs = useDocsOf(projectId ?? '')
  const filteredDocs = useMemo(
    () => (projectId ? projectDocs : []),
    [projectDocs, projectId]
  )

  // Returns an unsubscribe fn so callers (and the effect cleanup) can cancel early.
  // Follow-up FS7 — setDocs([]) 로 전체 리셋하던 과거 동작 제거. 프로젝트 전환마다 전체 docs 목록을
  // 초기화하면 이미 스캔 완료된 다른 프로젝트들의 docs 도 함께 날아가 재스캔 유발. 대신 현 프로젝트의
  // stale docs 만 제거하고 append 방식으로 누적. main 쪽 캐시(docsCache)가 hit 이면 chunk 하나로
  // 즉시 보내주므로 flicker 도 거의 없음.
  // FS9-B — isScanning 상태로 파일 트리 로딩 UI 제공.
  const scanDocs = useCallback(
    (pid: string): (() => void) => {
      // 현 프로젝트의 기존 docs 제거(중복 방지). 다른 프로젝트 docs 는 유지.
      // C7: Map 기반 제거 — 해당 버킷만 삭제하고 cachedFlat 재계산
      useAppStore.setState((state) => {
        const map = new Map(state.docsByProject)
        map.delete(pid)
        const remaining: Doc[] = []
        for (const bucket of map.values()) {
          for (const doc of bucket) remaining.push(doc)
        }
        return {
          docs: remaining,
          docsByProject: map,
        }
      })
      setIsScanning(true)

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
        .finally(() => {
          unsub()
          setIsScanning(false)
        })

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

  return { docs: filteredDocs, scanDocs, isScanning }
}
