import { useCallback, useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ProjectCard } from '../components/ProjectCard'
import { ProjectRow } from '../components/ProjectRow'
import { FilterBar } from '../components/FilterBar'
import { InboxItem } from '../components/InboxItem'
import { EmptyState, StatusMessage, Button, IconButton } from '../components/ui'
import { useAppStore, type MetaFilter } from '../state/store'
import type { Doc, Project } from '../../../src/preload/types'
import type { SortOrder, ViewLayout } from '../../../src/preload/types'

interface AllProjectsViewProps {
  workspaceId: string | null
  onOpenProject: (project: Project) => void
}

type GroupByField = 'tag' | 'status' | 'source'

const GROUP_BY_LABELS: Record<GroupByField, string> = {
  tag: '태그별',
  status: '상태별',
  source: '출처별',
}

function sortProjects(projects: Project[], order: SortOrder): Project[] {
  const copy = [...projects]
  if (order === 'recent') return copy.sort((a, b) => b.lastModified - a.lastModified)
  if (order === 'name') return copy.sort((a, b) => a.name.localeCompare(b.name))
  if (order === 'count') return copy.sort((a, b) => b.docCount - a.docCount)
  return copy
}

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

function buildDocGroups(
  docs: Doc[],
  by: GroupByField,
  order: SortOrder
): Array<{ label: string; docs: Doc[] }> {
  const map = new Map<string, Doc[]>()
  for (const doc of docs) {
    let keys: string[]
    if (by === 'tag') {
      keys = doc.frontmatter?.tags?.length ? [...doc.frontmatter.tags] : ['Untagged']
    } else if (by === 'status') {
      keys = doc.frontmatter?.status ? [doc.frontmatter.status] : ['Untagged']
    } else {
      keys = doc.frontmatter?.source ? [doc.frontmatter.source as string] : ['Untagged']
    }
    for (const key of keys) {
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(doc)
    }
  }

  const groups: Array<{ label: string; docs: Doc[] }> = []
  let untagged: { label: string; docs: Doc[] } | undefined
  for (const [label, items] of map) {
    const sorted = sortDocsByOrder([...items], order)
    if (label === 'Untagged') {
      untagged = { label, docs: sorted }
    } else {
      groups.push({ label, docs: sorted })
    }
  }
  groups.sort((a, b) => a.label.localeCompare(b.label))
  if (untagged) groups.push(untagged)
  return groups
}

function sortDocsByOrder(docs: Doc[], order: SortOrder): Doc[] {
  if (order === 'recent') return docs.sort((a, b) => b.mtime - a.mtime)
  if (order === 'name') return docs.sort((a, b) => a.name.localeCompare(b.name))
  return docs.sort((a, b) => b.mtime - a.mtime)
}

const SORT_LABELS: Record<SortOrder, string> = {
  recent: '최신',
  name: '이름',
  count: '개수',
}

const GridIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/>
  </svg>
)

const ListIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z"/>
  </svg>
)

const RefreshIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
    <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
  </svg>
)

