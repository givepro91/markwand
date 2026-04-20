import { useAppStore } from '../state/store'
import { Checkbox } from './ui'
import { DriftBadge } from './DriftBadge'

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
  const composerChecked = useAppStore((s) => s.selectedDocPaths.has(path))
  const toggleDocSelection = useAppStore((s) => s.toggleDocSelection)
  const driftReport = useAppStore((s) => s.driftReports[path])
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-3)',
        padding: 'var(--sp-2) var(--sp-3)',
        cursor: 'pointer',
        borderRadius: 'var(--r-md)',
        opacity: isRead ? 0.6 : 1,
        transition: 'opacity var(--duration-normal), background var(--duration-fast) var(--ease-standard)',
        background: composerChecked ? 'var(--color-success-bg)' : 'transparent',
        border: 'none',
        width: '100%',
        textAlign: 'left',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => {
        if (!composerChecked)
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={(e) => {
        if (!composerChecked)
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
      }}
    >
      <Checkbox
        checked={composerChecked}
        size="sm"
        stopPropagation
        aria-label={`${title} Composer 선택`}
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

      <DriftBadge report={driftReport} />

      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>
        {formatTime(mtime)}
      </span>
    </button>
  )
}
