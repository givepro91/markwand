import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { FileTree } from '../components/FileTree'
import { MarkdownViewer } from '../components/MarkdownViewer'
import { ClaudeButton } from '../components/ClaudeButton'
import { FilterBar } from '../components/FilterBar'
import { TableOfContents } from '../components/TableOfContents'
import { DriftPanel } from '../components/DriftPanel'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { EmptyState, IconButton } from '../components/ui'
import { useDocs } from '../hooks/useDocs'
import { useAppStore, type MetaFilter } from '../state/store'
import { createFindController, type FindController } from '../lib/findInContainer'
import type { Doc } from '../../../src/preload/types'
import type { Heading } from '../components/TableOfContents'

function applyMetaFilter(docs: Doc[], filter: MetaFilter): Doc[] {
  let result = docs
  if (filter.tags.length > 0)
    result = result.filter((d) => filter.tags.some((t) => d.frontmatter?.tags?.includes(t)))
  if (filter.statuses.length > 0)
    result = result.filter(
      (d) => d.frontmatter?.status != null && filter.statuses.includes(d.frontmatter.status)
    )
  if (filter.sources.length > 0)
    result = result.filter(
      (d) =>
        d.frontmatter?.source != null &&
        filter.sources.includes(d.frontmatter.source as string)
    )
  if (filter.updatedRange !== 'all') {
    const now = Date.now()
    const ms: Record<string, number> = {
      today: 86_400_000,
      '7d': 604_800_000,
      '30d': 2_592_000_000,
    }
    result = result.filter((d) => d.mtime >= now - (ms[filter.updatedRange] ?? 0))
  }
  return result
}

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
  const { docs } = useDocs(projectId)
  const metaFilter = useAppStore((s) => s.metaFilter)

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

  const loadDoc = useCallback(async (doc: Doc) => {
    setSelectedDoc(doc)
    setHeadings([])
    // F4: 마지막 본 문서 갱신
    setLastViewedDoc(projectId, doc.path)
    try {
      const result = await window.api.fs.readDoc(doc.path)
      setDocContent(result.content)
    } catch (err) {
      console.error('문서 읽기 실패:', err)
      setDocContent('문서를 읽을 수 없습니다.')
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

  // cmd+F 단축키로 검색 열기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
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
  }, [showFind])

  const handleDocNavigate = useCallback(async (absPath: string) => {
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
            placeholder="문서에서 검색..."
            aria-label="문서 내 검색"
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
              {findResult.total > 0 ? `${findResult.active} / ${findResult.total}` : '결과 없음'}
            </span>
          )}
          <IconButton aria-label="이전 결과" size="sm" onClick={handleFindPrev} disabled={!findQuery.trim()}>
            <ChevronLeftIcon />
          </IconButton>
          <IconButton aria-label="다음 결과" size="sm" onClick={handleFindNext} disabled={!findQuery.trim()}>
            <ChevronRightIcon />
          </IconButton>
          <IconButton aria-label="검색 닫기" size="sm" onClick={handleCloseFind}>
            ✕
          </IconButton>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* F1: 좌측 파일 트리 — flex column + minHeight:0 체인 완전 보장 */}
        <div
          style={{
            width: '260px',
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
            <FileTree
              key={projectId}
              projectId={projectId}
              rootPath={projectRoot}
              docs={filteredDocs}
              onSelect={loadDoc}
              initialExpanded={initialExpanded}
              onExpandChange={handleExpandChange}
            />
          </div>
        </div>

        {/* F2: 중앙 마크다운 뷰어 — ref 부착 */}
        <div
          ref={scrollContainerRef}
          style={{ flex: 1, overflow: 'auto', padding: 'var(--sp-6) var(--sp-8)', position: 'relative' }}
        >
          {/* 우상단 아이콘 버튼 그룹 */}
          {selectedDoc && (
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
                aria-label="문서 내 검색"
                aria-pressed={showFind}
                size="sm"
                variant={showFind ? 'primary' : 'ghost'}
                onClick={() => setShowFind((p) => !p)}
              >
                <SearchIcon />
              </IconButton>
              <IconButton
                aria-label="목차 토글"
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
            <ErrorBoundary resetKey={selectedDoc.path}>
              <ErrorBoundary resetKey={selectedDoc.path}>
                <DriftPanel docPath={selectedDoc.path} projectRoot={projectRoot} />
              </ErrorBoundary>
              <MarkdownViewer
                content={docContent}
                basePath={selectedDoc.path}
                onDocNavigate={handleDocNavigate}
                onHeadings={setHeadings}
              />
            </ErrorBoundary>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <EmptyState
                icon="📄"
                title="왼쪽에서 문서를 선택하세요"
                description="트리에서 .md 파일을 클릭하면 여기 표시됩니다."
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
