import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { FileTree } from '../components/FileTree'
import { MarkdownViewer } from '../components/MarkdownViewer'
import { ImageViewer } from '../components/ImageViewer'
import { ClaudeButton } from '../components/ClaudeButton'
import { FilterBar } from '../components/FilterBar'
import { TableOfContents } from '../components/TableOfContents'
import { DriftPanel } from '../components/DriftPanel'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { EmptyState, IconButton } from '../components/ui'
import { useDocs } from '../hooks/useDocs'
import { useAppStore } from '../state/store'
import { createFindController, type FindController } from '../lib/findInContainer'
import { classifyAsset } from '../../lib/viewable'
import { applyMetaFilter } from '../utils/docFilters'
import type { Doc } from '../../../src/preload/types'
import type { Heading } from '../components/TableOfContents'

interface ProjectViewProps {
  projectId: string
  projectRoot: string
  projectName: string
  initialDocPath?: string
}

const TocIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d="M2 2.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11A.5.5 0 0 1 2 2.5zm0 4a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11A.5.5 0 0 1 2 6.5zm0 4a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6A.5.5 0 0 1 2 10.5z"/>
  </svg>
)

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.099zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
  </svg>
)

const ChevronLeftIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
  </svg>
)

const ChevronRightIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
  </svg>
)

