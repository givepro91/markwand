import { useTranslation } from 'react-i18next'
import { useAppStore } from '../state/store'
import { Checkbox } from './ui'

interface InboxItemProps {
  path: string
  projectName: string
  title: string
  mtime: number
  isRead: boolean
  onClick: () => void
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

export function InboxItem({ path, projectName, title, mtime, isRead, onClick }: InboxItemProps) {
  const { t } = useTranslation()
  const composerChecked = useAppStore((s) => s.selectedDocPaths.has(path))
  const toggleDocSelection = useAppStore((s) => s.toggleDocSelection)
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-3)',
        padding: 'var(--sp-3) var(--sp-4)',
        cursor: 'pointer',
        borderRadius: 'var(--r-lg)',
        opacity: isRead ? 0.6 : 1,
        transition: 'opacity var(--duration-normal), background var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard)',
        background: composerChecked ? 'var(--color-success-bg)' : 'transparent',
        border: '1px solid transparent',
        width: '100%',
        textAlign: 'left',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => {
        if (!composerChecked)
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-glass)'
        ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        if (!composerChecked)
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
        ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
      }}
    >
      <Checkbox
        checked={composerChecked}
        size="sm"
        stopPropagation
        aria-label={t('fileTree.composerSelectAria', { name: title })}
        onChange={() => toggleDocSelection(path)}
      />
      {/* unread indicator */}
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: isRead ? 'transparent' : 'var(--accent)',
          flexShrink: 0,
        }}
        aria-hidden="true"
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--fs-sm)',
            color: 'var(--text)',
            fontWeight: isRead ? 'var(--fw-normal)' : 'var(--fw-medium)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
          {projectName}
        </div>
      </div>

      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>
        {formatTime(mtime)}
      </span>
    </button>
  )
}
