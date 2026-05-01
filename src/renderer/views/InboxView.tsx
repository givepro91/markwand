import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { InboxItem } from '../components/InboxItem'
import { EmptyState, StatusMessage, Button } from '../components/ui'
import { useAppStore } from '../state/store'
import { useAllDocsFlat } from '../hooks/useDocs'
import type { Doc } from '../../preload/types'

type DateGroup = 'today' | 'yesterday' | 'thisWeek' | 'earlier'
type ReadFilter = 'all' | 'read' | 'unread'

interface InboxDoc extends Doc {
  projectName: string
  title: string
  isRead: boolean
}

interface InboxViewProps {
  workspaceId: string | null
  onOpenDoc: (doc: Doc, projectId: string) => void
}

function groupByDate(mtime: number): DateGroup {
  const now = Date.now()
  const diff = now - mtime
  const oneDay = 86_400_000
  if (diff < oneDay) return 'today'
  if (diff < 2 * oneDay) return 'yesterday'
  if (diff < 7 * oneDay) return 'thisWeek'
  return 'earlier'
}

const GROUP_LABEL_KEYS: Record<DateGroup, string> = {
  today: 'inbox.sectionToday',
  yesterday: 'inbox.sectionYesterday',
  thisWeek: 'inbox.sectionThisWeek',
  earlier: 'inbox.sectionEarlier',
}

const GROUP_ORDER: DateGroup[] = ['today', 'yesterday', 'thisWeek', 'earlier']

const FILTER_LABEL_KEYS: Record<ReadFilter, string> = {
  all: 'inbox.filterAll',
  read: 'inbox.filterRead',
  unread: 'inbox.filterUnread',
}

const EMPTY_MESSAGE_KEYS: Record<ReadFilter, string> = {
  all: 'inbox.emptyAll',
  read: 'inbox.emptyRead',
  unread: 'inbox.emptyUnread',
}

export function InboxView({ workspaceId, onOpenDoc }: InboxViewProps) {
  const { t } = useTranslation()
  const projects = useAppStore((s) => s.projects)
  const readDocs = useAppStore((s) => s.readDocs)
  const markDocRead = useAppStore((s) => s.markDocRead)
  const trackReadDocs = useAppStore((s) => s.trackReadDocs)
  const docCountProgress = useAppStore((s) => s.docCountProgress)
  const projectsLoading = useAppStore((s) => s.projectsLoading)
  const [readFilter, setReadFilter] = useState<ReadFilter>('all')

  // C8: 자체 scan 루프 삭제 — store docs(cachedFlat) 구독만 사용.
  // useDocs/App.tsx 가 이미 scan을 수행하므로 중복 트리거 없음.
  const allStoreDocs = useAllDocsFlat()

  // projects 맵 — 메모이즈
  const projectMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  )

  // store docs → InboxDoc 변환 + isRead 계산
  // C8: deps에서 projects 배열 참조 제거 (projectMap 참조로 대체 — 내용 변경 시만 재계산)
  const enrichedDocs = useMemo<InboxDoc[]>(() => {
    if (!workspaceId) return []
    const result: InboxDoc[] = []
    for (const doc of allStoreDocs) {
      const project = projectMap.get(doc.projectId)
      if (!project) continue
      // 현재 workspaceId의 프로젝트만 포함
      if (project.workspaceId !== workspaceId) continue
      result.push({
        ...doc,
        projectName: project.name,
        title: (doc.frontmatter?.title as string | undefined) ?? doc.name.replace(/\.md$/, ''),
        isRead: trackReadDocs ? !!readDocs[doc.path] : false,
      })
    }
    return result
  }, [allStoreDocs, projectMap, workspaceId, readDocs, trackReadDocs])

  // 필터 적용
  const filteredDocs = useMemo<InboxDoc[]>(() => {
    if (readFilter === 'read') return enrichedDocs.filter((d) => d.isRead)
    if (readFilter === 'unread') return enrichedDocs.filter((d) => !d.isRead)
    return enrichedDocs
  }, [enrichedDocs, readFilter])

  const handleClick = useCallback(
    async (doc: InboxDoc) => {
      if (trackReadDocs) {
        const updated = { ...readDocs, [doc.path]: Date.now() }
        markDocRead(doc.path)
        await window.api.prefs.set('readDocs', updated)
      }
      onOpenDoc(doc, doc.projectId)
    },
    [trackReadDocs, readDocs, markDocRead, onOpenDoc]
  )

  // 날짜 그룹별로 분류 + 각 그룹 내 mtime 내림차순 정렬
  const grouped = useMemo(() => {
    const result = filteredDocs.reduce<Record<DateGroup, InboxDoc[]>>(
      (acc, doc) => {
        const group = groupByDate(doc.mtime)
        acc[group].push(doc)
        return acc
      },
      { today: [], yesterday: [], thisWeek: [], earlier: [] }
    )
    for (const g of GROUP_ORDER) {
      result[g].sort((a, b) => b.mtime - a.mtime)
    }
    return result
  }, [filteredDocs])

  // C8: loading 상태 = store의 진행률 공유
  const loading = projectsLoading || (docCountProgress.total > 0 && docCountProgress.done < docCountProgress.total)

  if (!workspaceId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <EmptyState
          icon="🗂️"
          title={t('inbox.selectWorkspace')}
          description={t('empty.description')}
        />
      </div>
    )
  }

  return (
    <div
      style={{
        padding: 'var(--sp-6)',
        height: '100%',
        overflow: 'auto',
        background:
          'radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 8%, transparent) 0, transparent 34%), var(--bg)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--sp-4)',
          marginBottom: 'var(--sp-5)',
          padding: 'var(--sp-5)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)',
          background: 'var(--surface-wash), var(--surface-glass)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <h2 style={{ fontSize: 'var(--fs-xl)', fontWeight: 'var(--fw-bold)', color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>
          {t('sidebar.tabs.inbox')}
        </h2>
        <div style={{ display: 'flex', gap: 'var(--sp-1)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {(['all', 'read', 'unread'] as ReadFilter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={readFilter === f ? 'primary' : 'ghost'}
              onClick={() => setReadFilter(f)}
            >
              {t(FILTER_LABEL_KEYS[f])}
            </Button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--sp-12)' }}>
          <StatusMessage variant="loading">{t('inbox.collecting')}</StatusMessage>
        </div>
      )}
      {!loading && filteredDocs.length === 0 && (
        <EmptyState
          icon="📭"
          title={t('inbox.noDocsTitle')}
          description={t(EMPTY_MESSAGE_KEYS[readFilter])}
        />
      )}

      {GROUP_ORDER.map((group) => {
        const items = grouped[group]
        if (items.length === 0) return null
        return (
          <div
            key={group}
            style={{
              marginBottom: 'var(--sp-6)',
              border: '1px solid var(--border-muted)',
              borderRadius: 'var(--r-xl)',
              background: 'color-mix(in srgb, var(--bg-elev) 86%, transparent)',
              boxShadow: 'var(--shadow-sm)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                fontSize: 'var(--fs-xs)',
                fontWeight: 'var(--fw-semibold)',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: 'var(--sp-3) var(--sp-4)',
                borderBottom: '1px solid var(--border-muted)',
                background: 'color-mix(in srgb, var(--bg-hover) 48%, transparent)',
              }}
            >
              {t(GROUP_LABEL_KEYS[group])}
            </div>
            {items.map((doc) => (
              <InboxItem
                key={doc.path}
                path={doc.path}
                projectName={doc.projectName}
                title={doc.title}
                mtime={doc.mtime}
                isRead={doc.isRead}
                onClick={() => handleClick(doc)}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