export function AllProjectsView({ workspaceId, onOpenProject }: AllProjectsViewProps) {
  const {
    projects,
    sortOrder,
    setSortOrder,
    viewLayout,
    setViewLayout,
    projectsLoading: loading,
    projectsError: error,
    docCountProgress,
    bumpRefreshKey,
    storeDocs,
    metaFilter,
  } = useAppStore(
    useShallow((s) => ({
      projects: s.projects,
      sortOrder: s.sortOrder,
      setSortOrder: s.setSortOrder,
      viewLayout: s.viewLayout,
      setViewLayout: s.setViewLayout,
      projectsLoading: s.projectsLoading,
      projectsError: s.projectsError,
      docCountProgress: s.docCountProgress,
      bumpRefreshKey: s.bumpRefreshKey,
      storeDocs: s.docs,
      metaFilter: s.metaFilter,
    }))
  )
  const openDoc = useAppStore((s) => s.openDoc)

  const [groupBy, setGroupBy] = useState<GroupByField | null>(null)

  const isCounting = docCountProgress.total > 0 && docCountProgress.done < docCountProgress.total

  const isFilterActive =
    metaFilter.tags.length > 0 ||
    metaFilter.statuses.length > 0 ||
    metaFilter.sources.length > 0 ||
    metaFilter.updatedRange !== 'all'

  useEffect(() => {
    if (!isFilterActive) setGroupBy(null)
  }, [isFilterActive])

  const sorted = useMemo(() => sortProjects(projects, sortOrder), [projects, sortOrder])

  const filteredDocs = useMemo(() => {
    if (!isFilterActive) return []
    return applyMetaFilter(storeDocs, metaFilter)
  }, [storeDocs, metaFilter, isFilterActive])

  const docGroups = useMemo(() => {
    if (!groupBy || filteredDocs.length === 0) return null
    return buildDocGroups(filteredDocs, groupBy, sortOrder)
  }, [filteredDocs, groupBy, sortOrder])

  const sortedFilteredDocs = useMemo(
    () => sortDocsByOrder([...filteredDocs], sortOrder),
    [filteredDocs, sortOrder]
  )

  const projectMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of projects) map.set(p.id, p.name)
    return map
  }, [projects])

  // viewLayout 복원
  useEffect(() => {
    window.api.prefs.get('viewLayout').then((stored) => {
      if (stored === 'grid' || stored === 'list') {
        setViewLayout(stored as ViewLayout)
      }
    })
  }, [setViewLayout])

  const handleSortChange = useCallback(async (order: SortOrder) => {
    setSortOrder(order)
    await window.api.prefs.set('sortOrder', order)
  }, [setSortOrder])

  const handleLayoutChange = useCallback(async (layout: ViewLayout) => {
    setViewLayout(layout)
    await window.api.prefs.set('viewLayout', layout)
  }, [setViewLayout])

  if (!workspaceId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <EmptyState
          icon="🗂️"
          title="워크스페이스를 선택하세요"
          description="상단에서 워크스페이스를 선택하면 프로젝트 목록이 표시됩니다."
        />
      </div>
    )
  }

  const docCount = isFilterActive ? filteredDocs.length : sorted.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* 헤더 */}
      <div
        style={{
          padding: 'var(--sp-6) var(--sp-6) var(--sp-4)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
          <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-semibold)', color: 'var(--text)', margin: 0 }}>
            {isFilterActive ? `필터 결과 (${docCount})` : `전체 프로젝트 (${sorted.length})`}
          </h2>
          {isCounting && (
            <StatusMessage variant="info" inline>
              문서 분석 중 {docCountProgress.done}/{docCountProgress.total}
              {' '}({Math.round((docCountProgress.done / docCountProgress.total) * 100)}%)
            </StatusMessage>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          {/* 정렬 버튼 */}
          <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
            {(['recent', 'name', 'count'] as SortOrder[]).map((o) => (
              <Button
                key={o}
                size="sm"
                variant={sortOrder === o ? 'primary' : 'ghost'}
                onClick={() => handleSortChange(o)}
              >
                {SORT_LABELS[o]}
              </Button>
            ))}
          </div>
          {/* 그룹 선택 — 필터 활성 시만 표시 */}
          {isFilterActive && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-1)',
                borderLeft: '1px solid var(--border)',
                paddingLeft: 'var(--sp-2)',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--fs-xs)',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                그룹
              </span>
              {(['tag', 'status', 'source'] as GroupByField[]).map((by) => (
                <Button
                  key={by}
                  size="sm"
                  variant={groupBy === by ? 'primary' : 'ghost'}
                  onClick={() => setGroupBy(groupBy === by ? null : by)}
                >
                  {GROUP_BY_LABELS[by]}
                </Button>
              ))}
            </div>
          )}
          {/* 레이아웃 토글 — 필터 비활성 시만 표시 */}
          {!isFilterActive && (
            <div style={{ display: 'flex', gap: 'var(--sp-1)', borderLeft: '1px solid var(--border)', paddingLeft: 'var(--sp-2)' }}>
              <IconButton
                aria-label="그리드 보기"
                aria-pressed={viewLayout === 'grid'}
                size="sm"
                variant={viewLayout === 'grid' ? 'primary' : 'ghost'}
                onClick={() => handleLayoutChange('grid')}
              >
                <GridIcon />
              </IconButton>
              <IconButton
                aria-label="목록 보기"
                aria-pressed={viewLayout === 'list'}
                size="sm"
                variant={viewLayout === 'list' ? 'primary' : 'ghost'}
                onClick={() => handleLayoutChange('list')}
              >
                <ListIcon />
              </IconButton>
            </div>
          )}
          {/* 새로고침 */}
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 'var(--sp-2)' }}>
            <IconButton
              aria-label="새로고침"
              size="sm"
              variant="ghost"
              onClick={() => bumpRefreshKey()}
              disabled={loading}
            >
              <RefreshIcon />
            </IconButton>
          </div>
        </div>
      </div>

      {/* FilterBar */}
      <FilterBar docs={storeDocs} />

      {/* 진행 바 */}
      {isCounting && (
        <div style={{ padding: '0 var(--sp-6) var(--sp-2)', flexShrink: 0 }}>
          <div
            style={{
              height: '4px',
              background: 'var(--bg-hover)',
              borderRadius: 'var(--r-pill)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.round((docCountProgress.done / docCountProgress.total) * 100)}%`,
                background: 'var(--accent)',
                borderRadius: 'var(--r-pill)',
                transition: 'width var(--duration-normal) var(--ease-standard)',
              }}
            />
          </div>
        </div>
      )}

      {/* 메인 콘텐츠 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 var(--sp-6) var(--sp-6)' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--sp-12)' }}>
            <StatusMessage variant="loading">프로젝트 스캔 중…</StatusMessage>
          </div>
        ) : error ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--sp-12)' }}>
            <StatusMessage variant="error">스캔 실패: {error}</StatusMessage>
          </div>
        ) : isFilterActive ? (
          /* 필터 활성: 문서 뷰 */
          filteredDocs.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--sp-12)' }}>
              <EmptyState
                icon="🔍"
                title="필터 결과 없음"
                description="다른 필터 조건을 시도해 보세요."
              />
            </div>
          ) : docGroups ? (
            /* 그룹별 섹션 */
            <div>
              {docGroups.map((group) => (
                <section key={group.label} aria-label={`${group.label} 그룹`}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--sp-2)',
                      padding: 'var(--sp-3) 0 var(--sp-1)',
                      borderBottom: '1px solid var(--border)',
                      marginBottom: 'var(--sp-1)',
                    }}
                    role="rowheader"
                  >
                    <span
                      style={{
                        fontSize: 'var(--fs-sm)',
                        fontWeight: 'var(--fw-semibold)',
                        color: 'var(--text)',
                      }}
                    >
                      {group.label}
                    </span>
                    <span
                      style={{
                        fontSize: 'var(--fs-xs)',
                        color: 'var(--text-muted)',
                        background: 'var(--bg-hover)',
                        borderRadius: 'var(--r-pill)',
                        padding: '1px var(--sp-2)',
                      }}
                    >
                      {group.docs.length}
                    </span>
                  </div>
                  {group.docs.map((doc) => (
                    <InboxItem
                      key={doc.path}
                      path={doc.path}
                      projectName={projectMap.get(doc.projectId) ?? ''}
                      title={
                        (doc.frontmatter?.title as string | undefined) ??
                        doc.name.replace(/\.md$/, '')
                      }
                      mtime={doc.mtime}
                      isRead={false}
                      onClick={() => openDoc(doc.projectId, doc.path)}
                    />
                  ))}
                </section>
              ))}
            </div>
          ) : (
            /* 그룹 없음: 정렬된 평면 목록 */
            <div>
              {sortedFilteredDocs.map((doc) => (
                <InboxItem
                  key={doc.path}
                  path={doc.path}
                  projectName={projectMap.get(doc.projectId) ?? ''}
                  title={
                    (doc.frontmatter?.title as string | undefined) ??
                    doc.name.replace(/\.md$/, '')
                  }
                  mtime={doc.mtime}
                  isRead={false}
                  onClick={() => openDoc(doc.projectId, doc.path)}
                />
              ))}
            </div>
          )
        ) : sorted.length === 0 ? (
          <EmptyState
            icon="📂"
            title="프로젝트를 찾을 수 없습니다"
            description="워크스페이스에 마커 파일(.git, package.json 등)이 있는 폴더가 없습니다."
          />
        ) : viewLayout === 'grid' ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 'var(--sp-3)',
              paddingTop: 'var(--sp-2)',
            }}
          >
            {sorted.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onOpen={onOpenProject}
              />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', paddingTop: 'var(--sp-2)' }}>
            {/* 리스트 헤더 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-3)',
                padding: 'var(--sp-1) var(--sp-3)',
                borderBottom: '1px solid var(--border)',
                marginBottom: 'var(--sp-1)',
              }}
            >
              <span style={{ flex: '1 1 160px', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 'var(--fw-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>이름</span>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 'var(--fw-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em', width: '60px', textAlign: 'right' }}>문서</span>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 'var(--fw-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em', width: '56px', textAlign: 'right' }}>날짜</span>
              <span style={{ width: '22px' }} />
              <span style={{ width: '12px' }} />
            </div>
            {sorted.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                onOpen={onOpenProject}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
