import { ReactNode, CSSProperties } from 'react'

interface IconButtonProps {
  'aria-label': string
  'aria-pressed'?: boolean
  children: ReactNode
  variant?: 'ghost' | 'primary'
  size?: 'sm' | 'md'
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
  /** Native HTML title — hover tooltip. aria-label 만으로는 마우스 사용자가 인지 어려운 IconButton 의 가시성 보강용. */
  title?: string
}

const sizeMap: Record<NonNullable<IconButtonProps['size']>, string> = {
  sm: '24px',
  md: '32px',
}

const variantStyles: Record<NonNullable<IconButtonProps['variant']>, CSSProperties> = {
  ghost: {
    background: 'transparent',
    color: 'var(--text)',
    borderColor: 'transparent',
  },
  primary: {
    background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
    color: 'var(--accent-contrast)',
    borderColor: 'transparent',
  },
}

export function IconButton({
  'aria-label': ariaLabel,
  'aria-pressed': ariaPressed,
  children,
  variant = 'ghost',
  size = 'md',
  onClick,
  disabled = false,
  type = 'button',
  title,
}: IconButtonProps) {
  const dimension = sizeMap[size]

  const baseStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: dimension,
    height: dimension,
    border: '1px solid',
    borderRadius: 'var(--r-md)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-md)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: `background var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard)`,
    padding: 0,
    flexShrink: 0,
    ...variantStyles[variant],
  }

  return (
    <button
      type={type}
      style={baseStyle}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      title={title}
      onMouseEnter={(e) => {
        if (disabled) return
        const el = e.currentTarget
        if (variant === 'primary') {
          el.style.background = 'var(--accent-hover)'
          el.style.boxShadow = '0 8px 20px color-mix(in srgb, var(--accent) 22%, transparent)'
        } else {
          el.style.background = 'var(--surface-glass)'
        }
        el.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        if (disabled) return
        const el = e.currentTarget
        el.style.background = variantStyles[variant].background as string
        el.style.boxShadow = 'none'
        el.style.transform = 'translateY(0)'
      }}
    >
      {children}
    </button>
  )
}
