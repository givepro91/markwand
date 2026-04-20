import { CSSProperties } from 'react'

export interface GaugeProps {
  value: number
  max: number // 게이지 풀스케일 기준
  warn?: number // 노랑 임계 (기본 max*0.8)
  crit?: number // 빨강 임계 (기본 max)
  label?: string
  width?: number // 가로 px. 기본 160.
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

export function Gauge({
  value,
  max,
  warn,
  crit,
  label,
  width = 160,
}: GaugeProps) {
  const warnAt = warn ?? max * 0.8
  const critAt = crit ?? max

  let color = 'var(--color-success)'
  let bg = 'var(--color-success-bg)'
  if (value >= critAt) {
    color = 'var(--color-danger)'
    bg = 'var(--color-danger-bg)'
  } else if (value >= warnAt) {
    color = 'var(--color-warning)'
    bg = 'var(--color-warning-bg)'
  }

  const pct = Math.min(100, (value / max) * 100)
  const displayLabel = label ?? `${formatCompact(value)} / ${formatCompact(max)}`

  const container: CSSProperties = {
    display: 'inline-flex',
    flexDirection: 'column',
    gap: 'var(--sp-1)',
    width,
  }
  const track: CSSProperties = {
    height: 6,
    background: bg,
    borderRadius: 'var(--r-pill)',
    overflow: 'hidden',
    position: 'relative',
  }
  const fill: CSSProperties = {
    height: '100%',
    width: `${pct}%`,
    background: color,
    borderRadius: 'var(--r-pill)',
    transition: 'width var(--duration-fast) var(--ease-standard), background var(--duration-fast) var(--ease-standard)',
  }
  const labelStyle: CSSProperties = {
    fontSize: 'var(--fs-xs)',
    color: 'var(--text-muted)',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }

  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={displayLabel}
      style={container}
    >
      <div style={track}>
        <div style={fill} />
      </div>
      <div style={labelStyle}>{displayLabel}</div>
    </div>
  )
}
