import { IconButton } from './ui'
import type { ThemeType } from '../../../src/preload/types'

interface ThemeToggleProps {
  value: ThemeType
  onChange: (theme: ThemeType) => void
}

const options: { value: ThemeType; label: string; ariaLabel: string }[] = [
  { value: 'light', label: '☀', ariaLabel: '라이트 모드' },
  { value: 'dark', label: '☾', ariaLabel: '다크 모드' },
  { value: 'system', label: '⊙', ariaLabel: '시스템 설정' },
]

export function ThemeToggle({ value, onChange }: ThemeToggleProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '2px',
        background: 'var(--bg-hover)',
        borderRadius: 'var(--r-md)',
        padding: '2px',
      }}
    >
      {options.map((opt) => {
        const isActive = value === opt.value
        return (
          <IconButton
            key={opt.value}
            aria-label={opt.ariaLabel}
            aria-pressed={isActive}
            size="sm"
            variant={isActive ? 'primary' : 'ghost'}
            onClick={() => onChange(opt.value)}
          >
            <span style={{ fontSize: '16px', lineHeight: 1 }}>
              {opt.label}
            </span>
          </IconButton>
        )
      })}
    </div>
  )
}
