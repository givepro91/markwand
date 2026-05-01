/**
 * @vitest-environment jsdom
 *
 * Self-QA: the workspace gear opens a real modal over the app shell. Keep it
 * viewport-bound so long workspace lists/paths do not clip or leak sideways.
 */
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen } from '../__test-utils__/render'
import type { Workspace } from '../../preload/types'
import { WorkspaceManageModal } from './WorkspaceManageModal'

const workspace: Workspace = {
  id: 'ws-1',
  name: 'data-migration-with-a-very-long-name-that-used-to-overflow-the-modal',
  root: '/Users/keunsik/develop/givepro91/markwand/web/public/docs/designs/extremely/long/path/that/should/be-ellipsized',
  mode: 'single',
  transport: { type: 'local' },
  addedAt: Date.parse('2026-05-01T00:00:00Z'),
  lastOpened: null,
}

describe('WorkspaceManageModal', () => {
  it('renders through a body portal so the app header cannot clip the dialog', () => {
    renderWithProviders(
      <div style={{ overflow: 'hidden', height: '48px' }}>
        <WorkspaceManageModal
          workspaces={[workspace]}
          onRemove={vi.fn().mockResolvedValue(undefined)}
          onAdd={vi.fn().mockResolvedValue(undefined)}
          onClose={vi.fn()}
        />
      </div>
    )

    const dialog = screen.getByRole('dialog', { name: 'manage.title' })
    const portalRoot = dialog.closest('[data-workspace-manage-modal-root]')

    expect(portalRoot?.parentElement).toBe(document.body)
  })

  it('keeps the settings gear modal within the viewport and scrollable', () => {
    renderWithProviders(
      <WorkspaceManageModal
        workspaces={Array.from({ length: 12 }, (_, index) => ({
          ...workspace,
          id: `ws-${index}`,
          name: `${workspace.name}-${index}`,
        }))}
        onRemove={vi.fn().mockResolvedValue(undefined)}
        onAdd={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />
    )

    const dialog = screen.getByRole('dialog', { name: 'manage.title' })
    const backdrop = dialog.parentElement

    expect(backdrop).toHaveStyle({ alignItems: 'flex-start', overflowY: 'auto' })
    expect(dialog).toHaveStyle({ maxHeight: 'calc(100vh - 48px)', overflowY: 'auto' })
  })

  it('ellipsizes long workspace names and roots instead of widening the modal', () => {
    renderWithProviders(
      <WorkspaceManageModal
        workspaces={[workspace]}
        onRemove={vi.fn().mockResolvedValue(undefined)}
        onAdd={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />
    )

    const name = screen.getByText(workspace.name)
    const root = screen.getByText(workspace.root)

    expect(name.parentElement).toHaveStyle({ minWidth: '0' })
    expect(name).toHaveStyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
    expect(root).toHaveStyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
  })
})
