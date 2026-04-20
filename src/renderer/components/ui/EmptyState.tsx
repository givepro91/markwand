import { ReactNode, CSSProperties } from 'react'
import { Button } from './Button'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  cta?: { label: string; onClick: () => void; variant?: 'primary' | 'ghost' }
  size?: 'sm' | 'md' | 'lg'
}

const iconSizeMap: Record<NonNullable<EmptyStateProps['size']>, string> = {
  sm: '32px',
  md: '48px',
  lg: '64px',
}

export function EmptyState({
  icon,
  title,
  description,
  cta,
  size = 'md',
}: EmptyStateProps) {
  const iconSize = iconSizeMap[size]

  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: 'var(--sp-8)',
    gap: 'var(--sp-3)',
  }

  const iconStyle: CSSProperties = {
    width: iconSize,
    height: iconSize,
    fontSize: iconSize,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-muted)',
    lineHeight: 1,
  }

  const titleStyle: CSSProperties = {
    fontSize: 'var(--fs-lg)',
    fontWeight: 'var(--fw-semibold)' as CSSProperties['fontWeight'],
    color: 'var(--text)',
    lineHeight: 'var(--lh-tight)',
  }

  const descriptionStyle: CSSProperties = {
    fontSize: 'var(--fs-md)',
    color: 'var(--text-muted)',
    lineHeight: 'var(--lh-normal)',
    maxWidth: '320px',
  }

  return (
    <div style={containerStyle}>
      {icon && <div style={iconStyle}>{icon}</div>}
      <p style={titleStyle}>{title}</p>
      {description && <p style={descriptionStyle}>{description}</p>}
      {cta && (
        <Button variant={cta.variant ?? 'ghost'} onClick={cta.onClick}>
          {cta.label}
        </Button>
      )}
    </div>
  )
}
