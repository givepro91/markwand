/**
 * @vitest-environment jsdom
 *
 * Self-QA: icon-only buttons need a visible hover hint for mouse users.
 */
import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen } from '../../__test-utils__/render'
import { IconButton } from './IconButton'

describe('IconButton', () => {
  it('uses aria-label as a default native tooltip when title is omitted', () => {
    renderWithProviders(<IconButton aria-label="문서 내 검색">⌕</IconButton>)

    expect(screen.getByRole('button', { name: '문서 내 검색' })).toHaveAttribute('title', '문서 내 검색')
  })

  it('keeps an explicit title when provided', () => {
    renderWithProviders(
      <IconButton aria-label="문서 도구" title="문제와 목차 열기">
        □
      </IconButton>
    )

    expect(screen.getByRole('button', { name: '문서 도구' })).toHaveAttribute('title', '문제와 목차 열기')
  })
})
