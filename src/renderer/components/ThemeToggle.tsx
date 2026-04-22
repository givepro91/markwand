import { useTranslation } from 'react-i18next'
import { IconButton } from './ui'
import type { ThemeType } from '../../../src/preload/types'

interface ThemeToggleProps {
  value: ThemeType
  onChange: (theme: ThemeType) => void
}

const OPTIONS: { value: ThemeType; label: string; ariaKey: string }[] = [
  { value: 'light', label: '☀', ariaKey: 'theme.light' },
  { value: 'dark', label: '☾', ariaKey: 'theme.dark' },
  { value: 'system', label: '⊙', ariaKey: 'theme.system' },
]

export function ThemeToggle({ value, onChange }: ThemeToggleProps) {
  const { t } = useTranslation()
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
      {OPTIONS.map((opt) => {
        const isActive = value === opt.value
        return (
          <IconButton
            key={opt.value}
            aria-label={t(opt.ariaKey)}
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
