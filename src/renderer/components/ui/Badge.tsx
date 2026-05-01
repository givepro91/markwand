import { ReactNode, CSSProperties } from 'react'

interface BadgeProps {
  children: ReactNode
  variant?: 'default' | 'marker' | 'count' | 'success' | 'danger'
  size?: 'sm' | 'md'
}

const variantStyles: Record<NonNullable<BadgeProps['variant']>, CSSProperties> = {
  default: {
    background: 'var(--badge-bg)',
    color: 'var(--badge-text)',
  },
  marker: {
    background: 'var(--badge-bg)',
    color: 'var(--badge-text)',
    fontFamily: 'var(--font-mono)',
  },
  count: {
    background: 'var(--badge-bg)',
    color: 'var(--badge-text)',
    fontFamily: 'var(--font-mono)',
    borderRadius: 'var(--r-pill)',
  },
  success: {
    background: 'var(--color-success-bg)',
    color: 'var(--color-success)',
  },
  danger: {
    background: 'var(--color-danger-bg)',
    color: 'var(--color-danger)',
  },
}

const sizeStyles: Record<NonNullable<BadgeProps['size']>, CSSProperties> = {
  sm: {
    padding: '1px var(--sp-2)',
    fontSize: 'var(--fs-xs)',
  },
  md: {
    padding: '2px var(--sp-2)',
    fontSize: 'var(--fs-sm)',
  },
}

export function Badge({
  children,
  variant = 'default',
  size = 'md',
}: BadgeProps) {
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--r-pill)',
    border: '1px solid color-mix(in srgb, currentColor 16%, transparent)',
    fontWeight: 'var(--fw-medium)' as CSSProperties['fontWeight'],
    lineHeight: 'var(--lh-tight)',
    whiteSpace: 'nowrap',
    ...variantStyles[variant],
    ...sizeStyles[size],
  }

  return <span style={style}>{children}</span>
}
