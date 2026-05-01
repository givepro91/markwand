import { ReactNode, CSSProperties } from 'react'

export interface ButtonProps {
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  icon?: ReactNode
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
  'aria-label'?: string
  fullWidth?: boolean
}

const variantStyles: Record<NonNullable<ButtonProps['variant']>, CSSProperties> = {
  primary: {
    background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
    color: 'var(--accent-contrast)',
    borderColor: 'transparent',
    boxShadow: '0 6px 16px color-mix(in srgb, var(--accent) 20%, transparent)',
  },
  ghost: {
    background: 'color-mix(in srgb, var(--bg-elev) 72%, transparent)',
    color: 'var(--text)',
    borderColor: 'var(--border)',
  },
  danger: {
    background: 'var(--color-danger-bg)',
    color: 'var(--color-danger)',
    borderColor: 'var(--border)',
  },
}

const sizeStyles: Record<NonNullable<ButtonProps['size']>, CSSProperties> = {
  // v0.4 H5 — WCAG 2.5.8 터치 타겟 최소 24×24px 권장, 실질 28×28px 확보.
  // minHeight 명시로 flex 부모에서 shrink 되는 경우도 방어.
  sm: {
    padding: 'var(--sp-1) var(--sp-3)',
    fontSize: 'var(--fs-sm)',
    height: '28px',
    minWidth: '28px',
    minHeight: '28px',
  },
  md: {
    padding: 'var(--sp-2) var(--sp-4)',
    fontSize: 'var(--fs-md)',
    height: '32px',
    minWidth: '32px',
    minHeight: '32px',
  },
}

// hover는 globals.css의 .ui-btn:hover로 처리 — JS 핸들러 제거(성능).
export function Button({
  variant = 'ghost',
  size = 'md',
  icon,
  children,
  onClick,
  disabled = false,
  type = 'button',
  'aria-label': ariaLabel,
  fullWidth = false,
}: ButtonProps) {
  const baseStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--sp-2)',
    border: '1px solid',
    borderRadius: 'var(--r-md)',
    fontFamily: 'inherit',
    fontWeight: 'var(--fw-medium)' as CSSProperties['fontWeight'],
    lineHeight: 'var(--lh-tight)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    width: fullWidth ? '100%' : undefined,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    ...variantStyles[variant],
    ...sizeStyles[size],
  }

  return (
    <button
      type={type}
      className={`ui-btn ui-btn-${variant}`}
      style={baseStyle}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {icon}
      {children}
    </button>
  )
}
