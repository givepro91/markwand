import { memo } from 'react'
import type { DriftReport } from '../../preload/types'

interface DriftBadgeProps {
  report: DriftReport | undefined
  compact?: boolean // true면 카운트 숫자만, false면 '2 missing · 1 stale'
}

/**
 * 문서의 drift 상태 배지.
 * 표시 규칙:
 *   - report 없음(검증 전/참조 없음) → 렌더링 안 함
 *   - missing + stale === 0 → 렌더링 안 함 (ok는 무음)
 *   - missing > 0 → 빨간 칩 "N missing"
 *   - stale > 0 (missing 0) → 앰버 칩 "N stale"
 *   - 둘 다 있으면 둘 다 표시
 */
export const DriftBadge = memo(function DriftBadge({ report, compact = false }: DriftBadgeProps) {
  if (!report) return null
  const { missing, stale } = report.counts
  if (missing === 0 && stale === 0) return null

  const parts: Array<{ label: string; color: string; bg: string; title: string }> = []
  if (missing > 0) {
    parts.push({
      label: compact ? `${missing}` : `${missing} missing`,
      color: 'var(--color-danger-fg, #b42318)',
      bg: 'var(--color-danger-bg, #fee4e2)',
      title: `${missing}개 참조 파일이 존재하지 않음`,
    })
  }
  if (stale > 0) {
    parts.push({
      label: compact ? `${stale}` : `${stale} stale`,
      color: 'var(--color-warning-fg, #b54708)',
      bg: 'var(--color-warning-bg, #fef0c7)',
      title: `${stale}개 참조 파일이 문서 이후 수정됨 — 내용 재확인 필요`,
    })
  }

  return (
    <span
      aria-label="drift 상태"
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
