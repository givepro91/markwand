/**
 * @vitest-environment jsdom
 *
 * Self-QA: after opening a document, users need a visible in-content way back
 * to the Project Wiki. The tiny icon-only toggle is not enough discoverability.
 */
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen, userEvent } from '../__test-utils__/render'
import { getDocumentStickyOffset, ProjectDocReturnBar } from './ProjectView'

describe('ProjectDocReturnBar', () => {
  it('calls the return handler from a visible Back to Wiki action', async () => {
    const onReturnToWiki = vi.fn()
    renderWithProviders(
      <ProjectDocReturnBar docName="README.md" onReturnToWiki={onReturnToWiki} />
    )

    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.getByText('README.md').closest('[data-project-doc-return-bar]')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'projectWiki.returnToWikiAria' }))

    expect(onReturnToWiki).toHaveBeenCalledOnce()
  })

  it('reserves the sticky reading bar height when jumping from the TOC', () => {
    const container = document.createElement('div')
    const returnBar = document.createElement('div')
    returnBar.setAttribute('data-project-doc-return-bar', '')
    returnBar.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 68,
      right: 420,
      width: 420,
      height: 68,
      toJSON: () => ({}),
    }))
    container.appendChild(returnBar)

    expect(getDocumentStickyOffset(container)).toBe(92)
  })
})
