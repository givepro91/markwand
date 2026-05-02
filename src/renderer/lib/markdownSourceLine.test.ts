/**
 * @vitest-environment jsdom
 *
 * Self-QA: Drift "본문에서 보기" must jump to the recorded source line,
 * not the first repeated reference text in the document.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findMarkdownSourceElement, scrollMarkdownSourceLineIntoView } from './markdownSourceLine'

beforeEach(() => {
  document.body.innerHTML = ''
  Element.prototype.scrollIntoView = vi.fn()
})

describe('markdownSourceLine', () => {
  it('chooses the element covering the requested line when the same reference appears earlier', () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <p data-source-start="10" data-source-end="10">@/docs/designs/scripts/db.py first</p>
      <p data-source-start="170" data-source-end="170">@/docs/designs/scripts/db.py target</p>
    `

    const found = findMarkdownSourceElement(container, {
      line: 170,
      raw: '@/docs/designs/scripts/db.py',
    })

    expect(found?.textContent).toContain('target')
  })

  it('scrolls and marks the source element instead of relying on global text search order', () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <p data-source-start="10" data-source-end="10">@/same.md first</p>
      <p data-source-start="98" data-source-end="98">@/same.md target</p>
    `

    const ok = scrollMarkdownSourceLineIntoView(container, { line: 98, raw: '@/same.md' })
    const target = container.querySelector<HTMLElement>('[data-source-start="98"]')

    expect(ok).toBe(true)
    expect(target?.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    expect(target).toHaveAttribute('data-drift-jump-target', 'true')
  })
})
