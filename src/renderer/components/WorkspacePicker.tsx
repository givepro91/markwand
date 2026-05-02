import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button, IconButton } from './ui'
import { WorkspaceManageModal } from './WorkspaceManageModal'
import type { Workspace } from '../../../src/preload/types'

const GearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path
      fillRule="evenodd"
      d="M7.429 1.525a6.593 6.593 0 0 1 1.142 0c.036.003.108.036.137.146l.289 1.105c.147.56.55.967.997 1.189.174.086.341.18.501.28.45.287.99.332 1.522.055l1.002-.526a.144.144 0 0 1 .181.044c.196.252.37.52.521.803.152.284.274.578.365.882a.145.145 0 0 1-.083.172l-.993.438c-.49.216-.783.63-.79 1.083-.003.18-.012.358-.028.534-.034.389.157.82.548 1.039l.99.545a.144.144 0 0 1 .065.18 6.593 6.593 0 0 1-.572 1.686c-.069.14-.185.145-.258.137l-1.098-.29c-.56-.147-.967.155-1.189.601-.086.174-.18.341-.28.501-.287.45-.332.99-.055 1.521l.526 1.003a.144.144 0 0 1-.044.181 6.593 6.593 0 0 1-1.686.572.145.145 0 0 1-.172-.083l-.438-.993c-.216-.49-.63-.783-1.083-.79a7.143 7.143 0 0 1-.534-.028c-.389-.034-.82.157-1.039.547l-.545.991a.145.145 0 0 1-.18.065 6.593 6.593 0 0 1-1.686-.572.145.145 0 0 1-.063-.196l.529-1.006c.272-.518.23-1.058-.057-1.507a6.192 6.192 0 0 1-.28-.502c-.223-.447-.629-.749-1.19-.896l-1.098-.29a.145.145 0 0 1-.105-.16 6.593 6.593 0 0 1 .572-1.686c.07-.14.185-.145.258-.137l1.098.29c.56.147.968-.155 1.19-.601.086-.174.18-.341.28-.501.287-.45.332-.99.055-1.522l-.526-1.002a.144.144 0 0 1 .044-.181c.252-.196.52-.37.803-.521.284-.152.578-.274.882-.365a.145.145 0 0 1 .172.083l.438.993c.216.49.63.783 1.083.79.18.003.358.012.534.028.389.034.82-.157 1.039-.548l.545-.99a.145.145 0 0 1 .18-.066ZM8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"
      clipRule="evenodd"
    />
  </svg>
)

interface WorkspacePickerProps {
  workspaces: Workspace[]
  activeId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
  /**
   * Follow-up FS2 — experimentalFeatures.sshTransport flag on 일 때만 "+ 원격 서버(SSH) 추가" 옵션 노출.
   * flag off 시 DOM 에서 완전 제거(disabled 아님 — Plan S3.1 결정 준수).
   */
  onAddSsh?: () => void
  experimentalSsh?: boolean
  onRemove: (id: string) => Promise<void>
}

function workspaceLabel(workspace: Workspace): string {
  if (workspace.transport?.type !== 'ssh') return workspace.name
  const segments = workspace.root.split('/').filter((s) => s.length > 0)
  const projectName = segments[segments.length - 1] ?? workspace.root
  return `🌐 ${workspace.name} / ${projectName}`
}

const menuItemStyle: CSSProperties = {
  width: '100%',
  border: 0,
  borderRadius: 'var(--r-md)',
  background: 'transparent',
  color: 'var(--text)',
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr)',
  alignItems: 'center',
  gap: 'var(--sp-2)',
  padding: 'var(--sp-2) var(--sp-3)',
  fontFamily: 'inherit',
  fontSize: 'var(--fs-sm)',
  textAlign: 'left',
  cursor: 'pointer',
}

function WorkspaceMenuAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...menuItemStyle,
        gridTemplateColumns: 'minmax(0, 1fr)',
        fontWeight: 'var(--fw-semibold)' as CSSProperties['fontWeight'],
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>+ {label.replace(/^\+\s*/, '')}</span>
    </button>
  )
}

