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

export function RecentDocsPanel({ docs, selectedPath, onSelect }: RecentDocsPanelProps) {
  const { t, i18n } = useTranslation()
  // null = 아직 prefs 응답 전(hydration 미완료). 첫 IPC 응답 후 boolean 으로 확정 →
  // "펼쳐진 채 잠깐 보이다가 접히는 flash" 또는 그 반대 모두 방지하기 위해
  // hydration 전에는 패널 자체를 렌더하지 않는다 (아래 if (collapsed === null) return null).
  const [collapsed, setCollapsed] = useState<boolean | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // 분 단위로 now 갱신 — 자정 경계에서 "오늘/어제" 라벨 자동 갱신.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  // 접힘 상태 prefs 복원 (1회). 응답이 없거나 실패하면 기본값(false=펼침) 으로 확정.
  useEffect(() => {
    let alive = true
    window.api.prefs.get('recentDocsCollapsed')
      .then((v) => {
        if (!alive) return
        setCollapsed(typeof v === 'boolean' ? v : false)
      })
      .catch(() => {
        if (alive) setCollapsed(false)
      })
    return () => { alive = false }
  }, [])

  const recent = useMemo(() => {
    const cutoff = now - SEVEN_DAYS_MS
    return docs
      .filter((d) => d.mtime >= cutoff && classifyAsset(d.path) === 'md')
      .sort((a, b) => b.mtime - a.mtime)
  }, [docs, now])

  const visible = recent.slice(0, MAX_ITEMS)
  const overflow = recent.length - visible.length

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = prev === null ? true : !prev
      window.api.prefs.set('recentDocsCollapsed', next).catch(() => undefined)
      return next
    })
  }, [])

  // hydration 미완료 — flash 방지를 위해 prefs 응답 전엔 아예 렌더하지 않는다.
  if (collapsed === null) return null
  // 빈 상태일 때는 섹션 자체를 숨겨 시각 노이즈를 줄인다.
  if (recent.length === 0) return null

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
          {recent.length}
        </span>
      </button>

      {!collapsed && (
        <ul
          id={LIST_ID}
          role="list"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: '0 0 var(--sp-2) 0',
            maxHeight: '40vh',
            overflowY: 'auto',
          }}
        >
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
      )}
    </div>
  )
}
