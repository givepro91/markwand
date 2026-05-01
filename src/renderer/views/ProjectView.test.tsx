/**
 * @vitest-environment jsdom
 *
 * Self-QA: after opening a document, users need a visible in-content way back
 * to the Project Wiki. The tiny icon-only toggle is not enough discoverability.
 */
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen, userEvent } from '../__test-utils__/render'
import { ProjectDocReturnBar } from './ProjectView'

describe('ProjectDocReturnBar', () => {
  it('calls the return handler from a visible Back to Wiki action', async () => {
    const onReturnToWiki = vi.fn()
    renderWithProviders(
      <ProjectDocReturnBar docName="README.md" onReturnToWiki={onReturnToWiki} />
    )

    expect(screen.getByText('README.md')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'projectWiki.returnToWikiAria' }))

    expect(onReturnToWiki).toHaveBeenCalledOnce()
  })
})
