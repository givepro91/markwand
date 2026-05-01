/**
 * @vitest-environment jsdom
 *
 * Self-QA: the guide is a persistent explanation surface for features that are
 * otherwise easy to mistake for a plain document viewer.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, renderWithProviders, screen } from '../__test-utils__/render'
import { ProductGuideModal } from './ProductGuideModal'

describe('ProductGuideModal', () => {
  it('renders through a body portal with the product intent and core feature sections', () => {
    renderWithProviders(
      <div style={{ overflow: 'hidden', height: '40px' }}>
        <ProductGuideModal onClose={vi.fn()} />
      </div>
    )

    const dialog = screen.getByRole('dialog', { name: 'productGuide.title' })
    const portalRoot = dialog.closest('[data-product-guide-modal-root]')

    expect(portalRoot?.parentElement).toBe(document.body)
    expect(screen.getByText('productGuide.sections.wiki.title')).toBeInTheDocument()
    expect(screen.getByText('productGuide.sections.search.title')).toBeInTheDocument()
    expect(screen.getByText('productGuide.sections.ssh.title')).toBeInTheDocument()
  })

  it('closes on Escape so the always-available guide does not trap users', () => {
    const onClose = vi.fn()
    renderWithProviders(<ProductGuideModal onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledOnce()
  })
})
