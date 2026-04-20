import { ReactNode, CSSProperties, memo } from 'react'

interface CardProps {
  children: ReactNode
  interactive?: boolean
  onClick?: () => void
  padding?: 'sm' | 'md' | 'lg'
}

const paddingMap: Record<NonNullable<CardProps['padding']>, string> = {
  sm: 'var(--sp-3)',
  md: 'var(--sp-4)',
  lg: 'var(--sp-6)',
}

// hover는 globals.css의 .ui-card.is-interactive:hover로 처리 — JS 핸들러 제거(성능).
export const Card = memo(function Card({
  children,
  interactive = false,
  onClick,
  padding = 'md',
}: CardProps) {
  const baseStyle: CSSProperties = {
    padding: paddingMap[padding],
  }

  return (
    <div
      className={`ui-card${interactive ? ' is-interactive' : ''}`}
      style={baseStyle}
      onClick={interactive ? onClick : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(e) => {
        if (!interactive) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
    >
      {children}
    </div>
  )
})
