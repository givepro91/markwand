import { useMemo, CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore, type MetaFilter, type UpdatedRange } from '../state/store'
import type { Doc } from '../../../src/preload/types'

interface FilterBarProps {
  docs: Doc[]
}

const AI_SOURCES = new Set(['claude', 'codex', 'design', 'review'])

const UPDATED_RANGE_KEYS: Record<UpdatedRange, string> = {
  today: 'filter.rangeToday',
  '7d': 'filter.range7d',
  '30d': 'filter.range30d',
  all: 'filter.rangeAll',
}

const UPDATED_RANGES: UpdatedRange[] = ['today', '7d', '30d', 'all']

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
}

const SOURCE_LABELS: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  design: 'Design',
  review: 'Review',
}

function sourceStyle(source: string): CSSProperties {
  if (source === 'claude') return { background: 'var(--source-claude-bg)', color: 'var(--source-claude-text)' }
  if (source === 'codex')  return { background: 'var(--source-codex-bg)',  color: 'var(--source-codex-text)'  }
  if (source === 'design') return { background: 'var(--source-design-bg)', color: 'var(--source-design-text)' }
  if (source === 'review') return { background: 'var(--source-review-bg)', color: 'var(--source-review-text)' }
  return { background: 'var(--source-unknown-bg)', color: 'var(--source-unknown-text)' }
}

function statusStyle(status: string): CSSProperties {
  if (status === 'draft')     return { background: 'var(--status-draft-bg)',     color: 'var(--status-draft-text)'     }
  if (status === 'published') return { background: 'var(--status-published-bg)', color: 'var(--status-published-text)' }
  if (status === 'archived')  return { background: 'var(--status-archived-bg)',  color: 'var(--status-archived-text)'  }
  return { background: 'var(--bg-hover)', color: 'var(--text-muted)' }
}

function SourceIcon({ source }: { source: string }) {
  const style: CSSProperties = { width: 12, height: 12, flexShrink: 0 }

  if (source === 'claude') {
    return (
      <svg aria-hidden="true" style={style} viewBox="0 0 12 12" fill="currentColor">
        <path d="M6 1l1.2 3.8H11L7.9 6.9l1.2 3.8L6 8.6 2.9 10.7l1.2-3.8L1 4.8h3.8z" />
      </svg>
    )
  }
  if (source === 'codex') {
    return (
      <svg aria-hidden="true" style={style} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M1 4l3 3-3 3M7 10h4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (source === 'design') {
    return (
      <svg aria-hidden="true" style={style} viewBox="0 0 12 12" fill="currentColor">
        <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="6" cy="6" r="2" />
      </svg>
    )
  }
  if (source === 'review') {
    return (
      <svg aria-hidden="true" style={style} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M1 6c1.5-3 8.5-3 10 0-1.5 3-8.5 3-10 0z" strokeLinejoin="round" />
        <circle cx="6" cy="6" r="1.5" fill="currentColor" />
      </svg>
    )
  }
  return null
}

function chipBase(active: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px var(--sp-2)',
    fontSize: 'var(--fs-xs)',
    fontWeight: active ? 'var(--fw-semibold)' as CSSProperties['fontWeight'] : 'var(--fw-normal)' as CSSProperties['fontWeight'],
    lineHeight: 'var(--lh-tight)',
    borderRadius: 'var(--r-pill)',
    border: active ? '1.5px solid currentColor' : '1.5px solid var(--border)',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as CSSProperties['whiteSpace'],
    transition: `background var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard)`,
    background: active ? undefined : 'var(--bg-elev)',
    color: active ? undefined : 'var(--text-muted)',
    outline: 'none',
  }
}

function segmentButton(active: boolean): CSSProperties {
  return {
    padding: '2px var(--sp-3)',
    fontSize: 'var(--fs-xs)',
    fontWeight: active ? 'var(--fw-semibold)' as CSSProperties['fontWeight'] : 'var(--fw-normal)' as CSSProperties['fontWeight'],
    lineHeight: 'var(--lh-tight)',
    cursor: 'pointer',
    border: 'none',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--text-muted)',
    transition: `background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard)`,
    outline: 'none',
  }
}

const divider: CSSProperties = {
  width: 1,
  alignSelf: 'stretch',
  background: 'var(--border)',
  flexShrink: 0,
}

function toggle<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]
}

const DEFAULT_FILTER: MetaFilter = { tags: [], statuses: [], sources: [], updatedRange: 'all' }

