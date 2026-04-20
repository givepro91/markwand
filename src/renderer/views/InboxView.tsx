import { useEffect, useState, useCallback, useMemo } from 'react'
import { InboxItem } from '../components/InboxItem'
import { EmptyState, StatusMessage, Button } from '../components/ui'
import { useAppStore } from '../state/store'
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

const GROUP_LABELS: Record<DateGroup, string> = {
  today: '오늘',
  yesterday: '어제',
  thisWeek: '이번 주',
  earlier: '이전',
}

const GROUP_ORDER: DateGroup[] = ['today', 'yesterday', 'thisWeek', 'earlier']

const FILTER_LABELS: Record<ReadFilter, string> = {
  all: '전체',
  read: '읽음만',
  unread: '안 읽음만',
}

const EMPTY_MESSAGES: Record<ReadFilter, string> = {
  all: '워크스페이스 프로젝트에 마크다운 문서가 없거나 아직 로딩 중입니다.',
  read: '읽은 문서가 없습니다.',
  unread: '읽지 않은 문서가 없습니다.',
}

export function InboxView({ workspaceId, onOpenDoc }: InboxViewProps) {
  const projects = useAppStore((s) => s.projects)
  const [readDocs, setReadDocs] = useState<Record<string, number>>({})
  const [allDocs, setAllDocs] = useState<InboxDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [readFilter, setReadFilter] = useState<ReadFilter>('all')

  // readDocs 복원
  useEffect(() => {
    window.api.prefs.get('readDocs').then((stored) => {
      setReadDocs((stored as Record<string, number> | null) ?? {})
    })
  }, [])

  // App.tsx가 채운 projects가 도착하면 docs를 스트리밍으로 수집한다.
  // onDocsChunk를 먼저 구독한 뒤 scanDocs를 invoke해 첫 청크부터 즉시 렌더한다.
  useEffect(() => {
    if (!workspaceId || projects.length === 0) {
      setAllDocs([])
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setAllDocs([])

    const projectMap = new Map(projects.map((p) => [p.id, p]))

    const unsub = window.api.project.onDocsChunk((_event: unknown, chunk: Doc[]) => {
      if (cancelled) return
      const incoming: InboxDoc[] = []
      for (const doc of chunk) {
        const project = projectMap.get(doc.projectId)
        if (!project) continue
        incoming.push({
          ...doc,
          projectName: project.name,
          title: (doc.frontmatter?.title as string | undefined) ?? doc.name.replace(/\.md$/, ''),
          isRead: false,
        })
      }
      if (incoming.length > 0) {
        setAllDocs((prev) => [...prev, ...incoming])
      }
    })

    async function runScans() {
      try {
        const CONCURRENCY = 5
        const queue = [...projects]
        let totalCount = 0

        async function worker() {
          while (queue.length > 0) {
            if (cancelled) return
            const project = queue.shift()!
            try {
              const result = await window.api.project.scanDocs(project.id)
              totalCount += result.length
            } catch {
              // 개별 프로젝트 실패는 silent
            }
          }
        }

        await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
        if (!cancelled) {
          console.log(`[InboxView] scanDocs complete: ${totalCount} docs`)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        unsub()
        if (!cancelled) setLoading(false)
      }
    }

    runScans()

    return () => {
      cancelled = true
      unsub()
    }
  }, [workspaceId, projects])

  // readDocs 반영
  const enrichedDocs = useMemo<InboxDoc[]>(
    () => allDocs.map((d) => ({ ...d, isRead: !!readDocs[d.path] })),
    [allDocs, readDocs]
  )

  // 필터 적용
  const filteredDocs = useMemo<InboxDoc[]>(() => {
    if (readFilter === 'read') return enrichedDocs.filter((d) => d.isRead)
    if (readFilter === 'unread') return enrichedDocs.filter((d) => !d.isRead)
    return enrichedDocs
  }, [enrichedDocs, readFilter])

  const handleClick = useCallback(
    async (doc: InboxDoc) => {
      const updated = { ...readDocs, [doc.path]: Date.now() }
      setReadDocs(updated)
      await window.api.prefs.set('readDocs', updated)
      onOpenDoc(doc, doc.projectId)
    },
    [readDocs, onOpenDoc]
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

  if (!workspaceId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <EmptyState
          icon="🗂️"
          title="워크스페이스를 선택하세요"
          description="상단에서 워크스페이스를 선택하면 최근 문서가 표시됩니다."
        />
      </div>
    )
  }

  return (
    <div style={{ padding: 'var(--sp-6)', height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-5)' }}>
        <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-semibold)', color: 'var(--text)', margin: 0 }}>
          최근 변경된 문서
        </h2>
        <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
          {(['all', 'read', 'unread'] as ReadFilter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={readFilter === f ? 'primary' : 'ghost'}
              onClick={() => setReadFilter(f)}
            >
              {FILTER_LABELS[f]}
            </Button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--sp-12)' }}>
          <StatusMessage variant="loading">전체 문서 수집 중…</StatusMessage>
        </div>
      )}
      {!loading && error && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--sp-12)' }}>
          <StatusMessage variant="error">수집 실패: {error}</StatusMessage>
        </div>
      )}
      {!loading && !error && filteredDocs.length === 0 && (
        <EmptyState
          icon="📭"
          title="문서가 없습니다"
          description={EMPTY_MESSAGES[readFilter]}
        />
      )}

      {!error && GROUP_ORDER.map((group) => {
        const items = grouped[group]
        if (items.length === 0) return null
        return (
          <div key={group} style={{ marginBottom: 'var(--sp-6)' }}>
            <div
              style={{
                fontSize: 'var(--fs-xs)',
                fontWeight: 'var(--fw-semibold)',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '0 var(--sp-4) var(--sp-2)',
                borderBottom: '1px solid var(--border-muted)',
                marginBottom: 'var(--sp-1)',
              }}
            >
              {GROUP_LABELS[group]}
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
