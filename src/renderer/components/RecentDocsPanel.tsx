import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { classifyAsset } from '../../lib/viewable'
import type { Doc } from '../../preload/types'

interface RecentDocsPanelProps {
  docs: Doc[]
  selectedPath: string | null
  onSelect: (doc: Doc) => void
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const MAX_ITEMS = 10

const ClockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z" />
    <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z" />
  </svg>
)

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 16 16"
    fill="currentColor"
    aria-hidden="true"
    style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
  >
    <path fillRule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z" />
  </svg>
)

function formatRelativeDay(mtime: number, now: number, t: (k: string, p?: Record<string, unknown>) => string): string {
  // 자정 기준 일자 차로 비교 — 23:59 → 00:01 도 "어제" 로 자연스럽게.
  const startOfDay = (ms: number) => {
    const d = new Date(ms)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  const days = Math.floor((startOfDay(now) - startOfDay(mtime)) / (24 * 60 * 60 * 1000))
  // SSH SFTP attrs.mtime=0 / stat 실패로 mtime 이 비정상이 되면 'NaN일 전' 같은 깨진 라벨 방지.
  if (!Number.isFinite(days) || days < 0) return t('projectView.recentDocs.dateToday')
  if (days === 0) return t('projectView.recentDocs.dateToday')
  if (days === 1) return t('projectView.recentDocs.dateYesterday')
  return t('projectView.recentDocs.dateNDaysAgo', { n: days })
}

function formatAbsoluteDate(mtime: number, locale: string): string {
  const d = new Date(mtime)
  return d.toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', {
    month: 'numeric',
    day: 'numeric',
  })
}

const LIST_ID = 'markwand-recent-docs-list'
const TAB_DOCS_ID = 'markwand-recent-tab-docs'
const TAB_IMAGES_ID = 'markwand-recent-tab-images'

type RecentTab = 'docs' | 'images'