export function FilterBar({ docs }: FilterBarProps) {
  const { t } = useTranslation()
  const metaFilter = useAppStore((s) => s.metaFilter)
  const setMetaFilter = useAppStore((s) => s.setMetaFilter)

  const { allStatuses, allSources } = useMemo(() => {
    const statuses = new Set<string>()
    const sources = new Set<string>()
    for (const doc of docs) {
      if (doc.frontmatter?.status) statuses.add(doc.frontmatter.status)
      if (doc.frontmatter?.source) sources.add(doc.frontmatter.source)
    }
    return {
      allStatuses: [...statuses].sort(),
      allSources: [...sources].sort(),
    }
  }, [docs])

  const isActive =
    metaFilter.statuses.length > 0 ||
    metaFilter.sources.length > 0 ||
    metaFilter.updatedRange !== 'all'

  if (!isActive && allStatuses.length === 0 && allSources.length === 0) {
    return null
  }

  function setRange(r: UpdatedRange) {
    setMetaFilter({ ...metaFilter, updatedRange: r })
  }

  function setStatuses(statuses: string[]) {
    setMetaFilter({ ...metaFilter, statuses })
  }

  function setSources(sources: string[]) {
    setMetaFilter({ ...metaFilter, sources })
  }

  const containerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    padding: 'var(--sp-2) var(--sp-4)',
    borderBottom: '1px solid var(--border-muted)',
    background: 'var(--bg)',
    overflowX: 'auto',
    flexShrink: 0,
  }

  const sectionLabel: CSSProperties = {
    fontSize: 'var(--fs-xs)',
    color: 'var(--text-muted)',
    fontWeight: 'var(--fw-medium)' as CSSProperties['fontWeight'],
    whiteSpace: 'nowrap',
    flexShrink: 0,
  }

  return (
    <div style={containerStyle} role="toolbar" aria-label={t('filter.toolbarAria')}>
      {/* Updated range */}
      <span style={sectionLabel}>{t('filter.rangeSection')}</span>
      <div
        style={{
          display: 'inline-flex',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          overflow: 'hidden',
          flexShrink: 0,
        }}
        role="group"
        aria-label={t('filter.rangeAria')}
      >
        {UPDATED_RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            style={segmentButton(metaFilter.updatedRange === r)}
            aria-pressed={metaFilter.updatedRange === r}
          >
            {t(UPDATED_RANGE_KEYS[r])}
          </button>
        ))}
      </div>

      {/* Status chips */}
      {allStatuses.length > 0 && (
        <>
          <div style={divider} />
          <span style={sectionLabel}>{t('filter.statusSection')}</span>
          {allStatuses.map((s) => {
            const active = metaFilter.statuses.includes(s)
            const colors = active ? statusStyle(s) : {}
            const name = STATUS_LABELS[s] ?? s
            return (
              <button
                key={s}
                onClick={() => setStatuses(toggle(metaFilter.statuses, s))}
                style={{ ...chipBase(active), ...colors }}
                aria-pressed={active}
                aria-label={t('filter.statusAria', { name })}
              >
                {s === 'draft' && <span aria-hidden="true">●</span>}
                {s === 'published' && <span aria-hidden="true">✓</span>}
                {s === 'archived' && <span aria-hidden="true">◻</span>}
                {name}
              </button>
            )
          })}
        </>
      )}

      {/* Source chips */}
      {allSources.length > 0 && (
        <>
          <div style={divider} />
          <span style={sectionLabel}>{t('filter.sourceSection')}</span>
          {allSources.map((src) => {
            const active = metaFilter.sources.includes(src)
            const isAI = AI_SOURCES.has(src)
            const colors = active ? sourceStyle(src) : {}
            const name = SOURCE_LABELS[src] ?? src
            return (
              <button
                key={src}
                onClick={() => setSources(toggle(metaFilter.sources, src))}
                style={{ ...chipBase(active), ...colors }}
                aria-pressed={active}
                aria-label={t('filter.sourceAria', { name }) + (isAI ? t('filter.sourceAIHint') : '')}
              >
                {isAI && <SourceIcon source={src} />}
                {name}
                {isAI && active && (
                  <span
                    style={{
                      display: 'inline-block',
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: 'currentColor',
                      opacity: 0.6,
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  />
                )}
              </button>
            )
          })}
        </>
      )}

      {/* 태그 필터는 실사용 가치 낮아 제거 (사용자 피드백). 태그별 그룹 보기는 AllProjectsView 에 유지. */}

      {/* Clear */}
      {isActive && (
        <>
          <div style={divider} />
          <button
            onClick={() => setMetaFilter(DEFAULT_FILTER)}
            style={{
              ...chipBase(false),
              color: 'var(--color-danger)',
              borderColor: 'var(--color-danger)',
              flexShrink: 0,
            }}
            aria-label={t('filter.resetAria')}
          >
            {t('filter.reset')}
          </button>
        </>
      )}
    </div>
  )
}
