import { ReactNode, CSSProperties, AriaRole } from 'react'

interface StatusMessageProps {
  variant: 'info' | 'loading' | 'error' | 'success'
  children: ReactNode
  inline?: boolean
}

const variantStyles: Record<StatusMessageProps['variant'], CSSProperties> = {
  info: {
    color: 'var(--text-muted)',
  },
  loading: {
    color: 'var(--text-muted)',
  },
  error: {
    color: 'var(--color-danger)',
    background: 'var(--color-danger-bg)',
  },
  success: {
    color: 'var(--color-success)',
  },
}

const variantRole: Record<StatusMessageProps['variant'], AriaRole> = {
  info: 'status',
  loading: 'status',
  success: 'status',
  error: 'alert',
}

const variantAriaLive: Record<StatusMessageProps['variant'], 'polite' | 'assertive'> = {
  info: 'polite',
  loading: 'polite',
  success: 'polite',
  error: 'assertive',
}

export function StatusMessage({
  variant,
  children,
  inline = false,
}: StatusMessageProps) {
  const isBlock = !inline

  const style: CSSProperties = {
    display: inline ? 'inline-flex' : 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    fontSize: 'var(--fs-md)',
    lineHeight: 'var(--lh-normal)',
    ...(isBlock && variant === 'error'
      ? { padding: 'var(--sp-3) var(--sp-4)', borderRadius: 'var(--r-md)' }
      : {}),
    ...variantStyles[variant],
  }

  const Tag = inline ? 'span' : 'div'

  return (
    <Tag style={style} role={variantRole[variant]} aria-live={variantAriaLive[variant]}>
      {variant === 'loading' && (
        <span className="ui-spinner" aria-hidden="true" />
      )}
      {children}
    </Tag>
  )
}
