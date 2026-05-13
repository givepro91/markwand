/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, renderWithProviders, screen, userEvent, waitFor } from '../__test-utils__/render'
import type { Project } from '../../preload/types'
import { ProjectTabs } from './ProjectTabs'

const projects: Project[] = [
  {
    id: 'p1',
    workspaceId: 'ws1',
    name: 'Alpha',
    root: '/workspace/alpha',
    markers: [],
    docCount: 1,
    lastModified: 1,
  },
  {
    id: 'p2',
    workspaceId: 'ws1',
    name: 'Beta',
    root: '/workspace/beta',
    markers: [],
    docCount: 2,
    lastModified: 2,
  },
]

function createDragEvent(type: string, dataTransfer: object): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
  return event
}

describe('ProjectTabs', () => {
  it('renders opened projects in tab order and marks the active tab', () => {
    renderWithProviders(
      <ProjectTabs
        projects={projects}
        openProjectTabs={['p2', 'p1']}
        activeProjectId="p1"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onReorder={vi.fn()}
      />
    )

    expect(screen.getByRole('tablist', { name: 'projectTabs.aria' })).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Beta', 'Alpha'])
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('aria-selected', 'false')
    const activeTab = screen.getByRole('tab', { name: 'Alpha' }).closest('[data-project-tab]')
    const inactiveTab = screen.getByRole('tab', { name: 'Beta' }).closest('[data-project-tab]')
    expect(activeTab).toHaveAttribute('data-active', 'true')
    expect(activeTab?.getAttribute('style')).toContain('border-top-width: 2px')
    expect(activeTab?.getAttribute('style')).toContain('background: color-mix(in srgb, var(--accent) 10%, var(--bg))')
    expect(activeTab?.getAttribute('style')).toContain('box-shadow: inset 0 2px 0 var(--accent)')
    expect(activeTab?.getAttribute('style')).toContain('box-sizing: border-box')
    expect(inactiveTab?.getAttribute('style')).toContain('box-shadow: none')
  })

  it('selects and closes tabs without rendering stale project ids', async () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <ProjectTabs
        projects={projects}
        openProjectTabs={['missing', 'p1', 'p2']}
        activeProjectId="p1"
        onSelect={onSelect}
        onClose={onClose}
        onReorder={vi.fn()}
      />
    )

    expect(screen.queryByRole('tab', { name: 'missing' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Beta' }))
    expect(onSelect).toHaveBeenCalledWith('p2')

    await user.click(screen.getAllByRole('button', { name: 'projectTabs.close' })[0])
    expect(onClose).toHaveBeenCalledWith('p1')
  })

  it('reorders tabs by dragging one project tab onto another', () => {
    const onReorder = vi.fn()
    renderWithProviders(
      <ProjectTabs
        projects={projects}
        openProjectTabs={['p1', 'p2']}
        activeProjectId="p1"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onReorder={onReorder}
      />
    )

    const alpha = screen.getByRole('tab', { name: 'Alpha' }).closest('[data-project-tab]')
    const beta = screen.getByRole('tab', { name: 'Beta' }).closest('[data-project-tab]')
    expect(alpha).not.toBeNull()
    expect(beta).not.toBeNull()

    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      data: new Map<string, string>(),
      setData(type: string, value: string) {
        this.data.set(type, value)
      },
      getData(type: string) {
        return this.data.get(type) ?? ''
      },
    }

    act(() => {
      alpha!.dispatchEvent(createDragEvent('dragstart', dataTransfer))
    })
    act(() => {
      beta!.dispatchEvent(createDragEvent('dragenter', dataTransfer))
    })
    expect(beta).toHaveAttribute('data-drag-over', 'true')
    act(() => {
      beta!.dispatchEvent(createDragEvent('drop', dataTransfer))
    })

    expect(onReorder).toHaveBeenCalledWith('p1', 'p2')
  })

  it('shows overflow scroll controls and updates their disabled state', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <ProjectTabs
        projects={projects}
        openProjectTabs={['p1', 'p2']}
        activeProjectId="p1"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onReorder={vi.fn()}
      />
    )

    const tabList = screen.getByRole('tablist', { name: 'projectTabs.aria' })
    Object.defineProperty(tabList, 'clientWidth', { value: 200, configurable: true })
    Object.defineProperty(tabList, 'scrollWidth', { value: 300, configurable: true })
    Object.defineProperty(tabList, 'scrollLeft', { value: 0, writable: true, configurable: true })

    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    const previous = await screen.findByRole('button', { name: 'projectTabs.scrollLeft' })
    const next = screen.getByRole('button', { name: 'projectTabs.scrollRight' })
    expect(previous).toBeDisabled()
    expect(next).not.toBeDisabled()

    await user.click(next)
    expect(tabList.scrollLeft).toBe(100)
    expect(previous).not.toBeDisabled()
    expect(next).toBeDisabled()
  })

  it('reveals the active tab when selection moves outside the visible strip', async () => {
    const { rerender } = renderWithProviders(
      <ProjectTabs
        projects={projects}
        openProjectTabs={['p1', 'p2']}
        activeProjectId="p1"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onReorder={vi.fn()}
      />
    )

    const tabList = screen.getByRole('tablist', { name: 'projectTabs.aria' })
    const beta = screen.getByRole('tab', { name: 'Beta' }).closest('[data-project-tab]')
    expect(beta).not.toBeNull()
    Object.defineProperty(tabList, 'clientWidth', { value: 120, configurable: true })
    Object.defineProperty(tabList, 'scrollWidth', { value: 300, configurable: true })
    Object.defineProperty(tabList, 'scrollLeft', { value: 0, writable: true, configurable: true })
    Object.defineProperty(beta!, 'offsetLeft', { value: 180, configurable: true })
    Object.defineProperty(beta!, 'offsetWidth', { value: 80, configurable: true })

    rerender(
      <ProjectTabs
        projects={projects}
        openProjectTabs={['p1', 'p2']}
        activeProjectId="p2"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onReorder={vi.fn()}
      />
    )

    await waitFor(() => expect(tabList.scrollLeft).toBe(140))
  })

  it('supports roving tab focus with arrows/Home/End and activates with Enter', () => {
    const onSelect = vi.fn()
    renderWithProviders(
      <ProjectTabs
        projects={projects}
        openProjectTabs={['p1', 'p2']}
        activeProjectId="p1"
        onSelect={onSelect}
        onClose={vi.fn()}
        onReorder={vi.fn()}
      />
    )

    const alpha = screen.getByRole('tab', { name: 'Alpha' })
    const beta = screen.getByRole('tab', { name: 'Beta' })
    alpha.focus()
    expect(alpha).toHaveFocus()

    fireEvent.keyDown(alpha, { key: 'ArrowRight' })
    expect(beta).toHaveFocus()
    fireEvent.keyDown(beta, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('p2')

    fireEvent.keyDown(beta, { key: 'Home' })
    expect(alpha).toHaveFocus()
    fireEvent.keyDown(alpha, { key: 'End' })
    expect(beta).toHaveFocus()
  })

  it('opens a body-level context menu for tab actions', async () => {
    const user = userEvent.setup()
    const onCloseOthers = vi.fn()
    const onCloseRight = vi.fn()
    const onReopenClosed = vi.fn()
    renderWithProviders(
      <ProjectTabs
        projects={projects}
        openProjectTabs={['p1', 'p2']}
        activeProjectId="p1"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onReorder={vi.fn()}
        onCloseOthers={onCloseOthers}
        onCloseToRight={onCloseRight}
        onReopenClosed={onReopenClosed}
        canReopenClosed
      />
    )

    const alpha = screen.getByRole('tab', { name: 'Alpha' }).closest('[data-project-tab]')
    expect(alpha).not.toBeNull()
    fireEvent.contextMenu(alpha!, { clientX: 20, clientY: 30 })

    const menu = await screen.findByRole('menu', { name: 'projectTabs.contextMenuAria' })
    expect(menu.parentElement).toBe(document.body)
    await user.click(screen.getByRole('menuitem', { name: 'projectTabs.menuCloseOthers' }))
    expect(onCloseOthers).toHaveBeenCalledWith('p1')

    fireEvent.contextMenu(alpha!, { clientX: 20, clientY: 30 })
    await user.click(await screen.findByRole('menuitem', { name: 'projectTabs.menuCloseRight' }))
    expect(onCloseRight).toHaveBeenCalledWith('p1')

    fireEvent.contextMenu(alpha!, { clientX: 20, clientY: 30 })
    await user.click(await screen.findByRole('menuitem', { name: 'projectTabs.menuReopenClosed' }))
    expect(onReopenClosed).toHaveBeenCalledTimes(1)
  })
})
