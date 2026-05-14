/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, renderWithProviders, screen } from '../__test-utils__/render'
import { AnnotationToolbar } from './AnnotationToolbar'

function renderCreateToolbar(onHighlight = vi.fn()) {
  renderWithProviders(
    <AnnotationToolbar
      state={{
        visible: true,
        mode: 'create',
        rect: { left: 100, top: 100, bottom: 120, width: 200 },
        hitAnnotationId: null,
      }}
      disabled={false}
      onHighlight={onHighlight}
      onRemove={vi.fn()}
      onDismiss={vi.fn()}
    />
  )
  return onHighlight
}

describe('AnnotationToolbar', () => {
  it('mousedown 기본 동작을 막지 않고 하이라이트 click 액션을 실행한다', () => {
    const onHighlight = renderCreateToolbar()
    const button = screen.getByRole('button', { name: 'annotation.highlightAria' })
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })

    button.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)

    fireEvent.click(button)

    expect(onHighlight).toHaveBeenCalledTimes(1)
  })
})
