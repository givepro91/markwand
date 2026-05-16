import { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../state/store'
import type { Doc, FsChangeEvent } from '../../preload/types'
import { isViewable } from '../../lib/viewable'

// B: O(1) per-project selector (Map lookup)
// 빈 경로 fallback 은 모듈 상수로 고정 — `?? []` 같이 매 호출 새 배열을 만들면
// Zustand 가 참조 불일치로 강제 re-render 해 무한 루프 위험.
// freeze 로 외부 push/splice 오염 방어 (Evaluator 2026-04-25 m-1).
const EMPTY_DOCS: Doc[] = Object.freeze([]) as unknown as Doc[]
export function useDocsOf(projectId: string): Doc[] {
  return useAppStore((s) => s.docsByProject.get(projectId) ?? EMPTY_DOCS)
}

// B: flat all-docs accessor (cachedFlat 참조)
export function useAllDocsFlat(): Doc[] {
  return useAppStore((s) => s.docs)
}

// B: frontmatter 인덱스 → Array (Set → sorted array)
// Selector 가 매 호출 새 객체/배열을 반환하면 Zustand 가 참조 불일치로 매 store 변경마다
// 강제 re-render → React 18 "getSnapshot should be cached" 감지 → Maximum update depth.
// 원시 Set 참조를 구독하고, 파생 Array 는 useMemo 로 캐시한다.
export function useFrontmatterIndex(): { statuses: string[]; sources: string[] } {
  const statusesSet = useAppStore((s) => s.frontmatterIndex.statuses)
  const sourcesSet = useAppStore((s) => s.frontmatterIndex.sources)
  return useMemo(
    () => ({
      statuses: [...statusesSet].sort(),
      sources: [...sourcesSet].sort(),
    }),
    [statusesSet, sourcesSet],
  )
}

export function useDocs(projectId: string | null) {
  const appendDocs = useAppStore((s) => s.appendDocs)
  const updateDoc = useAppStore((s) => s.updateDoc)
  const removeDoc = useAppStore((s) => s.removeDoc)
  const activeScanSeqRef = useRef(0)
  const fsChangeSeqRef = useRef(0)
  const touchedFsPathsRef = useRef(new Map<string, number>())
  const mountedRef = useRef(true)
  // Follow-up FS9-B — 좌측 파일 트리 로딩 UI 용. SSH 원격은 수 초 걸려 빈 상태가 버그처럼 보이는 문제 해소.
  const [isScanning, setIsScanning] = useState(false)

  // B: useDocsOf를 내부 위임으로 사용
  const projectDocs = useDocsOf(projectId ?? '')
  const projectWorkspaceId = useAppStore((s) =>
    projectId ? s.projects.find((project) => project.id === projectId)?.workspaceId ?? null : null
  )
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
  // 새로고침 시 좌측 FileTree 스크롤 보존 — 기존 docs 를 비우지 않고 path-dedup 으로 점진 갱신.
  // scan 완료 후(.then) 결과에 없는 stale path 만 일괄 제거. 그 사이 react-arborist <Tree> 는
  // unmount 되지 않아 사용자 스크롤 위치가 유지된다. appendDocs 의 path-dedup 가 전제.
  // FS-RT-1 — force=true 면 main docsCache 우회. 명시/자동 새로고침에서 신규 파일/폴더 누락 차단.
  const scanDocs = useCallback(
    (pid: string, opts?: { force?: boolean; workspaceId?: string | null }): (() => void) => {
      const scanSeq = activeScanSeqRef.current + 1
      const scanFsChangeSeq = fsChangeSeqRef.current
      activeScanSeqRef.current = scanSeq
      let active = true
      let cleanedUp = false
      const isCurrentScan = () =>
        active && mountedRef.current && activeScanSeqRef.current === scanSeq
      const filterUntouchedScanDocs = (items: Doc[]) => {
        if (fsChangeSeqRef.current === scanFsChangeSeq) return items
        return items.filter(
          (doc) => (touchedFsPathsRef.current.get(doc.path) ?? 0) <= scanFsChangeSeq
        )
      }
      setIsScanning(true)

      const unsub = window.api.project.onDocsChunk((chunk: Doc[]) => {
        if (!isCurrentScan()) return
        const relevant = filterUntouchedScanDocs(chunk.filter((d) => d.projectId === pid))
        if (relevant.length > 0) appendDocs(relevant)
      })
      const cleanup = () => {
        if (cleanedUp) return
        cleanedUp = true
        unsub()
      }
      const workspaceId = opts?.workspaceId ?? projectWorkspaceId

      window.api.project
        .scanDocs(pid, opts?.force || workspaceId
          ? {
              ...(opts?.force ? { force: true } : {}),
              ...(workspaceId ? { workspaceId } : {}),
            }
          : undefined)
        .then((result) => {
          if (!isCurrentScan()) return
          const safeResult = filterUntouchedScanDocs(result)
          // IPC chunk 이벤트가 누락되거나 watcher가 아직 켜지지 않은 기존 워크스페이스에서도
          // 수동/자동 refresh 결과가 트리에 반영되도록 최종 scan result 자체를 한 번 더 병합한다.
          if (safeResult.length > 0) appendDocs(safeResult)
          if (fsChangeSeqRef.current !== scanFsChangeSeq) return
          // 스캔 결과(ground truth) 에 없는 path 는 stale — 일괄 제거.
          // result 에는 다른 projectId 가 섞이지 않으므로 path Set 으로 충분.
          const groundTruth = new Set(safeResult.map((d) => d.path))
          useAppStore.setState((state) => {
            const map = new Map(state.docsByProject)
            const bucket = map.get(pid)
            if (!bucket) return state
            const filtered = bucket.filter((d) => groundTruth.has(d.path))
            if (filtered.length === bucket.length) return state
            if (filtered.length > 0) map.set(pid, filtered)
            else map.delete(pid)
            const remaining: Doc[] = []
            for (const b of map.values()) for (const d of b) remaining.push(d)
            return { docs: remaining, docsByProject: map }
          })
          touchedFsPathsRef.current.clear()
          console.log(`[useDocs] ${pid}: ${result.length} docs`)
        })
        .catch((err) => {
          if (!isCurrentScan()) return
          console.error('문서 스캔 실패:', err)
        })
        .finally(() => {
          cleanup()
          if (isCurrentScan()) setIsScanning(false)
        })

      return () => {
        active = false
        cleanup()
      }
    },
    [appendDocs, projectWorkspaceId]
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      activeScanSeqRef.current += 1
    }
  }, [])

  // refreshKey 를 deps 에 포함시켜, 사용자 명시 새로고침(⌘R / Sidebar 버튼) 시
  // 현재 프로젝트의 docs 도 재스캔되도록 한다. scanDocs 자체가 cleanup-aware 라
  // 새 스캔 시작 전에 이전 onDocsChunk 구독이 정리됨.
  // FS-RT-1 — refreshKey > 0 (명시/자동 새로고침) 일 때만 force=true 전달해
  // main docsCache hit 으로 인한 stale 결과 차단. 첫 진입은 cache hit OK.
  const refreshKey = useAppStore((s) => s.refreshKey)
  useEffect(() => {
    if (!projectId) return
    const unsub = scanDocs(projectId, {
      ...(refreshKey > 0 ? { force: true } : {}),
      ...(projectWorkspaceId ? { workspaceId: projectWorkspaceId } : {}),
    })
    return unsub
  }, [projectId, projectWorkspaceId, scanDocs, refreshKey])

  useEffect(() => {
    const unsubscribe = window.api.fs.onChange((data: FsChangeEvent) => {
      // Viewable asset(md + 이미지)만 처리. 그 외 확장자는 watcher에서도 걸러지지만
      // 방어적으로 렌더러에서도 한 번 더 체크한다.
      if (!isViewable(data.path)) return
      const markTouched = () => {
        const nextSeq = fsChangeSeqRef.current + 1
        fsChangeSeqRef.current = nextSeq
        touchedFsPathsRef.current.set(data.path, nextSeq)
      }
      if (data.type === 'unlink') {
        markTouched()
        removeDoc(data.path)
      } else if (data.type === 'change') {
        const knownDoc = useAppStore.getState().docs.some((doc) => doc.path === data.path)
        if (!knownDoc) return
        markTouched()
        // watcher가 stat으로 size를 함께 보내는 경우 Doc.size도 갱신한다.
        // size가 undefined이면(stat 실패 등) 필드 자체를 빼 기존 값을 유지.
        const patch: Partial<Doc> = { mtime: data.mtime ?? Date.now() }
        if (data.size !== undefined) patch.size = data.size
        updateDoc(data.path, patch)
      } else if (data.type === 'add') {
        // FS-RT-1 — main 이 stat / projectId 매핑을 함께 실어 보낸다.
        // projectId / mtime / name 중 하나라도 없으면 Doc 객체를 안전하게 조립할 수 없으므로 무시
        // (다음 새로고침 또는 force scan 에서 정상 잡힘). main 이 invalidator 도 같이 발화하므로
        // 캐시는 이미 비어 있어 다음 scanDocs 가 fresh.
        if (!data.projectId || !data.name || data.mtime === undefined) return
        markTouched()
        const doc: Doc = {
          path: data.path,
          projectId: data.projectId,
          name: data.name,
          mtime: data.mtime,
        }
        if (data.size !== undefined) doc.size = data.size
        if (data.frontmatter !== undefined) doc.frontmatter = data.frontmatter
        appendDocs([doc])
      }
    })
    return unsubscribe
  }, [updateDoc, removeDoc, appendDocs])

  return { docs: filteredDocs, scanDocs, isScanning }
}
