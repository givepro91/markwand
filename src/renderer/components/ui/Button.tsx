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
    background: 'var(--accent)',
    color: '#fff',
    borderColor: 'transparent',
  },
  ghost: {
    background: 'transparent',
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
  sm: {
    padding: 'var(--sp-1) var(--sp-3)',
    fontSize: 'var(--fs-sm)',
    height: '24px',
    minWidth: '24px',
  },
  md: {
    padding: 'var(--sp-2) var(--sp-4)',
    fontSize: 'var(--fs-md)',
    height: '32px',
    minWidth: '32px',
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
