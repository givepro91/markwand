/**
 * @vitest-environment jsdom
 *
 * Self-QA: long document headings must stay readable in the right-side TOC rail.
 */
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen, userEvent } from '../__test-utils__/render'
import { TableOfContents } from './TableOfContents'

describe('TableOfContents', () => {
  it('allows long headings to wrap to two lines instead of forcing a one-line ellipsis', () => {
    renderWithProviders(
      <TableOfContents
        headings={[
          {
            level: 2,
            id: 'long-heading',
            text: 'Phase 9 완성 체크포인트와 다음 세션 진입점 후보를 길게 설명하는 제목',
          },
        ]}
      />
    )

    const headingButton = screen.getByRole('button', { name: /Phase 9 완성 체크포인트/ })

    expect(headingButton).toHaveStyle({ whiteSpace: 'normal' })
    expect(headingButton.style.webkitLineClamp).toBe('2')
  })

  it('keeps heading navigation clickable after the visual wrapping change', async () => {
    const onHeadingClick = vi.fn()
    renderWithProviders(
      <TableOfContents
        headings={[{ level: 1, id: 'nova-state', text: 'Nova State' }]}
        onHeadingClick={onHeadingClick}
      />
    )

    await userEvent.setup().click(screen.getByRole('button', { name: 'Nova State' }))

    expect(onHeadingClick).toHaveBeenCalledWith('nova-state')
  })

  it('can hide its internal title when the surrounding rail already labels the section', () => {
    renderWithProviders(
      <TableOfContents
        headings={[{ level: 1, id: 'nova-state', text: 'Nova State' }]}
        showTitle={false}
      />
    )

    expect(screen.queryByText('toc.title')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova State' })).toBeInTheDocument()
  })
})
