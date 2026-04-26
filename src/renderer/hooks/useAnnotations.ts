import { useEffect, useState, useRef, useCallback, useMemo, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import {
  loadAnnotations,
  saveAnnotations,
} from '../lib/annotation/sidecar'
import {
  anchorToRange,
  isRangeWithin,
  createSelectorFromRange,
} from '../lib/annotation/anchor'
import {
  useAnnotationStore,
  EMPTY_ANNOTATIONS,
} from '../state/annotationStore'
import {
  DEFAULT_ANNOTATION_COLOR,
  type Annotation,
} from '../lib/annotation/types'
import { toast } from '../components/ui/Toast'

// CSS Custom Highlight name. globals.css ::highlight() 와 일치해야 한다.
const HIGHLIGHT_NAME = 'markwand-annotation-highlight'
// 사용자 1회 선택 가능 길이 — main zod schema (exact max 2000) 와 동일.
const MAX_EXACT_LENGTH = 2000

// CSS Custom Highlight API typings — Electron 33 / Chromium 130 지원.
// lib.dom 버전에 따라 CSS.highlights / Highlight 가 정의될 수도, 안 될 수도 있어
// 모든 접근을 narrow 한 Local 타입으로 캡슐화.
interface CSSHighlight {
  add(range: Range): void
  delete(range: Range): boolean
  clear(): void
}
interface HighlightConstructor {
  new (...ranges: Range[]): CSSHighlight
}
interface HighlightRegistry {
  set(name: string, highlight: CSSHighlight): void
  delete(name: string): boolean
}

function getHighlightAPI(): { Ctor: HighlightConstructor; registry: HighlightRegistry } | null {
  const w = window as unknown as { Highlight?: HighlightConstructor }
  const registry = (CSS as unknown as { highlights?: HighlightRegistry }).highlights
  if (!w.Highlight || !registry) return null
  return { Ctor: w.Highlight, registry }
}

export interface AnnotationToolbarState {
  visible: boolean
  // 'create' — 새 selection 위 (🖍 버튼). 'remove' — 기존 annotation 위 클릭 (✕ 버튼).
  mode: 'create' | 'remove' | null
  rect: { left: number; top: number; bottom: number; width: number } | null
  hitAnnotationId: string | null
}

const HIDDEN_TOOLBAR: AnnotationToolbarState = {
  visible: false,
  mode: null,
  rect: null,
  hitAnnotationId: null,
}

interface UseAnnotationsResult {
  annotations: Annotation[]
  toolbar: AnnotationToolbarState
  handleHighlight: () => void
  handleRemove: () => void
  dismissToolbar: () => void
  orphanCount: number
  saveFailed: boolean
  // SSH context 등으로 쓰기가 차단된 경우. UI 가 disabled tooltip 표시.
  disabled: boolean
}

/**
 * v0.4 S7 — 한 문서에 대한 annotation 라이프사이클 훅.
 * - docPath 변경 시 sidecar JSON 자동 로드.
 * - annotations 변경 또는 content 재렌더 시 anchor 재매칭 → CSS Custom Highlight 등록.
 * - selectionchange / click 으로 toolbar 상태 갱신 (create / remove).
 * - SSH context 또는 SSH workspace 의 문서는 disabled (UI 차단). 로드도 시도하지 않음.
 *
 * Plan §S7 Risk Map "S7 CSS Highlight pointer-events 제한" 대응:
 * Highlight 영역은 pointer-events 를 받지 않으므로 click → caretRangeFromPoint 역조회.
 */
export function useAnnotations(
  docPath: string | null,
  isSshContext: boolean,
  containerRef: RefObject<HTMLElement | null>,
  contentVersion: unknown
): UseAnnotationsResult {
  const { t } = useTranslation()
  const annotations = useAnnotationStore((s) =>
    docPath ? s.annotationsByDoc.get(docPath) ?? EMPTY_ANNOTATIONS : EMPTY_ANNOTATIONS
  )
  const setAnnotations = useAnnotationStore((s) => s.setAnnotations)
  const addAnnotation = useAnnotationStore((s) => s.addAnnotation)
  const removeAnnotation = useAnnotationStore((s) => s.removeAnnotation)
  const markOrphans = useAnnotationStore((s) => s.markOrphans)
  const markSaveFailed = useAnnotationStore((s) => s.markSaveFailed)
  const saveFailed = useAnnotationStore((s) =>
    docPath ? s.failedSaveDocs.has(docPath) : false
  )

  const [activeRanges, setActiveRanges] = useState<Map<string, Range>>(new Map())
  const [toolbar, setToolbar] = useState<AnnotationToolbarState>(HIDDEN_TOOLBAR)
  // 마지막 유효 selection Range — toolbar 버튼에 focus 이동 시 selection 이 collapse 되어도
  // 이 ref 로 보존된 Range 를 사용해 anchor 생성 (Evaluator M-3 보강).
  const lastSelectionRangeRef = useRef<Range | null>(null)
  // 이전 cycle 의 docPath. 변경 직후 첫 cycle 은 reanchor skip — content prop 이 stale 한 이전 doc 의 것일 수 있음.
  const prevDocPathRef = useRef<string | null>(null)
  // mousedown ~ mouseup 사이 drag 진행 중 표시. 진행 중 selectionchange 발화는 toolbar 갱신을 trigger 하지 않는다.
  const isDraggingRef = useRef(false)

  // 1) doc 전환 시 sidecar 로드 (SSH 면 빈 상태로 두고 IPC 호출 안 함).
  useEffect(() => {
    setActiveRanges(new Map())
    setToolbar(HIDDEN_TOOLBAR)
    if (!docPath || isSshContext) return
    let cancelled = false
    loadAnnotations(docPath)
      .then((loaded) => {
        if (cancelled) return
        setAnnotations(docPath, loaded)
      })
      .catch((err) => {
        if (cancelled) return
        // sidecar 로드 실패는 빈 배열로 fallback (저장은 가능). UI 는 saveFailed 와 별개로 무소음.
        process.env['NODE_ENV'] !== 'production' &&
          console.warn('[annotations] load failed', err)
        setAnnotations(docPath, [])
      })
    return () => {
      cancelled = true
    }
  }, [docPath, isSshContext, setAnnotations])

  // 2) annotations 또는 content 변경 시 anchor 재매칭 + Highlight 등록.
  useEffect(() => {
    const root = containerRef.current
    if (!root || !docPath) return
    const api = getHighlightAPI()

    // 이슈 3 (사용자 보고 2026-04-26): ProjectView.loadDoc 가 setSelectedDoc(즉시) →
    //   await readDoc → setDocContent 순서라 basePath 만 먼저 바뀌고 content 는 ms 늦게 도착.
    //   그 사이에 이전 doc 의 store annotations 가 새 basePath × stale content 로 anchor 매칭돼
    //   동일 단어가 잘못된 위치에 잠깐 highlight 됨. docPath 변경 직후 첫 cycle 은
    //   매칭 skip + registry.delete — content 가 도착해 contentVersion 이 갱신되면 두 번째 cycle 에서 매칭.
    if (prevDocPathRef.current !== docPath) {
      prevDocPathRef.current = docPath
      api?.registry.delete(HIGHLIGHT_NAME)
      setActiveRanges(new Map())
      return () => {
        api?.registry.delete(HIGHLIGHT_NAME)
      }
    }

    const matched = new Map<string, Range>()
    const orphanIds = new Set<string>()
    for (const a of annotations) {
      const range = anchorToRange(root, a)
      if (range) matched.set(a.id, range)
      else orphanIds.add(a.id)
    }
    setActiveRanges(matched)

    // orphan 플래그 동기화 (Plan DoD: orphan 발생 시 사이드바 뱃지).
    const prevOrphanIds = new Set(annotations.filter((a) => a.orphan).map((a) => a.id))
    let mismatch = orphanIds.size !== prevOrphanIds.size
    if (!mismatch) {
      for (const id of orphanIds) {
        if (!prevOrphanIds.has(id)) {
          mismatch = true
          break
        }
      }
    }
    if (mismatch) markOrphans(docPath, orphanIds)

    if (api) {
      if (matched.size > 0) {
        try {
          const hl = new api.Ctor(...matched.values())
          api.registry.set(HIGHLIGHT_NAME, hl)
        } catch {
          api.registry.delete(HIGHLIGHT_NAME)
        }
      } else {
        api.registry.delete(HIGHLIGHT_NAME)
      }
    }
    // m-2: deps 변경 또는 unmount 시 즉시 highlight 정리 (doc 전환 ghost 방지).
    return () => {
      const api2 = getHighlightAPI()
      api2?.registry.delete(HIGHLIGHT_NAME)
    }
  }, [annotations, contentVersion, containerRef, docPath, markOrphans])

  // 3) unmount 시 highlight 해제 (다른 문서로 이동·뷰어 unmount 모두).
  useEffect(() => {
    return () => {
      const api = getHighlightAPI()
      api?.registry.delete(HIGHLIGHT_NAME)
    }
  }, [])

  // 4) selection 결정 → create-mode toolbar.
  //    이슈 1 (사용자 보고 2026-04-26 v2): selectionchange 가 native drag 진행 중에도 매 픽셀 발화하므로
  //    drag 도중에 toolbar 가 일찍 따라온다. 해결: mousedown 시점 hide + isDragging=true 로 잠그고,
  //    selectionchange 는 isDragging 동안 무시, mouseup(또는 keyboard selection 후 keyup) 시점에만 한 번 컴퓨트.
  useEffect(() => {
    const root = containerRef.current
    if (!root || !docPath) return
    let rafId = 0
    const compute = () => {
      rafId = 0
      // drag 진행 중은 toolbar 표시 X — mouseup 후에만 결정.
      if (isDraggingRef.current) return
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setToolbar((prev) => (prev.mode === 'create' ? HIDDEN_TOOLBAR : prev))
        return
      }
      const range = sel.getRangeAt(0)
      if (!isRangeWithin(root, range)) {
        setToolbar((prev) => (prev.mode === 'create' ? HIDDEN_TOOLBAR : prev))
        return
      }
      // 의미 있는 텍스트 (공백 제거 후 1글자 이상) — 미세 mouse 흔들림으로 생긴 1바이트 selection 차단.
      if (!sel.toString().trim()) {
        setToolbar((prev) => (prev.mode === 'create' ? HIDDEN_TOOLBAR : prev))
        return
      }
      const rect = range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return
      lastSelectionRangeRef.current = range.cloneRange()
      setToolbar({
        visible: true,
        mode: 'create',
        rect: { left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width },
        hitAnnotationId: null,
      })
    }
    const scheduleCompute = () => {
      if (rafId) return
      rafId = requestAnimationFrame(compute)
    }
    const onSelectionChange = () => {
      // drag 중엔 selectionchange 발화해도 컴퓨트 안 함. mouseup 에서 마지막 한 번만 결정.
      if (isDraggingRef.current) return
      scheduleCompute()
    }
    const isToolbarTarget = (target: EventTarget | null): boolean => {
      const el = target as Element | null
      return Boolean(el?.closest?.('[data-annotation-toolbar]'))
    }
    const onMouseDown = (e: MouseEvent) => {
      if (isToolbarTarget(e.target)) return
      isDraggingRef.current = true
      setToolbar(HIDDEN_TOOLBAR)
      lastSelectionRangeRef.current = null
    }
    const onMouseUp = (e: MouseEvent) => {
      if (isToolbarTarget(e.target)) return
      isDraggingRef.current = false
      // mouseup 직후 native 가 selection 을 확정 — 1 frame 뒤 컴퓨트.
      scheduleCompute()
    }
    // 키보드 selection (Shift+Arrow / Cmd+A) 도 지원 — keyup 시점에 한 번 컴퓨트.
    const onKeyUp = (e: KeyboardEvent) => {
      if (isDraggingRef.current) return
      // 모든 keyup 이 selection 변화는 아니지만, throttle 로 비용 최소화.
      if (e.shiftKey || e.metaKey || e.ctrlKey || e.key === 'a' || e.key === 'A') {
        scheduleCompute()
      }
    }
    document.addEventListener('selectionchange', onSelectionChange)
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('mouseup', onMouseUp, true)
    document.addEventListener('keyup', onKeyUp, true)
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange)
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('mouseup', onMouseUp, true)
      document.removeEventListener('keyup', onKeyUp, true)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [containerRef, docPath])

  // 5) click 이벤트 → 기존 annotation hit 시 remove-mode toolbar.
  //    이슈 2 (사용자 보고 2026-04-26): toolbar ✕ button click 이 root.click 으로 bubble 되어
  //    caretRangeFromPoint(toolbar 위치) → hit 없음 → setToolbar(HIDDEN) → button onClick 시점에
  //    hitAnnotationId=null → handleRemove early return. toolbar 자체 click 은 명시 제외 + button 측 stopPropagation.
  useEffect(() => {
    const root = containerRef.current
    if (!root || !docPath || isSshContext) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      // toolbar 자체 click 은 처리 X — button onClick 핸들러에 위임.
      if (target?.closest?.('[data-annotation-toolbar]')) return
      // 새 선택 진행 중이면 selectionchange 핸들러가 처리. 우회.
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed) return
      const doc = root.ownerDocument as Document & {
        caretRangeFromPoint?: (x: number, y: number) => Range | null
      }
      const caret = doc.caretRangeFromPoint?.(e.clientX, e.clientY) ?? null
      if (!caret) return
      let hitId: string | null = null
      let hitRange: Range | null = null
      for (const [id, r] of activeRanges) {
        try {
          const cmp = r.comparePoint(caret.startContainer, caret.startOffset)
          if (cmp === 0) {
            hitId = id
            hitRange = r
            break
          }
        } catch {
          // comparePoint 실패(다른 트리) — skip
        }
      }
      if (hitId && hitRange) {
        const rect = hitRange.getBoundingClientRect()
        setToolbar({
          visible: true,
          mode: 'remove',
          rect: { left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width },
          hitAnnotationId: hitId,
        })
      } else {
        setToolbar((prev) => (prev.mode === 'remove' ? HIDDEN_TOOLBAR : prev))
      }
    }
    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [activeRanges, containerRef, docPath, isSshContext])

  // 액션 헬퍼: 저장 + 실패 시 toast (Evaluator M-1).
  const persist = useCallback(
    (docPathArg: string) => {
      const next = useAnnotationStore.getState().annotationsByDoc.get(docPathArg) ?? []
      saveAnnotations(docPathArg, next)
        .then(() => markSaveFailed(docPathArg, false))
        .catch((err) => {
          process.env['NODE_ENV'] !== 'production' &&
            console.warn('[annotations] save failed', err)
          markSaveFailed(docPathArg, true)
          toast.error(t('annotation.saveFailed'))
        })
    },
    [markSaveFailed, t]
  )

  // 6) 액션: 하이라이트 추가
  const handleHighlight = useCallback(() => {
    if (!docPath || isSshContext) return
    const root = containerRef.current
    if (!root) return
    // button focus 로 selection 이 collapse 됐을 수 있으므로 lastSelectionRangeRef 우선.
    const sel = window.getSelection()
    let range: Range | null = null
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      range = sel.getRangeAt(0)
    } else if (lastSelectionRangeRef.current) {
      range = lastSelectionRangeRef.current
    }
    if (!range || !isRangeWithin(root, range)) return
    const created = createSelectorFromRange(root, range)
    if (!created) return
    if (created.selector.exact.length > MAX_EXACT_LENGTH) {
      toast.info(t('annotation.tooLong'))
      return
    }
    const annotation: Annotation = {
      id: crypto.randomUUID(),
      selector: created.selector,
      positionFallback: created.positionFallback,
      color: DEFAULT_ANNOTATION_COLOR,
      createdAt: new Date().toISOString(),
    }
    addAnnotation(docPath, annotation)
    sel?.removeAllRanges()
    lastSelectionRangeRef.current = null
    setToolbar(HIDDEN_TOOLBAR)
    // store 가 즉시 갱신됨 → effect 가 reanchor + Highlight 등록. 저장은 비동기.
    persist(docPath)
  }, [docPath, isSshContext, containerRef, addAnnotation, persist, t])

  // 7) 액션: 하이라이트 제거
  const handleRemove = useCallback(() => {
    if (!docPath || isSshContext) return
    const id = toolbar.hitAnnotationId
    if (!id) return
    removeAnnotation(docPath, id)
    setToolbar(HIDDEN_TOOLBAR)
    persist(docPath)
  }, [docPath, isSshContext, toolbar.hitAnnotationId, removeAnnotation, persist])

  const dismissToolbar = useCallback(() => {
    setToolbar(HIDDEN_TOOLBAR)
    lastSelectionRangeRef.current = null
    window.getSelection()?.removeAllRanges()
  }, [])

  const orphanCount = useMemo(
    () => annotations.filter((a) => a.orphan).length,
    [annotations]
  )

  return {
    annotations,
    toolbar,
    handleHighlight,
    handleRemove,
    dismissToolbar,
    orphanCount,
    saveFailed,
    disabled: isSshContext,
  }
}
