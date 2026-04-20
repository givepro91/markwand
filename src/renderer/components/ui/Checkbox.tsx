import { CSSProperties, KeyboardEvent, MouseEvent } from 'react'

export interface CheckboxProps {
  checked: boolean
  onChange: (next: boolean) => void
  size?: 'sm' | 'md'
  disabled?: boolean
  'aria-label'?: string
  // 트리 노드 등에서 이벤트 버블이 상위 핸들러(노드 선택)로 퍼지지 않도록 차단해야 할 때.
  stopPropagation?: boolean
}

const sizeBox: Record<NonNullable<CheckboxProps['size']>, number> = {
  sm: 14,
  md: 16,
}

export function Checkbox({
  checked,
  onChange,
  size = 'md',
  disabled = false,
  'aria-label': ariaLabel,
  stopPropagation = false,
}: CheckboxProps) {
  const box = sizeBox[size]

  const toggle = () => {
    if (disabled) return
    onChange(!checked)
  }

  const handleClick = (e: MouseEvent) => {
    if (stopPropagation) e.stopPropagation()
    toggle()
  }

  const handleKey = (e: KeyboardEvent) => {
    if (disabled) return
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      if (stopPropagation) e.stopPropagation()
      toggle()
    }
  }

  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: `${box}px`,
    height: `${box}px`,
    borderRadius: 'var(--r-sm)',
    border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
    background: checked ? 'var(--accent)' : 'var(--bg)',
    color: '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    flexShrink: 0,
    transition: 'background var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard)',
  }

  return (
    <span
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={handleKey}
      style={style}
    >
      {checked && (
        <svg width={box - 4} height={box - 4} viewBox="0 0 14 14" fill="none" aria-hidden>
          <path
            d="M3 7.5L6 10.5L11 4.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  )
}
