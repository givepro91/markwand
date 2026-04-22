import { useTranslation } from 'react-i18next'
import { WorkspacePicker } from './WorkspacePicker'
import { ThemeToggle } from './ThemeToggle'
import { Settings } from './Settings'
import { useTheme } from '../hooks/useTheme'
import type { Workspace, ViewMode } from '../../../src/preload/types'

interface SidebarProps {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  viewMode: ViewMode
  onWorkspaceSelect: (id: string) => void
  onWorkspaceAdd: () => void
  /** Follow-up FS2 — SSH workspace 추가 트리거. experimentalSsh 가 true 일 때만 호출됨. */
  onWorkspaceAddSsh?: () => void
  experimentalSsh?: boolean
  onWorkspaceRemove: (id: string) => Promise<void>
  onViewModeChange: (mode: ViewMode) => void
}

const VIEW_TAB_KEYS: { value: ViewMode; labelKey: string; titleKey: string }[] = [
  { value: 'all', labelKey: 'sidebar.tabs.all', titleKey: 'sidebar.tabs.allTitle' },
  { value: 'inbox', labelKey: 'sidebar.tabs.inbox', titleKey: 'sidebar.tabs.inboxTitle' },
  { value: 'project', labelKey: 'sidebar.tabs.project', titleKey: 'sidebar.tabs.projectTitle' },
]

export function Sidebar({
  workspaces,
  activeWorkspaceId,
  viewMode,
  onWorkspaceSelect,
  onWorkspaceAdd,
  onWorkspaceAddSsh,
  experimentalSsh,
  onWorkspaceRemove,
  onViewModeChange,
}: SidebarProps) {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-3)',
        padding: 'var(--sp-2) var(--sp-4)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-elev)',
        flexShrink: 0,
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <WorkspacePicker
          workspaces={workspaces}
          activeId={activeWorkspaceId}
          onSelect={onWorkspaceSelect}
          onAdd={onWorkspaceAdd}
          onAddSsh={onWorkspaceAddSsh}
          experimentalSsh={experimentalSsh}
          onRemove={onWorkspaceRemove}
        />
      </div>

      <div
        role="tablist"
        aria-label={t('sidebar.viewMode')}
        style={{
          display: 'flex',
          gap: '2px',
          background: 'var(--bg-hover)',
          borderRadius: 'var(--r-md)',
          padding: '2px',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        {VIEW_TAB_KEYS.map((tab) => {
          const isActive = viewMode === tab.value
          return (
            <button
              key={tab.value}
              role="tab"
              aria-selected={isActive}
              title={t(tab.titleKey)}
              onClick={() => onViewModeChange(tab.value)}
              style={{
                padding: 'var(--sp-1) var(--sp-3)',
                border: 'none',
                borderRadius: 'var(--r-sm)',
                fontSize: 'var(--fs-sm)',
                background: isActive ? 'var(--accent)' : 'transparent',
                color: isActive ? '#fff' : 'var(--text-muted)',
                boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                fontWeight: isActive ? 'var(--fw-medium)' : 'var(--fw-normal)',
                transition: 'background var(--duration-fast) var(--ease-standard)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t(tab.labelKey)}
            </button>
          )
        })}
      </div>

      <div
        style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <ThemeToggle value={theme} onChange={setTheme} />
        <Settings />
      </div>
    </header>
  )
}
