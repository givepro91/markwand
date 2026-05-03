/**
 * @vitest-environment jsdom
 *
 * Self-QA: header/toolbar popovers must render through a body portal. We have
 * had repeated clipping regressions from absolute popovers inside overflow
 * hidden app shells, so this test is the rule.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installApiMock } from '../__test-utils__/apiMock'
import { renderWithProviders, screen, userEvent, waitFor } from '../__test-utils__/render'
import { Settings } from './Settings'

describe('Settings', () => {
  beforeEach(() => {
    installApiMock({
      prefs: {
        get: vi.fn(async () => undefined),
        set: vi.fn(async () => undefined),
      },
      projectOpeners: {
        list: vi.fn(async () => [{ id: 'vscode', label: 'VS Code', available: true }]),
        open: vi.fn(async () => ({ ok: true })),
      },
    })
  })

  it('renders the settings dialog through a body portal so the header cannot clip it', async () => {
    renderWithProviders(
      <div style={{ height: 44, overflow: 'hidden' }}>
        <Settings />
      </div>
    )

    await userEvent.setup().click(screen.getByRole('button', { name: 'settings.aria' }))

    const dialog = await screen.findByRole('dialog', { name: 'settings.title' })
    const portalRoot = dialog.closest('[data-settings-popover-root]')

    expect(portalRoot?.parentElement).toBe(document.body)
    expect(dialog).toHaveStyle({ position: 'fixed', zIndex: 'calc(var(--z-modal) + 30)', overflowY: 'auto' })
  })

  it('keeps only the core openers available when app detection fails', async () => {
    installApiMock({
      prefs: {
        get: vi.fn(async () => undefined),
        set: vi.fn(async () => undefined),
      },
      projectOpeners: {
        list: vi.fn(async () => {
          throw new Error('project-openers:list unavailable')
        }),
        open: vi.fn(async () => ({ ok: true })),
      },
    })

    renderWithProviders(<Settings />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'settings.aria' }))

    await waitFor(() => expect(screen.getByText('Finder')).toBeInTheDocument())
    expect(screen.getByText('VS Code')).toBeInTheDocument()
    expect(screen.getByText('Terminal')).toBeInTheDocument()
    expect(screen.queryByText('iTerm2')).not.toBeInTheDocument()
    expect(screen.queryByText('Ghostty')).not.toBeInTheDocument()
    expect(screen.queryByText('projectOpen.settingsEmpty')).not.toBeInTheDocument()
  })
})