export function ProjectView({ projectId, projectRoot, projectName, initialDocPath }: ProjectViewProps) {
  const { t } = useTranslation()
  const { docs, isScanning } = useDocs(projectId)
  const metaFilter = useAppStore((s) => s.metaFilter)
  // FS9-B — 현재 프로젝트가 속한 workspace id. SSH 이면 MarkdownViewer 가 이미지 IPC 경유.
  const currentWorkspaceId = useAppStore((s) => {
    const p = s.projects.find((x) => x.id === projectId)
    return p?.workspaceId ?? null
  })

  const isFilterActive =
    metaFilter.tags.length > 0 ||
    metaFilter.statuses.length > 0 ||
    metaFilter.sources.length > 0 ||
    metaFilter.updatedRange !== 'all'

  const filteredDocs = useMemo(
    () => (isFilterActive ? applyMetaFilter(docs, metaFilter) : docs),
    [docs, metaFilter, isFilterActive]
  )

  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null)
  const [docContent, setDocContent] = useState<string>('')
  const [initialExpanded, setInitialExpanded] = useState<string[]>([])
  const [headings, setHeadings] = useState<Heading[]>([])
  const [showToc, setShowToc] = useState(false)
  const [showFind, setShowFind] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findResult, setFindResult] = useState<{ active: number; total: number } | null>(null)
  const findInputRef = useRef<HTMLInputElement | null>(null)
  const findDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const findControllerRef = useRef<FindController | null>(null)
  // F2: 마크다운 스크롤 컨테이너 ref — TOC scrollIntoView 타깃
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  // store 액션 (F3/F4)
  const pendingDocOpen = useAppStore((s) => s.pendingDocOpen)
  const setPendingDocOpen = useAppStore((s) => s.setPendingDocOpen)
  const lastViewedDocs = useAppStore((s) => s.lastViewedDocs)
  const setLastViewedDoc = useAppStore((s) => s.setLastViewedDoc)

  // treeExpanded 복원
  useEffect(() => {
    window.api.prefs.get('treeExpanded').then((stored) => {
      const map = (stored as Record<string, string[]> | null) ?? {}
      setInitialExpanded(map[projectId] ?? [])
    })
  }, [projectId])

  // 사이드바 폭 (리사이즈 가능). 180~600 clamp, 기본 260.
  // 긴 파일명(날짜 prefix + 제목)이 잘리지 않도록 사용자가 드래그해 조절.
  // a11y 제약: 현재 키보드 리사이즈·aria-valuenow/min/max 미지원 (Known Gap).
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const resizeStateRef = useRef<{ startX: number; startWidth: number; latest: number } | null>(null)
  const rafRef = useRef<number | null>(null)
  // 언마운트 플래그 — 드래그 중 프로젝트 전환(ProjectView key remount)으로 인한
  // 좀비 listener 가 setSidebarWidth 를 호출하지 못하게 한다.
  // StrictMode dev 재마운트(mount→cleanup→mount)에서는 cleanup 이 플래그를 true 로 남기므로
  // 재마운트 시 effect 가 false 로 리셋해 정상 동작하게 한다.
  const unmountedRef = useRef(false)
  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
    }
  }, [])

  // prefs 복원. 이미 드래그 중이면 응답 무시 — IPC race 로 드래그 중인 폭이 튀어오르지 않게.
  useEffect(() => {
    window.api.prefs.get('sidebarWidth').then((v) => {
      if (unmountedRef.current || resizeStateRef.current) return
      if (typeof v === 'number' && v >= 180 && v <= 600) setSidebarWidth(v)
    })
  }, [])

  // 드래그 핸들 — pointerdown 으로 시작, setPointerCapture + window pointermove/up 으로 추적.
  // setPointerCapture: 커서가 핸들 DOM 밖으로 벗어나도 이벤트가 계속 이 엘리먼트로 전달됨 →
  // 빠른 드래그 + 핸들 이탈 시 pointerup 을 놓치는 엣지 버그 방지.
  // rAF 로 setState throttle 해 60fps 이상 업데이트에서도 렌더 루프 안정.
  // pointercancel(ESC·OS 포커스 전환 등) 이면 시작 폭으로 원복 + 영속 안 함 (네이티브 앱 관례).
  const handleSidebarResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const target = e.currentTarget
    const pointerId = e.pointerId
    try {
      target.setPointerCapture(pointerId)
    } catch {
      // setPointerCapture 실패는 UX 치명 아님 — window listener 로도 기본 동작.
    }
    resizeStateRef.current = { startX: e.clientX, startWidth: sidebarWidth, latest: sidebarWidth }
    const onMove = (ev: PointerEvent) => {
      if (unmountedRef.current) return
      const s = resizeStateRef.current
      if (!s) return
      const next = Math.max(180, Math.min(600, s.startWidth + (ev.clientX - s.startX)))
      s.latest = next
      if (rafRef.current != null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        if (unmountedRef.current) return
        // s.latest 를 참조해 rAF 사이 누적된 move 의 마지막 값을 반영 (클로저 stale 방지).
        const ss = resizeStateRef.current
        if (ss) setSidebarWidth(ss.latest)
      })
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      try {
        target.releasePointerCapture(pointerId)
      } catch {
        // 이미 해제된 경우 무시.
      }
    }
    const onEnd = (ev: PointerEvent) => {
      cleanup()
      const s = resizeStateRef.current
      resizeStateRef.current = null
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (unmountedRef.current || !s) return
      // 드래그 중 선택된 텍스트가 있으면 해제 (splitter 근처 텍스트 선택 아티팩트 방지).
      window.getSelection()?.removeAllRanges()
      if (ev.type === 'pointercancel') {
        // 의도적 중단 — 시작 폭으로 복원, prefs 영속 생략.
        setSidebarWidth(s.startWidth)
        return
      }
      if (s.latest !== s.startWidth) {
        setSidebarWidth(s.latest)
        window.api.prefs.set('sidebarWidth', s.latest).catch(() => {
          // prefs 영속 실패는 UX 치명 아님 — 다음 세션에서 기본값 260 으로 복귀.
        })
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
  }, [sidebarWidth])

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const loadDoc = useCallback(async (doc: Doc) => {
    setSelectedDoc(doc)
    setHeadings([])
    // F4: 마지막 본 문서 갱신
    setLastViewedDoc(projectId, doc.path)

    // 이미지는 readDoc(utf-8)을 호출하지 않는다 — app://로 <img>가 직접 로드한다.
    // docContent는 MarkdownViewer 전용이므로 빈 문자열로 초기화.
    if (classifyAsset(doc.path) === 'image') {
      setDocContent('')
      return
    }

    try {
      const result = await window.api.fs.readDoc(doc.path)
      setDocContent(result.content)
    } catch (err) {
      console.error('문서 읽기 실패:', err)
      setDocContent(t('projectView.docReadFailed'))
    }
  }, [projectId, setLastViewedDoc])

  // F3: pendingDocOpen 처리 — docs 로드 후 한 번만 실행
  useEffect(() => {
    if (!pendingDocOpen || pendingDocOpen.projectId !== projectId || docs.length === 0) return
    const doc = docs.find((d) => d.path === pendingDocOpen.path)
    if (doc) {
      loadDoc(doc)
      setPendingDocOpen(null)
    }
  }, [pendingDocOpen, projectId, docs, loadDoc, setPendingDocOpen])

  // F4: mount 시 lastViewedDoc 복원 (pendingDocOpen이 없을 때만)
  useEffect(() => {
    if (docs.length === 0) return
    // pendingDocOpen이 이 프로젝트 대상이면 pendingDocOpen이 우선
    if (pendingDocOpen?.projectId === projectId) return
    const savedPath = lastViewedDocs[projectId]
    if (!savedPath) return
    // 이미 선택된 문서가 있으면 복원 불필요
    if (selectedDoc) return
    const doc = docs.find((d) => d.path === savedPath)
    if (doc) loadDoc(doc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, projectId])

  // initialDocPath가 있으면 해당 문서 자동 선택 (prop 경로, 하위 호환)
  useEffect(() => {
    if (!initialDocPath || docs.length === 0) return
    const doc = docs.find((d) => d.path === initialDocPath)
    if (doc) loadDoc(doc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDocPath, docs])

  // 커스텀 find controller — 스크롤 컨테이너 DOM 안에서 TreeWalker + CSS Highlight API로 검색.
  // docContent가 바뀌면 MarkdownViewer가 새 DOM을 렌더하므로 controller도 재생성한다.
  // onChange 콜백으로 ProjectView의 findResult state에 진행 상황을 반영.
  // 문서 전환 시 기존 쿼리가 살아있으면 자동 재검색 (VSCode/Finder 유사 UX).
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    // 문서 전환 직전에 살아있는 debounce 타이머를 제거해 새 controller에 이전 debounce가 섞이지 않게 한다.
    if (findDebounceRef.current) {
      clearTimeout(findDebounceRef.current)
      findDebounceRef.current = null
    }
    const controller = createFindController(container)
    findControllerRef.current = controller
    const off = controller.onChange((s) => {
      setFindResult({ active: s.active, total: s.total })
    })
    let retimer: ReturnType<typeof setTimeout> | null = null
    if (findQuery.trim()) {
      // React commit 직후 실행되지만 mermaid/코드 블록이 추가 렌더될 수 있어 한 틱 여유
      retimer = setTimeout(() => controller.update(findQuery), 50)
    }
    return () => {
      if (retimer) clearTimeout(retimer)
      off()
      controller.destroy()
      findControllerRef.current = null
    }
    // findQuery 변경은 handleFindChange가 별도로 controller.update를 호출하므로 여기선 의존성 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docContent])

  // 검색 toolbar 열릴 때 input focus
  useEffect(() => {
    if (showFind) {
      const id = setTimeout(() => findInputRef.current?.focus(), 0)
      return () => clearTimeout(id)
    }
  }, [showFind])

  // 이미지 문서 선택 시 find/TOC state를 정리해 토글 불일치를 막는다.
  useEffect(() => {
    if (selectedDoc && classifyAsset(selectedDoc.path) === 'image') {
      setShowFind(false)
      setFindQuery('')
      setFindResult(null)
      findControllerRef.current?.clear()
      setHeadings([])
    }
  }, [selectedDoc])

  // cmd+F 단축키로 검색 열기 — md 문서일 때만. 이미지 뷰에서는 검색 대상 텍스트 없음.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        if (selectedDoc && classifyAsset(selectedDoc.path) !== 'md') return
        e.preventDefault()
        setShowFind((prev) => !prev)
      }
      if (e.key === 'Escape' && showFind) {
        setShowFind(false)
        setFindQuery('')
        setFindResult(null)
        findControllerRef.current?.clear()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showFind, selectedDoc])

  const handleDocNavigate = useCallback(async (absPath: string) => {
    // MarkdownViewer의 내부 링크 내비게이션은 `.md` 만 이 콜백을 호출하도록 설계돼 있으나,
    // 방어적으로 이미지 경로가 들어오면 readDoc 스킵하고 뷰어 전환만 수행.
    if (classifyAsset(absPath) === 'image') {
      const fakeDoc: Doc = {
        path: absPath,
        projectId,
        name: absPath.split('/').pop() ?? absPath,
        mtime: Date.now(),
      }
      setSelectedDoc(fakeDoc)
      setDocContent('')
      setLastViewedDoc(projectId, absPath)
      return
    }
    try {
      const result = await window.api.fs.readDoc(absPath)
      const fakeDoc: Doc = {
        path: absPath,
        projectId,
        name: absPath.split('/').pop() ?? absPath,
        mtime: result.mtime,
        frontmatter: result.frontmatter,
      }
      setSelectedDoc(fakeDoc)
      setDocContent(result.content)
      setLastViewedDoc(projectId, absPath)
    } catch (err) {
      console.error('내부 링크 이동 실패:', err)
    }
  }, [projectId, setLastViewedDoc])

  const handleExpandChange = useCallback(async (expanded: string[]) => {
    const stored = await window.api.prefs.get('treeExpanded')
    const map = (stored as Record<string, string[]> | null) ?? {}
    await window.api.prefs.set('treeExpanded', { ...map, [projectId]: expanded })
  }, [projectId])

  const handleFindChange = useCallback((value: string) => {
    setFindQuery(value)
    if (findDebounceRef.current) clearTimeout(findDebounceRef.current)
    if (!value.trim()) {
      setFindResult(null)
      findControllerRef.current?.clear()
      return
    }
    // 타이핑 중 매 keystroke마다 전체 문서 walk는 수 ms라 충분히 빠르나,
    // 한국어 IME 조합(ㅂ→배→배포) 중간 결과로 하이라이트가 깜박이지 않도록 짧은 debounce 유지.
    findDebounceRef.current = setTimeout(() => {
      findControllerRef.current?.update(value)
    }, 120)
  }, [])

  useEffect(() => {
    return () => {
      if (findDebounceRef.current) clearTimeout(findDebounceRef.current)
    }
  }, [])

  const handleFindNext = useCallback(() => {
    findControllerRef.current?.next()
  }, [])

  const handleFindPrev = useCallback(() => {
    findControllerRef.current?.prev()
  }, [])

  const handleCloseFind = useCallback(() => {
    setShowFind(false)
    setFindQuery('')
    setFindResult(null)
    findControllerRef.current?.clear()
  }, [])

  // DriftPanel 각 ref 에서 "위치로 이동" 누르면 뷰어에서 해당 raw 문자열을 find → 하이라이트·스크롤.
  const handleJumpToRef = useCallback((raw: string) => {
    setShowFind(true)
    setFindQuery(raw)
    // findController 는 content 렌더 후 생성됨. 이미 있으면 즉시 update, 없으면 show 후 effect 가 create 할 때까지 대기 없이 가벼운 재시도.
    const tryUpdate = () => {
      const c = findControllerRef.current
      if (c) {
        c.update(raw)
      }
    }
    tryUpdate()
    // 검색바가 이제 막 떴다면 controller 가 아직 없을 수 있어 다음 프레임에 재시도.
    requestAnimationFrame(tryUpdate)
  }, [])

  // F2: TOC heading 클릭 → scroll 컨테이너 내부에서 스크롤
  // 1순위 id 매칭, 실패 시 heading 텍스트 기반 매칭으로 fallback (custom component 실행 실패/
  // rehype-sanitize 변조/id 미부착 등 모든 엣지에 대응).
  const handleTocClick = useCallback((id: string) => {
    const container = scrollContainerRef.current
    if (!container) return
    const escaped = CSS.escape(id)
    const prefixed = CSS.escape(`user-content-${id}`)
    let el: HTMLElement | null =
      container.querySelector<HTMLElement>(`#${escaped}`) ??
      container.querySelector<HTMLElement>(`#${prefixed}`) ??
      Array.from(container.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'))
        .find((h) => h.id === id || h.id === `user-content-${id}`) ?? null

    // id 매칭 실패 시 텍스트 기반 fallback — headings state에서 id의 원본 text를 찾고
    // DOM heading들을 순회해 textContent와 비교한다.
    if (!el) {
      const target = headings.find((h) => h.id === id)
      if (target) {
        const normalized = target.text.trim().toLowerCase()
        el = Array.from(container.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'))
          .find((h) => (h.textContent ?? '').trim().toLowerCase() === normalized) ?? null
      }
    }

    if (!el) {
      console.warn('[TOC] heading not found for id:', id,
        '— DOM headings:',
        Array.from(container.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'))
          .map((h) => ({ tag: h.tagName, id: h.id, text: (h.textContent ?? '').slice(0, 40) }))
      )
      return
    }
    const containerTop = container.getBoundingClientRect().top
    const elTop = el.getBoundingClientRect().top
    const offset = elTop - containerTop + container.scrollTop - 16
    container.scrollTo({ top: offset, behavior: 'smooth' })
  }, [headings])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* FilterBar */}
      <FilterBar docs={docs} />
      {/* 검색 toolbar */}
      {showFind && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-2)',
            padding: 'var(--sp-2) var(--sp-4)',
            background: 'var(--bg-elev)',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <input
            ref={findInputRef}
            type="search"
            value={findQuery}
            onChange={(e) => handleFindChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.shiftKey ? handleFindPrev() : handleFindNext()
              }
              if (e.key === 'Escape') handleCloseFind()
            }}
            placeholder={t('projectView.searchPlaceholder')}
            aria-label={t('projectView.findInDoc')}
            style={{
              flex: 1,
              maxWidth: '280px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)',
              color: 'var(--text)',
              fontSize: 'var(--fs-sm)',
              padding: 'var(--sp-1) var(--sp-2)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          {findResult && (
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {findResult.total > 0 ? `${findResult.active} / ${findResult.total}` : t('projectView.findNoResults')}
            </span>
          )}
          <IconButton aria-label={t('projectView.findPrev')} size="sm" onClick={handleFindPrev} disabled={!findQuery.trim()}>
            <ChevronLeftIcon />
          </IconButton>
          <IconButton aria-label={t('projectView.findNext')} size="sm" onClick={handleFindNext} disabled={!findQuery.trim()}>
            <ChevronRightIcon />
          </IconButton>
          <IconButton aria-label={t('projectView.findClose')} size="sm" onClick={handleCloseFind}>
            ✕
          </IconButton>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* F1: 좌측 파일 트리 — flex column + minHeight:0 체인 완전 보장 */}
        <div
          style={{
            width: `${sidebarWidth}px`,
            flexShrink: 0,
            borderRight: '1px solid var(--border)',
            background: 'var(--bg-elev)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minHeight: 0,
          }}
        >
          <div
            style={{
              padding: 'var(--sp-3) var(--sp-3) var(--sp-2)',
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--sp-2)',
            }}
          >
            <span
              style={{
                fontSize: 'var(--fs-xs)',
                fontWeight: 'var(--fw-semibold)',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {projectName}
            </span>
            <ClaudeButton projectDir={projectRoot} />
          </div>
          {/* F1: flex:1 + minHeight:0 — FileTree가 남은 공간 전체 사용 */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* FS9-B — 원격 스캔 중 빈 트리가 "버그처럼 보이는" 문제 해소. 로딩 중 & 아직 청크 미도착 시에만 표시. */}
            {isScanning && filteredDocs.length === 0 ? (
              <div
                role="status"
                aria-live="polite"
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--sp-2)',
                  color: 'var(--text-muted)',
                  fontSize: 'var(--fs-sm)',
                  padding: 'var(--sp-4)',
                  textAlign: 'center',
                }}
              >
                <span className="ui-spinner" aria-hidden="true" />
                <span>{t('loading.filesLoading')}</span>
                <span style={{ fontSize: 'var(--fs-xs)' }}>{t('loading.filesLoadingRemote')}</span>
              </div>
            ) : (
              <FileTree
                key={projectId}
                projectId={projectId}
                rootPath={projectRoot}
                docs={filteredDocs}
                onSelect={loadDoc}
                initialExpanded={initialExpanded}
                onExpandChange={handleExpandChange}
              />
            )}
          </div>
        </div>

        {/* 사이드바 리사이즈 핸들 — 드래그로 좌측 트리 폭 조절. 180~600px clamp.
            hit-box 는 6px, 시각 표시는 hover 시 2px accent 선. flexShrink:0 필수. */}
        <div
          className="sidebar-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label={t('projectView.sidebarResize')}
          onPointerDown={handleSidebarResizeStart}
          style={{
            width: '6px',
            flexShrink: 0,
            cursor: 'col-resize',
            background: 'transparent',
            position: 'relative',
            userSelect: 'none',
            touchAction: 'none',
          }}
        >
          <div
            className="sidebar-resize-indicator"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: '2px',
              width: '2px',
              background: 'transparent',
              transition: 'background 0.15s ease',
              pointerEvents: 'none',
            }}
          />
        </div>

        {/* F2: 중앙 마크다운 뷰어 — ref 부착 */}
        <div
          ref={scrollContainerRef}
          style={{ flex: 1, overflow: 'auto', padding: 'var(--sp-6) var(--sp-8)', position: 'relative' }}
        >
          {/* 우상단 아이콘 버튼 그룹 — md 문서일 때만 검색·TOC 노출 */}
          {selectedDoc && classifyAsset(selectedDoc.path) === 'md' && (
            <div
              style={{
                position: 'sticky',
                top: 0,
                float: 'right',
                display: 'flex',
                gap: 'var(--sp-1)',
                marginBottom: 'var(--sp-2)',
                zIndex: 'var(--z-sticky)',
              }}
            >
              <IconButton
                aria-label={t('projectView.findInDoc')}
                aria-pressed={showFind}
                size="sm"
                variant={showFind ? 'primary' : 'ghost'}
                onClick={() => setShowFind((p) => !p)}
              >
                <SearchIcon />
              </IconButton>
              <IconButton
                aria-label={t('projectView.tocToggle')}
                aria-pressed={showToc}
                size="sm"
                variant={showToc ? 'primary' : 'ghost'}
                onClick={() => setShowToc((p) => !p)}
              >
                <TocIcon />
              </IconButton>
            </div>
          )}
          {selectedDoc ? (
            classifyAsset(selectedDoc.path) === 'image' ? (
              <ErrorBoundary resetKey={selectedDoc.path}>
                <ImageViewer
                  path={selectedDoc.path}
                  name={selectedDoc.name}
                  size={selectedDoc.size}
                  workspaceId={currentWorkspaceId}
                />
              </ErrorBoundary>
            ) : (
              <ErrorBoundary resetKey={selectedDoc.path}>
                <ErrorBoundary resetKey={selectedDoc.path}>
                  <DriftPanel
                    docPath={selectedDoc.path}
                    projectRoot={projectRoot}
                    onJumpToRef={handleJumpToRef}
                  />
                </ErrorBoundary>
                <MarkdownViewer
                  content={docContent}
                  basePath={selectedDoc.path}
                  onDocNavigate={handleDocNavigate}
                  onHeadings={setHeadings}
                  workspaceId={currentWorkspaceId}
                />
              </ErrorBoundary>
            )
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <EmptyState
                icon="📄"
                title={t('projectView.selectFile')}
                description="트리에서 .md 또는 이미지 파일을 클릭하면 여기 표시됩니다."
              />
            </div>
          )}
        </div>

        {/* F2: 우측 TOC 사이드바 — onHeadingClick 전달 */}
        {showToc && headings.length > 0 && (
          <div
            style={{
              width: '220px',
              flexShrink: 0,
              borderLeft: '1px solid var(--border)',
              background: 'var(--bg-elev)',
              overflow: 'auto',
              padding: 'var(--sp-4) var(--sp-3)',
            }}
          >
            <TableOfContents headings={headings} onHeadingClick={handleTocClick} />
          </div>
        )}
      </div>
    </div>
  )
}

// re-export for App.tsx activeProject tracking
export type { ProjectViewProps }