function WorkspaceMenuGroup({
  label,
  workspaces,
  activeId,
  onSelect,
}: {
  label: string
  workspaces: Workspace[]
  activeId: string | null
  onSelect: (id: string) => void
}) {
  if (workspaces.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', paddingBottom: 'var(--sp-2)' }}>
      <div style={{ padding: 'var(--sp-1) var(--sp-3)', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-semibold)' }}>
        {label}
      </div>
      {workspaces.map((workspace) => {
        const active = workspace.id === activeId
        return (
          <button
            key={workspace.id}
            type="button"
            role="option"
            aria-selected={active}
            onClick={() => onSelect(workspace.id)}
            style={{
              ...menuItemStyle,
              background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--text-muted)',
              fontWeight: active ? 'var(--fw-semibold)' : 'var(--fw-medium)',
            }}
          >
            <span aria-hidden="true" style={{ color: active ? 'var(--accent)' : 'transparent' }}>✓</span>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {workspaceLabel(workspace)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function WorkspacePicker({
  workspaces,
  activeId,
  onSelect,
  onAdd,
  onAddSsh,
  experimentalSsh = false,
  onRemove,
}: WorkspacePickerProps) {
  const { t } = useTranslation()
  const [showManage, setShowManage] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)

  const syncMenuPosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    setMenuPosition({
      top: Math.round(rect.bottom + 8),
      left: Math.round(rect.left),
    })
  }

  useEffect(() => {
    if (!menuOpen) return
    syncMenuPosition()
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', syncMenuPosition)
    window.addEventListener('scroll', syncMenuPosition, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', syncMenuPosition)
      window.removeEventListener('scroll', syncMenuPosition, true)
    }
  }, [menuOpen])

  if (workspaces.length === 0) {
    return (
      <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
        <Button variant="primary" size="sm" onClick={onAdd} aria-label={t('picker.addLocalAria')}>
          {t('picker.addLocalShort')}
        </Button>
        {experimentalSsh && onAddSsh && (
          <Button variant="ghost" size="sm" onClick={onAddSsh} aria-label={t('picker.addSshAria')}>
            {t('picker.addSshShort')}
          </Button>
        )}
      </div>
    )
  }

  return (
    <>
      <div ref={rootRef} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-1)', position: 'relative' }}>
        <button
          ref={triggerRef}
          type="button"
          aria-label={t('picker.select')}
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          onClick={() => {
            if (!menuOpen) syncMenuPosition()
            setMenuOpen((open) => !open)
          }}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            alignItems: 'center',
            gap: 'var(--sp-2)',
            background: 'var(--bg-elev)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            color: 'var(--text)',
            fontFamily: 'inherit',
            fontSize: 'var(--fs-sm)',
            fontWeight: 'var(--fw-medium)',
            padding: 'var(--sp-1) var(--sp-2) var(--sp-1) var(--sp-3)',
            cursor: 'pointer',
            width: '220px',
            maxWidth: 'min(220px, calc(100vw - 96px))',
            WebkitAppRegion: 'no-drag',
          } as CSSProperties}
        >
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
            {(() => {
              const active = workspaces.find((w) => w.id === activeId)
              return active ? workspaceLabel(active) : t('picker.select')
            })()}
          </span>
          <span aria-hidden="true" style={{ color: 'var(--text-muted)', transform: menuOpen ? 'rotate(180deg)' : undefined }}>
            ▾
          </span>
        </button>

        {menuOpen && createPortal(
          <div
            ref={menuRef}
            data-workspace-picker-menu=""
            role="listbox"
            aria-label={t('picker.select')}
            style={{
              position: 'fixed',
              top: menuPosition ? `${menuPosition.top}px` : 0,
              left: menuPosition ? `${menuPosition.left}px` : 0,
              zIndex: 'calc(var(--z-modal) + 40)',
              width: 'min(360px, calc(100vw - 24px))',
              maxHeight: 'min(420px, calc(100vh - 96px))',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              background: 'color-mix(in srgb, var(--bg-elev) 96%, transparent)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-xl)',
              boxShadow: 'var(--shadow-lg)',
              backdropFilter: 'blur(18px)',
            }}
          >
            <div style={{ overflow: 'auto', padding: 'var(--sp-2)', overscrollBehavior: 'contain' }}>
              <WorkspaceMenuGroup
                label={t('picker.groupLocal')}
                workspaces={workspaces.filter((w) => !w.transport || w.transport.type === 'local')}
                activeId={activeId}
                onSelect={(id) => {
                  setMenuOpen(false)
                  onSelect(id)
                }}
              />
              <WorkspaceMenuGroup
                label={t('picker.groupRemote')}
                workspaces={workspaces.filter((w) => w.transport?.type === 'ssh')}
                activeId={activeId}
                onSelect={(id) => {
                  setMenuOpen(false)
                  onSelect(id)
                }}
              />
            </div>
            <div
              style={{
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--sp-1)',
                padding: 'var(--sp-2)',
                borderTop: '1px solid var(--border)',
                background: 'color-mix(in srgb, var(--bg-elev) 92%, transparent)',
              }}
            >
              <WorkspaceMenuAction
                label={t('picker.addLocal')}
                onClick={() => {
                  setMenuOpen(false)
                  onAdd()
                }}
              />
              {experimentalSsh && onAddSsh && (
                <WorkspaceMenuAction
                  label={t('picker.addSsh')}
                  onClick={() => {
                    setMenuOpen(false)
                    onAddSsh()
                  }}
                />
              )}
            </div>
          </div>,
          document.body
        )}
        <IconButton
          aria-label={t('picker.manage')}
          size="sm"
          onClick={() => setShowManage(true)}
        >
          <GearIcon />
        </IconButton>
      </div>

      {showManage && (
        <WorkspaceManageModal
          workspaces={workspaces}
          onRemove={onRemove}
          onClose={() => setShowManage(false)}
        />
      )}
    </>
  )
}
