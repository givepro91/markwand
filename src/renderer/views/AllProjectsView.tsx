import { useCallback, useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ProjectCard } from '../components/ProjectCard'
import { ProjectRow } from '../components/ProjectRow'
import { EmptyState, StatusMessage, Button, IconButton } from '../components/ui'
import { useAppStore } from '../state/store'
import type { Project } from '../../../src/preload/types'
import type { SortOrder, ViewLayout } from '../../../src/preload/types'

interface AllProjectsViewProps {
  workspaceId: string | null
  onOpenProject: (project: Project) => void
}

function sortProjects(projects: Project[], order: SortOrder): Project[] {
  const copy = [...projects]
  if (order === 'recent') return copy.sort((a, b) => b.lastModified - a.lastModified)
  if (order === 'name') return copy.sort((a, b) => a.name.localeCompare(b.name))
  if (order === 'count') return copy.sort((a, b) => b.docCount - a.docCount)
  return copy
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
  const { projects, sortOrder, setSortOrder, viewLayout, setViewLayout, projectsLoading: loading, projectsError: error, docCountProgress, bumpRefreshKey } = useAppStore(
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
    }))
  )
  const isCounting = docCountProgress.total > 0 && docCountProgress.done < docCountProgress.total

  const sorted = useMemo(() => sortProjects(projects, sortOrder), [projects, sortOrder])

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

  return (
    <div style={{ padding: 'var(--sp-6)', height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
          <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-semibold)', color: 'var(--text)', margin: 0 }}>
            전체 프로젝트 ({sorted.length})
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
          {/* 레이아웃 토글 */}
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
          {/* 새로고침 — 파일 변경 동기화 (chokidar disable이라 명시적 호출) */}
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

      {isCounting && (
        <div style={{ marginBottom: 'var(--sp-4)' }}>
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

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--sp-12)' }}>
          <StatusMessage variant="loading">프로젝트 스캔 중…</StatusMessage>
        </div>
      ) : error ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--sp-12)' }}>
          <StatusMessage variant="error">스캔 실패: {error}</StatusMessage>
        </div>
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
        <div style={{ display: 'flex', flexDirection: 'column' }}>
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
  )
}
