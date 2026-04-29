import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { ProjectCard } from '../components/ProjectCard'
import { ProjectRow } from '../components/ProjectRow'
import { FilterBar } from '../components/FilterBar'
import { InboxItem } from '../components/InboxItem'
import { EmptyState, StatusMessage, Button, IconButton } from '../components/ui'
import { useAppStore } from '../state/store'
import { applyMetaFilter, buildDocGroups, sortDocsByOrder, type GroupByField } from '../utils/docFilters'
import { humanizeError } from '../lib/humanizeError'
import type { Project, SortOrder, ViewLayout } from '../../../src/preload/types'

interface AllProjectsViewProps {
  workspaceId: string | null
  onOpenProject: (project: Project) => void
}

const GROUP_BY_LABEL_KEYS: Record<GroupByField, string> = {
  tag: 'allProjects.groupTag',
  status: 'allProjects.groupStatus',
  source: 'allProjects.groupSource',
}

function sortProjects(projects: Project[], order: SortOrder): Project[] {
  const copy = [...projects]
  if (order === 'recent') return copy.sort((a, b) => b.lastModified - a.lastModified)
  if (order === 'name') return copy.sort((a, b) => a.name.localeCompare(b.name))
  if (order === 'count') return copy.sort((a, b) => b.docCount - a.docCount)
  return copy
}


const SORT_LABEL_KEYS: Record<SortOrder, string> = {
  recent: 'allProjects.sortRecent',
  name: 'allProjects.sortName',
  count: 'allProjects.sortCount',
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
  const { t } = useTranslation()
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
          title={t('allProjects.selectWorkspace')}
          description={t('allProjects.selectWorkspaceDesc')}
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
            {isFilterActive
              ? t('allProjects.titleFiltered', { count: docCount })
              : t('allProjects.titleAll', { count: sorted.length })}
          </h2>
          {isCounting && (
            <StatusMessage variant="info" inline>
              {t('allProjects.countingDocs', {
                done: docCountProgress.done,
                total: docCountProgress.total,
                pct: Math.round((docCountProgress.done / docCountProgress.total) * 100),
              })}
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
                {t(SORT_LABEL_KEYS[o])}
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
                {t('allProjects.groupLabel')}
              </span>
              {(['tag', 'status', 'source'] as GroupByField[]).map((by) => (
                <Button
                  key={by}
                  size="sm"
                  variant={groupBy === by ? 'primary' : 'ghost'}
                  onClick={() => setGroupBy(groupBy === by ? null : by)}
                >
                  {t(GROUP_BY_LABEL_KEYS[by])}
                </Button>
              ))}
            </div>
          )}
          {/* 레이아웃 토글 — 필터 비활성 시만 표시 */}
          {!isFilterActive && (
            <div style={{ display: 'flex', gap: 'var(--sp-1)', borderLeft: '1px solid var(--border)', paddingLeft: 'var(--sp-2)' }}>
              <IconButton
                aria-label={t('allProjects.viewGrid')}
                aria-pressed={viewLayout === 'grid'}
                size="sm"
                variant={viewLayout === 'grid' ? 'primary' : 'ghost'}
                onClick={() => handleLayoutChange('grid')}
              >
                <GridIcon />
              </IconButton>
              <IconButton
                aria-label={t('allProjects.viewList')}
                aria-pressed={viewLayout === 'list'}
                size="sm"
                variant={viewLayout === 'list' ? 'primary' : 'ghost'}
                onClick={() => handleLayoutChange('list')}
              >
                <ListIcon />
              </IconButton>
            </div>
          )}
          {/* 새로고침 — IconButton 만으로는 마우스 사용자가 인지 어려워 title 툴팁(⌘R 단축키 안내) 동반 */}
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 'var(--sp-2)' }}>
            <IconButton
              aria-label={t('allProjects.refresh')}
              title={t('sidebar.refreshTooltip')}
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
            <StatusMessage variant="loading">{t('allProjects.scanning')}</StatusMessage>
          </div>
        ) : error ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--sp-12)' }}>
            <StatusMessage variant="error">{humanizeError(t, error)}</StatusMessage>
          </div>
        ) : isFilterActive ? (
          /* 필터 활성: 문서 뷰 */
          filteredDocs.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--sp-12)' }}>
              <EmptyState
                icon="🔍"
                title={t('allProjects.filterEmpty')}
                description={t('allProjects.filterEmptyDesc')}
              />
            </div>
          ) : docGroups ? (
            /* 그룹별 섹션 */
            <div>
              {docGroups.map((group) => (
                <section key={group.label} aria-label={t('allProjects.groupAria', { name: group.label })}>
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
            title={t('allProjects.notFound')}
            description={t('allProjects.notFoundDesc')}
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
              <span style={{ flex: '1 1 160px', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 'var(--fw-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('allProjects.headerName')}</span>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 'var(--fw-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em', width: '60px', textAlign: 'right' }}>{t('allProjects.headerDocs')}</span>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 'var(--fw-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em', width: '56px', textAlign: 'right' }}>{t('allProjects.headerDate')}</span>
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
