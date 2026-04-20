import { CSSProperties } from 'react'

interface ComposerChipProps {
  absPath: string
  onRemove: () => void
}

// 절대 경로에서 "parent/filename.md" 형태로 축약
function displayName(absPath: string): string {
  const parts = absPath.split('/').filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
  }
  return parts[parts.length - 1] ?? absPath
}

export function ComposerChip({ absPath, onRemove }: ComposerChipProps) {
  const label = displayName(absPath)
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-1)',
    padding: '2px 8px',
    background: 'var(--bg)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-pill)',
    fontSize: 'var(--fs-xs)',
    fontVariantNumeric: 'tabular-nums',
    maxWidth: 240,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flexShrink: 0,
  }
  return (
    <span style={style} title={absPath}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        aria-label={`${label} 제거`}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          padding: '0 2px',
          fontSize: 'var(--fs-sm)',
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </span>
  )
}