export function RecentDocsPanel({ docs, selectedPath, onSelect }: RecentDocsPanelProps) {
  const { t, i18n } = useTranslation()
  // null = 아직 prefs 응답 전(hydration 미완료). 첫 IPC 응답 후 확정 →
  // "펼쳐진 채 잠깐 보이다가 접히는 flash" 또는 그 반대 모두 방지하기 위해
  // hydration 전에는 패널 자체를 렌더하지 않는다 (아래 if (collapsed === null) return null).
  const [collapsed, setCollapsed] = useState<boolean | null>(null)
  // S3 — 마지막 선택 탭 prefs 복원. null 동안은 렌더 보류 → 탭 flash 방지.
  const [activeTab, setActiveTab] = useState<RecentTab | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // v0.4 M9 — 60s setInterval 대신 **다음 자정까지 단일 setTimeout + 재귀 스케줄**.
  // "오늘/어제" 라벨은 자정에만 바뀌므로 매 분 useMemo 재실행 불필요. 전체 docs
  // for-loop × 60 회/시간 부담 제거. 페이지 복귀 시 drift 방지를 위해 마진 100ms.
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined
    const scheduleNextMidnight = () => {
      const next = new Date()
      next.setHours(24, 0, 0, 0)
      const delay = Math.max(1000, next.getTime() - Date.now() + 100)
      timeout = setTimeout(() => {
        setNow(Date.now())
        scheduleNextMidnight()
      }, delay)
    }
    scheduleNextMidnight()
    return () => {
      if (timeout) clearTimeout(timeout)
    }
  }, [])

  // 접힘 상태 + 활성 탭 prefs 복원 (병렬). 응답 실패/미설정 시 기본값(펼침, 'docs').
  useEffect(() => {
    let alive = true
    Promise.all([
      window.api.prefs.get('recentDocsCollapsed').catch(() => undefined),
      window.api.prefs.get('recentDocsTab').catch(() => undefined),
    ]).then(([c, tab]) => {
      if (!alive) return
      setCollapsed(typeof c === 'boolean' ? c : false)
      setActiveTab(tab === 'images' ? 'images' : 'docs')
    })
    return () => { alive = false }
  }, [])

  const { recentDocs, recentImages } = useMemo(() => {
    const cutoff = now - SEVEN_DAYS_MS
    const rd: Doc[] = []
    const ri: Doc[] = []
    for (const d of docs) {
      if (d.mtime < cutoff) continue
      const kind = classifyAsset(d.path)
      if (kind === 'md') rd.push(d)
      else if (kind === 'image') ri.push(d)
    }
    rd.sort((a, b) => b.mtime - a.mtime)
    ri.sort((a, b) => b.mtime - a.mtime)
    return { recentDocs: rd, recentImages: ri }
  }, [docs, now])

  const currentList = activeTab === 'images' ? recentImages : recentDocs
  const visible = currentList.slice(0, MAX_ITEMS)
  const overflow = currentList.length - visible.length

  const selectTab = useCallback((tab: RecentTab) => {
    setActiveTab(tab)
    window.api.prefs.set('recentDocsTab', tab).catch(() => undefined)
  }, [])

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = prev === null ? true : !prev
      window.api.prefs.set('recentDocsCollapsed', next).catch(() => undefined)
      return next
    })
  }, [])

  // hydration 미완료 — flash 방지를 위해 prefs 응답 전엔 아예 렌더하지 않는다.
  if (collapsed === null || activeTab === null) return null
  // 양 탭 모두 비어있을 때만 섹션 자체를 숨긴다. 한쪽만 있으면 탭 전환으로 탐색 가능.
  if (recentDocs.length === 0 && recentImages.length === 0) return null

  return (
    <div
      style={{
        flexShrink: 0,
        background: 'var(--bg)',
        borderTop: '1px solid var(--border)',
        borderBottom: '2px solid var(--border)',
      }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls={LIST_ID}
        aria-label={collapsed ? t('projectView.recentDocs.expandAria') : t('projectView.recentDocs.collapseAria')}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-2)',
          padding: 'var(--sp-2) var(--sp-3)',
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          fontSize: 'var(--fs-xs)',
          fontWeight: 'var(--fw-semibold)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <ChevronIcon open={!collapsed} />
        <ClockIcon />
        <span style={{ flex: 1 }}>{t('projectView.recentDocs.title')}</span>
        <span
          style={{
            fontSize: 'var(--fs-xs)',
            color: 'var(--text-muted)',
            background: 'var(--bg-elev)',
            padding: '0 var(--sp-2)',
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--border)',
          }}
        >
          {recentDocs.length + recentImages.length}
        </span>
      </button>

      {!collapsed && (
        <>
          <div
            role="tablist"
            aria-label={t('projectView.recentDocs.tablistAria')}
            style={{
              display: 'flex',
              gap: '2px',
              padding: '0 var(--sp-3) var(--sp-1) var(--sp-3)',
            }}
          >
            {([
              { id: 'docs' as RecentTab, labelKey: 'projectView.recentDocs.tabDocs', count: recentDocs.length, panelId: LIST_ID, tabId: TAB_DOCS_ID },
              { id: 'images' as RecentTab, labelKey: 'projectView.recentDocs.tabImages', count: recentImages.length, panelId: LIST_ID, tabId: TAB_IMAGES_ID },
            ]).map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  id={tab.tabId}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  aria-controls={tab.panelId}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => selectTab(tab.id)}
                  onKeyDown={(e) => {
                    // WAI-ARIA Tabs 키보드 패턴 — ArrowLeft/Right 로 탭 전환 + 포커스 이동.
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                      e.preventDefault()
                      const next: RecentTab = activeTab === 'docs' ? 'images' : 'docs'
                      selectTab(next)
                      const nextId = next === 'docs' ? TAB_DOCS_ID : TAB_IMAGES_ID
                      document.getElementById(nextId)?.focus()
                    }
                  }}
                  style={{
                    padding: 'var(--sp-1) var(--sp-2)',
                    border: 'none',
                    borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                    background: 'transparent',
                    color: isActive ? 'var(--text)' : 'var(--text-muted)',
                    fontSize: 'var(--fs-xs)',
                    fontWeight: isActive ? 'var(--fw-semibold)' : 'var(--fw-normal)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--sp-1)',
                  }}
                >
                  <span>{t(tab.labelKey)}</span>
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      background: isActive ? 'var(--bg-elev)' : 'transparent',
                      padding: '0 4px',
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    {tab.count}
                  </span>
                </button>
              )
            })}
          </div>
          <ul
            id={LIST_ID}
            role="tabpanel"
            aria-labelledby={activeTab === 'images' ? TAB_IMAGES_ID : TAB_DOCS_ID}
            style={{
              listStyle: 'none',
              margin: 0,
              padding: '0 0 var(--sp-2) 0',
              maxHeight: '40vh',
              overflowY: 'auto',
            }}
          >
            {visible.length === 0 && (
              <li
                style={{
                  padding: 'var(--sp-2) var(--sp-3)',
                  fontSize: 'var(--fs-xs)',
                  color: 'var(--text-muted)',
                  fontStyle: 'italic',
                }}
              >
                {t(activeTab === 'images' ? 'projectView.recentDocs.emptyImages' : 'projectView.recentDocs.emptyDocs')}
              </li>
            )}
            {visible.map((doc) => {
            const isActive = doc.path === selectedPath
            const relative = formatRelativeDay(doc.mtime, now, t)
            const absolute = formatAbsoluteDate(doc.mtime, i18n.language)
            return (
              <li key={doc.path}>
                <button
                  type="button"
                  onClick={() => onSelect(doc)}
                  aria-label={t('projectView.recentDocs.openAria', { name: doc.name, when: relative })}
                  aria-current={isActive ? 'true' : undefined}
                  title={`${doc.name}\n${absolute}`}
                  className="recent-doc-item"
                  data-active={isActive ? 'true' : undefined}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--sp-2)',
                    padding: 'var(--sp-1) var(--sp-3)',
                    background: isActive ? 'var(--accent-soft, var(--bg-elev))' : 'transparent',
                    border: 'none',
                    borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                    color: isActive ? 'var(--text)' : 'var(--text)',
                    fontSize: 'var(--fs-sm)',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: isActive ? 'var(--fw-semibold)' : 'var(--fw-normal)',
                    }}
                  >
                    {doc.name}
                  </span>
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 'var(--fs-xs)',
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                      // v0.4 M9 — 상대일 라벨("오늘/어제/N일 전") 가변 폭으로 인한 좌측 레이아웃 CLS 차단.
                      minWidth: '5ch',
                      textAlign: 'right',
                    }}
                  >
                    {relative}
                  </span>
                </button>
              </li>
            )
          })}
            {overflow > 0 && (
              <li
                style={{
                  padding: 'var(--sp-1) var(--sp-3)',
                  fontSize: 'var(--fs-xs)',
                  color: 'var(--text-muted)',
                  fontStyle: 'italic',
                }}
              >
                {t('projectView.recentDocs.moreCount', { count: overflow })}
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  )
}
