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

export function InboxItem({ projectName, title, mtime, isRead, onClick }: InboxItemProps) {
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
        background: 'transparent',
        border: 'none',
        width: '100%',
        textAlign: 'left',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
      }}
    >
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
