/**
 * @vitest-environment jsdom
 *
 * Self-QA: project opener UX must not rely on user dogfood. We simulate installed
 * app detection, default opener persistence, and the SSH-disabled edge.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installApiMock } from '../__test-utils__/apiMock'
import { act, renderWithProviders, screen, userEvent, waitFor } from '../__test-utils__/render'
import { ProjectOpenMenu } from './ProjectOpenMenu'

const openers = [
  { id: 'vscode' as const, label: 'VS Code', available: true },
  { id: 'finder' as const, label: 'Finder', available: true },
  { id: 'ghostty' as const, label: 'Ghostty', available: false },
]

describe('ProjectOpenMenu', () => {
  beforeEach(() => {
    installApiMock({
      prefs: {
        get: vi.fn(async (key: string) => (key === 'defaultProjectOpener' ? 'vscode' : undefined)),
        set: vi.fn(async () => undefined),
      },
      projectOpeners: {
        list: vi.fn(async () => openers),
        open: vi.fn(async () => ({ ok: true })),
      },
    })
  })

  it('opens the project with the saved default opener', async () => {
    const api = window.api
    renderWithProviders(<ProjectOpenMenu projectRoot="/project/root" />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'projectOpen.openWith' })).toBeEnabled())
    await userEvent.setup().click(screen.getByRole('button', { name: 'projectOpen.openWith' }))

    expect(api.projectOpeners.open).toHaveBeenCalledWith('/project/root', 'vscode')
  })

  it('opens the current file when rendered as a compact document action', async () => {
    const api = window.api
    const user = userEvent.setup()
    renderWithProviders(<ProjectOpenMenu projectRoot="/project/root/docs/spec.md" variant="compact" />)

    const openButton = await screen.findByRole('button', { name: 'projectOpen.openCurrentFileWith' })
    await waitFor(() => expect(openButton).toBeEnabled())
    expect(openButton).toHaveTextContent('VS Code')
    expect(openButton.parentElement?.parentElement).toHaveStyle({ flex: '0 0 auto' })

    await user.click(openButton)

    expect(api.projectOpeners.open).toHaveBeenCalledWith('/project/root/docs/spec.md', 'vscode')

    await user.click(screen.getByRole('button', { name: 'projectOpen.currentFileMenuAria' }))
    expect(screen.getByRole('menu', { name: 'projectOpen.currentFileMenuAria' })).toBeInTheDocument()
  })

  it('shows only detected apps and can save a different default', async () => {
    const api = window.api
    const user = userEvent.setup()
    renderWithProviders(<ProjectOpenMenu projectRoot="/project/root" />)

    await user.click(await screen.findByRole('button', { name: 'projectOpen.menuAria' }))

    expect(screen.getByRole('menu', { name: 'projectOpen.menuAria' })).toHaveStyle({ width: '100%' })
    expect(screen.getByText('VS Code')).toBeInTheDocument()
    expect(screen.getByText('Finder')).toBeInTheDocument()
    expect(screen.queryByText('Ghostty')).not.toBeInTheDocument()

    const setDefaultButtons = screen.getAllByRole('button', { name: 'projectOpen.setDefaultAria' })
    await user.click(setDefaultButtons[1])

    expect(api.prefs.set).toHaveBeenCalledWith('defaultProjectOpener', 'finder')
  })

  it('falls back to the core openers only when opener detection IPC fails', async () => {
    const api = installApiMock({
      prefs: {
        get: vi.fn(async () => undefined),
        set: vi.fn(async () => undefined),
      },
      projectOpeners: {
        list: vi.fn(async () => {
          throw new Error('ipc missing')
        }),
        open: vi.fn(async () => ({ ok: true })),
      },
    })
    const user = userEvent.setup()

    renderWithProviders(<ProjectOpenMenu projectRoot="/project/root" />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'projectOpen.openWith' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'projectOpen.menuAria' }))
    expect(screen.getByText('VS Code')).toBeInTheDocument()
    expect(screen.getByText('Terminal')).toBeInTheDocument()
    expect(screen.getByText('Finder')).toBeInTheDocument()
    expect(screen.queryByText('iTerm2')).not.toBeInTheDocument()
    expect(screen.queryByText('Ghostty')).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'projectOpen.openWith' }))
    expect(api.projectOpeners.open).toHaveBeenCalledWith('/project/root', 'finder')
  })

  it('disables local open actions for SSH projects', async () => {
    const api = window.api
    renderWithProviders(
      <ProjectOpenMenu
        projectRoot="/home/remote/project"
        disabled
        disabledReason="SSH projects cannot be opened locally"
      />
    )

    expect(screen.getByRole('button', { name: 'SSH projects cannot be opened locally' })).toBeDisabled()
    expect(api.projectOpeners.list).not.toHaveBeenCalled()
    expect(api.projectOpeners.open).not.toHaveBeenCalled()
  })

  it('ignores late opener detection after unmount', async () => {
    let resolveList!: (value: typeof openers) => void
    const listPromise = new Promise<typeof openers>((resolve) => {
      resolveList = resolve
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    installApiMock({
      prefs: {
        get: vi.fn(async () => 'vscode'),
        set: vi.fn(async () => undefined),
      },
      projectOpeners: {
        list: vi.fn(() => listPromise),
        open: vi.fn(async () => ({ ok: true })),
      },
    })

    const { unmount } = renderWithProviders(<ProjectOpenMenu projectRoot="/project/root" />)
    unmount()

    await act(async () => {
      resolveList(openers)
      await listPromise
    })

    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
