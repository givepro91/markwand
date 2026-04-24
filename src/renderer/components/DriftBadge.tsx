import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../state/store'
import type { DriftReport } from '../../preload/types'

interface DriftBadgeProps {
  report: DriftReport | undefined
  compact?: boolean
}

/**
 * 문서의 drift 상태 배지.
 * - report 없음 / ignored 제외 후 missing+stale === 0 → 렌더링 안 함
 * - missing > 0 → 빨간 칩, stale > 0 → 앰버 칩 (독립 표기)
 */
export const DriftBadge = memo(function DriftBadge({ report, compact = false }: DriftBadgeProps) {
  const { t } = useTranslation()
  const ignoredArr = useAppStore((s) => (report ? s.ignoredDriftRefs[report.docPath] : undefined))

  const counts = useMemo(() => {
    if (!report) return { missing: 0, stale: 0 }
    const ignored = new Set(ignoredArr ?? [])
    if (ignored.size === 0) return { missing: report.counts.missing, stale: report.counts.stale }
    let missing = 0
    let stale = 0
    for (const r of report.references) {
      if (ignored.has(r.resolvedPath)) continue
      if (r.status === 'missing') missing++
      else if (r.status === 'stale') stale++
    }
    return { missing, stale }
  }, [report, ignoredArr])

  if (!report) return null
  const { missing, stale } = counts
  if (missing === 0 && stale === 0) return null

  const parts: Array<{ label: string; color: string; bg: string; title: string }> = []
  if (missing > 0) {
    parts.push({
      label: compact ? `${missing}` : `${missing} missing`,
      color: 'var(--color-danger)',
      bg: 'var(--color-danger-bg)',
      title: t('drift.badgeMissingTitle', { count: missing }),
    })
  }
  if (stale > 0) {
    parts.push({
      label: compact ? `${stale}` : `${stale} stale`,
      color: 'var(--color-warning)',
      bg: 'var(--color-warning-bg)',
      title: t('drift.badgeStaleTitle', { count: stale }),
    })
  }

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={t('drift.badgeAria')}
      style={{ display: 'inline-flex', gap: '4px', flexShrink: 0 }}
    >
      {parts.map((p, i) => (
        <span
          key={i}
          title={p.title}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: 'var(--fs-xs)',
            fontWeight: 'var(--fw-medium)',
            padding: '1px 6px',
            borderRadius: '10px',
            background: p.bg,
            color: p.color,
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
          }}
        >
          {p.label}
        </span>
      ))}
    </span>
  )
})
