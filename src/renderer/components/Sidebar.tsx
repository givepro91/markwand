import { WorkspacePicker } from './WorkspacePicker'
import { ThemeToggle } from './ThemeToggle'
import { useTheme } from '../hooks/useTheme'
import type { Workspace, ViewMode } from '../../../src/preload/types'

interface SidebarProps {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  viewMode: ViewMode
  onWorkspaceSelect: (id: string) => void
  onWorkspaceAdd: () => void
  onWorkspaceRemove: (id: string) => Promise<void>
  onViewModeChange: (mode: ViewMode) => void
}

const VIEW_TABS: { value: ViewMode; label: string; title: string }[] = [
  { value: 'all', label: '프로젝트 목록', title: '워크스페이스 내 모든 프로젝트 보기' },
  { value: 'inbox', label: '최근 문서', title: '최근 수정된 문서를 날짜별로 보기' },
  { value: 'project', label: '현재 프로젝트', title: '선택한 프로젝트의 파일 트리와 문서 보기' },
]

export function Sidebar({
  workspaces,
  activeWorkspaceId,
  viewMode,
  onWorkspaceSelect,
  onWorkspaceAdd,
  onWorkspaceRemove,
  onViewModeChange,
}: SidebarProps) {
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
          onRemove={onWorkspaceRemove}
        />
      </div>

      <div
        role="tablist"
        aria-label="뷰 모드"
        style={{
          display: 'flex',
          gap: '2px',
          background: 'var(--bg-hover)',
          borderRadius: 'var(--r-md)',
          padding: '2px',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        {VIEW_TABS.map((tab) => {
          const isActive = viewMode === tab.value
          return (
            <button
              key={tab.value}
              role="tab"
              aria-selected={isActive}
              title={tab.title}
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
              {tab.label}
            </button>
          )
        })}
      </div>

      <div style={{ marginLeft: 'auto', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <ThemeToggle value={theme} onChange={setTheme} />
      </div>
    </header>
  )
}
