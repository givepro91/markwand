import { useState } from 'react'
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
  onRemove: (id: string) => Promise<void>
}

export function WorkspacePicker({ workspaces, activeId, onSelect, onAdd, onRemove }: WorkspacePickerProps) {
  const [showManage, setShowManage] = useState(false)

  if (workspaces.length === 0) {
    return (
      <Button variant="primary" size="sm" onClick={onAdd} aria-label="워크스페이스 추가">
        + 워크스페이스 추가
      </Button>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-1)' }}>
        <div style={{ position: 'relative' }}>
          <select
            value={activeId ?? ''}
            aria-label="워크스페이스 선택"
            onChange={(e) => {
              const val = e.target.value
              if (val === '__add__') onAdd()
              else if (val) onSelect(val)
            }}
            style={{
              appearance: 'none',
              background: 'var(--bg-elev)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              color: 'var(--text)',
              fontSize: 'var(--fs-sm)',
              fontWeight: 'var(--fw-medium)',
              padding: 'var(--sp-1) 28px var(--sp-1) var(--sp-3)',
              cursor: 'pointer',
              maxWidth: '180px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
            <option value="__add__">+ 워크스페이스 추가</option>
          </select>
          <span
            style={{
              position: 'absolute',
              right: 'var(--sp-2)',
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              color: 'var(--text-muted)',
              fontSize: 'var(--fs-xs)',
            }}
          >
            ▾
          </span>
        </div>
        <IconButton
          aria-label="워크스페이스 관리"
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
