// TransportBadge — Plan §S2.5 (DC-3 단일 표시 컴포넌트).
// status 3종(connected/connecting/offline) + aria-live polite + 색외 2차 표식(아이콘+라벨).
// CSS 토큰: --ok-bg/--warn-bg/--danger-bg (tokens.css 에서 정의 필요 — WCAG 1.4.11 ≥3:1).

import { memo } from 'react'
import type { CSSProperties } from 'react'
import { useTransportStatus } from '../hooks/useTransportStatus'

interface TransportBadgeProps {
  workspaceId: string | null
  /** 인라인 스타일 override (위치·간격 조정용) */
  style?: CSSProperties
}

const MAP = {
  connected: { icon: '✓', label: 'Connected', bgVar: '--ok-bg', fgVar: '--ok-fg' },
  connecting: { icon: '⏳', label: 'Connecting', bgVar: '--warn-bg', fgVar: '--warn-fg' },
  offline: { icon: '⚠', label: 'Offline', bgVar: '--danger-bg', fgVar: '--danger-fg' },
} as const

export const TransportBadge = memo(function TransportBadge({
  workspaceId,
  style,
}: TransportBadgeProps) {
  const { status, event, liveMessage } = useTransportStatus(workspaceId)

  // idle(local or 비활성) → UI 미표시
  if (status === 'idle') return null

  const cfg = MAP[status]
  const label = event?.label
  const containerStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-1)',
    padding: 'var(--sp-1) var(--sp-2)',
    borderRadius: 'var(--r-sm)',
    fontSize: 'var(--fs-xs)',
    fontWeight: 'var(--fw-medium)' as CSSProperties['fontWeight'],
    background: `var(${cfg.bgVar})`,
    color: `var(${cfg.fgVar})`,
    whiteSpace: 'nowrap',
    ...style,
  }

  return (
    <>
      <span
        data-transport-status={status}
        role="status"
        aria-atomic="true"
        aria-label={`Transport ${cfg.label}${label ? `: ${label}` : ''}`}
        style={containerStyle}
      >
        <span aria-hidden="true">{cfg.icon}</span>
        <span>{cfg.label}</span>
        {status === 'connected' && label ? (
          <span style={{ fontWeight: 'normal', opacity: 0.85 }}> · {label}</span>
        ) : null}
      </span>
      {/* aria-live 전파 — debounce 된 메시지만 낭독. */}
      <span
        aria-live="polite"
        aria-atomic="true"
        role="status"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {liveMessage}
      </span>
    </>
  )
})
