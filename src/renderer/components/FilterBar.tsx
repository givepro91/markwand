import { useState, useEffect, CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore, type MetaFilter, type UpdatedRange } from '../state/store'
import { useFrontmatterIndex } from '../hooks/useDocs'
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

const STATUS_LABEL_KEYS: Record<string, string> = {
  draft: 'filter.statusDraft',
  published: 'filter.statusPublished',
  archived: 'filter.statusArchived',
}

const SOURCE_LABEL_KEYS: Record<string, string> = {
  claude: 'filter.sourceClaude',
  codex: 'filter.sourceCodex',
  design: 'filter.sourceDesign',
  review: 'filter.sourceReview',
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
    background: active ? 'linear-gradient(135deg, var(--accent), var(--accent-hover))' : 'transparent',
    color: active ? 'var(--accent-contrast)' : 'var(--text-muted)',
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

export function FilterBar({ docs: _docs }: FilterBarProps) {
  const { t } = useTranslation()
  const metaFilter = useAppStore((s) => s.metaFilter)
  const setMetaFilter = useAppStore((s) => s.setMetaFilter)

  // 접기 상태 — prefs 에서 복원. undefined(첫 실행)이면 기본 접힘.
  const [collapsed, setCollapsed] = useState(true)
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  useEffect(() => {
    window.api.prefs.get('filterBarCollapsed').then((v) => {
      // 명시적으로 false 가 저장된 경우만 펼침. undefined/null/true → 접힘.
      if (v === false) setCollapsed(false)
      setPrefsLoaded(true)
    })
  }, [])

  // M8: store frontmatterIndex 구독 — docs 전체 for-loop 제거
  const { statuses: allStatuses, sources: allSources } = useFrontmatterIndex()

  const isActive =
    metaFilter.statuses.length > 0 ||
    metaFilter.sources.length > 0 ||
    metaFilter.updatedRange !== 'all'

  if (!isActive && allStatuses.length === 0 && allSources.length === 0) {
    return null
  }

  // 활성 칩 count (기간 + 상태 + 출처)
  const activeCount =
    (metaFilter.updatedRange !== 'all' ? 1 : 0) +
    metaFilter.statuses.length +
    metaFilter.sources.length

  function setRange(r: UpdatedRange) {
    setMetaFilter({ ...metaFilter, updatedRange: r })
  }

  function setStatuses(statuses: string[]) {
    setMetaFilter({ ...metaFilter, statuses })
  }

  function setSources(sources: string[]) {
    setMetaFilter({ ...metaFilter, sources })
  }

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    window.api.prefs.set('filterBarCollapsed', next).catch(() => {})
  }

  const containerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    padding: 'var(--sp-3) var(--sp-4)',
    borderBottom: '1px solid var(--border-muted)',
    background: 'var(--surface-glass)',
    backdropFilter: 'blur(14px)',
    boxShadow: 'var(--shadow-sm)',
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

  const toggleBtnStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-1)',
    padding: '2px var(--sp-2)',
    fontSize: 'var(--fs-xs)',
    fontWeight: isActive
      ? ('var(--fw-semibold)' as CSSProperties['fontWeight'])
      : ('var(--fw-normal)' as CSSProperties['fontWeight']),
    lineHeight: 'var(--lh-tight)',
    borderRadius: 'var(--r-pill)',
    border: isActive ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as CSSProperties['whiteSpace'],
    background: isActive ? 'linear-gradient(135deg, var(--accent), var(--accent-hover))' : 'var(--bg-elev)',
    color: isActive ? 'var(--accent-contrast, #fff)' : 'var(--text-muted)',
    outline: 'none',
    flexShrink: 0,
  }

  const badgeStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '16px',
    height: '16px',
    padding: '0 4px',
    fontSize: '10px',
    fontWeight: 'var(--fw-semibold)' as CSSProperties['fontWeight'],
    lineHeight: 1,
    borderRadius: '8px',
    background: 'var(--accent)',
    color: 'var(--accent-contrast, #fff)',
  }

  // prefs 로드 전 기본 접힘 렌더 (flash 방지 — state 초기값이 true 이므로 일치)
  const isCollapsed = !prefsLoaded ? true : collapsed

  if (isCollapsed) {
    return (
      <div style={containerStyle} role="toolbar" aria-label={t('filter.toolbarAria')}>
        {/* 접힘 상태: 토글 버튼 + 배지 + 리셋 */}
        <button
          onClick={toggleCollapsed}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggleCollapsed()
            }
          }}
          style={toggleBtnStyle}
          aria-expanded={false}
          aria-label={t('filterBar.filterToggle')}
          data-testid="filter-toggle-btn"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <path d="M1 2.5h10M3 6h6M5 9.5h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
          </svg>
          {t('filterBar.filterLabel')}
          {activeCount > 0 && (
            <span style={badgeStyle} aria-label={t('filterBar.activeCount', { count: activeCount })}>
              {activeCount}
            </span>
          )}
        </button>
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

  return (
    <div style={containerStyle} role="toolbar" aria-label={t('filter.toolbarAria')}>
      {/* 펼침 상태: 접기 토글 버튼 + 기존 전체 UI */}
      <button
        onClick={toggleCollapsed}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggleCollapsed()
          }
        }}
        style={toggleBtnStyle}
        aria-expanded={true}
        aria-label={t('filterBar.filterToggle')}
        data-testid="filter-toggle-btn"
      >
        <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <path d="M1 2.5h10M3 6h6M5 9.5h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        </svg>
        {t('filterBar.filterLabel')}
        {activeCount > 0 && (
          <span style={badgeStyle} aria-label={t('filterBar.activeCount', { count: activeCount })}>
            {activeCount}
          </span>
        )}
      </button>

      <div style={divider} />

      {/* Updated range */}
      <span style={sectionLabel}>{t('filter.rangeSection')}</span>
      <div
        style={{
          display: 'inline-flex',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-pill)',
          background: 'var(--bg-elev)',
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
            const name = STATUS_LABEL_KEYS[s] ? t(STATUS_LABEL_KEYS[s]) : s
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
            const name = SOURCE_LABEL_KEYS[src] ? t(SOURCE_LABEL_KEYS[src]) : src
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
