import { create } from 'zustand'
import type { Annotation } from '../lib/annotation/types'

// 빈 결과 fallback. Selector 가 매 호출 새 `[]` 를 반환하면 Zustand 참조 불일치로
// "getSnapshot should be cached" 무한 루프. useDocs.ts EMPTY_DOCS 와 동일 패턴.
export const EMPTY_ANNOTATIONS: Annotation[] = Object.freeze([]) as unknown as Annotation[]

// v0.4 S7 — annotation 은 docPath 당 독립 집합. docPath 전환 시 set(); 같은 doc 내 편집은 add/remove.
// 전역 렌더러 store 와 분리 — C7 cachedFlat identity 전략과 섞이지 않도록 격리 (Plan §S7 선택지: "또는 zustand slice").
interface AnnotationState {
  annotationsByDoc: Map<string, Annotation[]>
  // 로드 중 doc 경로 set (중복 IPC 방지).
  loading: Set<string>
  // 저장 실패 doc 경로 (UI 토스트 트리거용).
  failedSaveDocs: Set<string>

  setAnnotations: (docPath: string, annotations: Annotation[]) => void
  addAnnotation: (docPath: string, annotation: Annotation) => void
  removeAnnotation: (docPath: string, annotationId: string) => void
  markOrphans: (docPath: string, orphanIds: Set<string>) => void
  setLoading: (docPath: string, loading: boolean) => void
  markSaveFailed: (docPath: string, failed: boolean) => void
  clearDoc: (docPath: string) => void
}

export const useAnnotationStore = create<AnnotationState>((set) => ({
  annotationsByDoc: new Map(),
  loading: new Set(),
  failedSaveDocs: new Set(),

  setAnnotations: (docPath, annotations) =>
    set((s) => {
      const next = new Map(s.annotationsByDoc)
      next.set(docPath, annotations)
      return { annotationsByDoc: next }
    }),

  addAnnotation: (docPath, annotation) =>
    set((s) => {
      const next = new Map(s.annotationsByDoc)
      const prev = next.get(docPath) ?? []
      next.set(docPath, [...prev, annotation])
      return { annotationsByDoc: next }
    }),

  removeAnnotation: (docPath, annotationId) =>
    set((s) => {
      const prev = s.annotationsByDoc.get(docPath)
      if (!prev) return {}
      const filtered = prev.filter((a) => a.id !== annotationId)
      if (filtered.length === prev.length) return {}
      const next = new Map(s.annotationsByDoc)
      next.set(docPath, filtered)
      return { annotationsByDoc: next }
    }),

  markOrphans: (docPath, orphanIds) =>
    set((s) => {
      const prev = s.annotationsByDoc.get(docPath)
      if (!prev) return {}
      let changed = false
      const patched = prev.map((a) => {
        const shouldBeOrphan = orphanIds.has(a.id)
        if (Boolean(a.orphan) === shouldBeOrphan) return a
        changed = true
        return { ...a, orphan: shouldBeOrphan }
      })
      if (!changed) return {}
      const next = new Map(s.annotationsByDoc)
      next.set(docPath, patched)
      return { annotationsByDoc: next }
    }),

  setLoading: (docPath, isLoading) =>
    set((s) => {
      const next = new Set(s.loading)
      if (isLoading) next.add(docPath)
      else next.delete(docPath)
      return { loading: next }
    }),

  markSaveFailed: (docPath, failed) =>
    set((s) => {
      const next = new Set(s.failedSaveDocs)
      if (failed) next.add(docPath)
      else next.delete(docPath)
      return { failedSaveDocs: next }
    }),

  clearDoc: (docPath) =>
    set((s) => {
      if (!s.annotationsByDoc.has(docPath)) return {}
      const next = new Map(s.annotationsByDoc)
      next.delete(docPath)
      return { annotationsByDoc: next }
    }),
}))
