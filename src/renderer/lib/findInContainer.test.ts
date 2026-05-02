/**
 * @vitest-environment jsdom
 *
 * Self-QA: document search must target rendered markdown, not surrounding UI
 * such as the Drift panel that may repeat the same reference text.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFindController } from './findInContainer'

beforeEach(() => {
  document.body.innerHTML = ''
  ;(Range.prototype as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect =
    () => ({
      left: 0,
      top: 280,
      right: 120,
      bottom: 300,
      width: 120,
      height: 20,
      x: 0,
      y: 240,
      toJSON: () => ({}),
    }) as DOMRect
})

describe('createFindController', () => {
  it('collects matches from the search root while scrolling the outer container', () => {
    const scrollContainer = document.createElement('div')
    const driftPanel = document.createElement('section')
    const markdown = document.createElement('article')
    driftPanel.textContent = '@/same.md appears in the Drift panel'
    markdown.textContent = '@/same.md appears in the document body'
    scrollContainer.append(driftPanel, markdown)
    document.body.appendChild(scrollContainer)

    Object.defineProperty(scrollContainer, 'clientHeight', { value: 300 })
    scrollContainer.scrollTo = vi.fn()
    scrollContainer.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 500,
      bottom: 300,
      width: 500,
      height: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect

    const controller = createFindController(markdown, scrollContainer)
    const count = controller.update('@/same.md')

    expect(count).toBe(1)
    expect(scrollContainer.scrollTo).toHaveBeenCalled()
  })
})
