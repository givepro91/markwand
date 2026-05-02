/**
 * @vitest-environment jsdom
 *
 * Self-QA: the workspace picker uses an in-app scrollable list instead of the
 * native macOS select popup, whose long menus force users to scroll back upward
 * to reach add actions.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Workspace } from '../../preload/types'
import { fireEvent, renderWithProviders, screen } from '../__test-utils__/render'
import { WorkspacePicker } from './WorkspacePicker'

function workspace(index: number, overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: `local:${index}`,
    root: `/Users/me/project-${index}`,
    name: `project-${index}`,
    mode: 'single',
    transport: { type: 'local' },
    addedAt: 1,
    lastOpened: null,
    ...overrides,
  }
}

describe('WorkspacePicker', () => {
  it('opens a bounded in-app list with sticky add actions for long workspace lists', () => {
    const workspaces = Array.from({ length: 14 }, (_, index) => workspace(index))
    renderWithProviders(
      <WorkspacePicker
        workspaces={workspaces}
        activeId="local:8"
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onAddSsh={vi.fn()}
        experimentalSsh
        onRemove={vi.fn().mockResolvedValue(undefined)}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'picker.select' }))

    const listbox = screen.getByRole('listbox', { name: 'picker.select' })
    expect(listbox.parentElement).toBe(document.body)
    expect(listbox).toHaveAttribute('data-workspace-picker-menu')
    expect(listbox).toHaveStyle({
      position: 'fixed',
      zIndex: 'calc(var(--z-modal) + 40)',
      maxHeight: 'min(420px, calc(100vh - 96px))',
      overflow: 'hidden',
    })
    expect(screen.getAllByText('project-8')[1].closest('[role="option"]')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('+ picker.addLocal')).toBeInTheDocument()
    expect(screen.getByText('+ picker.addSsh')).toBeInTheDocument()
  })

  it('selects a workspace and closes the custom menu', () => {
    const onSelect = vi.fn()
    renderWithProviders(
      <WorkspacePicker
        workspaces={[workspace(1), workspace(2)]}
        activeId="local:1"
        onSelect={onSelect}
        onAdd={vi.fn()}
        onRemove={vi.fn().mockResolvedValue(undefined)}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'picker.select' }))
    fireEvent.click(screen.getByText('project-2'))

    expect(onSelect).toHaveBeenCalledWith('local:2')
    expect(screen.queryByRole('listbox', { name: 'picker.select' })).not.toBeInTheDocument()
  })
})
