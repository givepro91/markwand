/**
 * @vitest-environment jsdom
 *
 * Self-QA: drawings and screenshots need explicit zoom controls and grab-pan
 * when their rendered size exceeds the viewer.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { installApiMock } from '../__test-utils__/apiMock'
import { fireEvent, renderWithProviders, screen } from '../__test-utils__/render'
import { ImageViewer } from './ImageViewer'

beforeEach(() => {
  installApiMock()
})

function loadImageWithNaturalSize(width: number, height: number) {
  const img = screen.getByRole('img', { name: 'floor.png' }) as HTMLImageElement
  Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true })
  Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true })
  fireEvent.load(img)
  return img
}

function dispatchPointer(
  el: HTMLElement,
  type: string,
  init: { button?: number; clientX: number; clientY: number; pointerId: number }
) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    button: { value: init.button ?? 0 },
    clientX: { value: init.clientX },
    clientY: { value: init.clientY },
    pointerId: { value: init.pointerId },
  })
  fireEvent(el, event)
}

describe('ImageViewer zoom and pan', () => {
  it('shows the available canvas shortcuts while viewing an image', () => {
    renderWithProviders(<ImageViewer path="/project/floor.png" name="floor.png" />)

    const toolbar = screen.getByRole('toolbar', { name: 'imageViewer.toolbarAria' })
    const shortcuts = screen.getByRole('note', { name: 'imageViewer.shortcutsAria' })
    expect(toolbar).toContainElement(shortcuts)
    expect(shortcuts).toHaveTextContent('imageViewer.shortcutsLabel')
    expect(shortcuts).toHaveTextContent('+ / −')
    expect(shortcuts).toHaveTextContent('imageViewer.shortcutZoom')
    expect(shortcuts).toHaveTextContent('0')
    expect(shortcuts).toHaveTextContent('imageViewer.shortcutReset')
    expect(shortcuts).toHaveTextContent('F')
    expect(shortcuts).toHaveTextContent('imageViewer.shortcutFit')
    expect(shortcuts).toHaveTextContent('imageViewer.shortcutDoubleClickKey')
    expect(shortcuts).toHaveTextContent('imageViewer.shortcutToggle')
  })

  it('fits the whole image inside the actual canvas bounds instead of a viewport-height guess', () => {
    renderWithProviders(<ImageViewer path="/project/floor.png" name="floor.png" />)
    const img = loadImageWithNaturalSize(1440, 900)

    expect(screen.getByRole('radio', { name: 'imageViewer.fitMode' })).toHaveAttribute('aria-checked', 'true')
    expect(img.style.maxWidth).toBe('100%')
    expect(img.style.maxHeight).toBe('100%')
    expect(img.style.objectFit).toBe('contain')
    expect(img.style.width).toBe('auto')
    expect(img.style.height).toBe('auto')
  })

  it('does not offer a crop-only fill mode for drawings and screenshots', () => {
    renderWithProviders(<ImageViewer path="/project/floor.png" name="floor.png" />)

    expect(screen.queryByRole('radio', { name: 'imageViewer.fillMode' })).not.toBeInTheDocument()
  })

  it('zooms the image with +/- buttons while preserving actual pixel sizing', () => {
    renderWithProviders(<ImageViewer path="/project/floor.png" name="floor.png" />)
    const img = loadImageWithNaturalSize(800, 600)

    fireEvent.click(screen.getByRole('button', { name: 'imageViewer.zoomIn' }))
    expect(img.style.width).toBe('800px')
    expect(img.style.height).toBe('600px')
    expect(img.style.transform).toContain('scale(1.25)')

    fireEvent.click(screen.getByRole('button', { name: 'imageViewer.zoomOut' }))
    fireEvent.click(screen.getByRole('button', { name: 'imageViewer.zoomOut' }))
    expect(img.style.transform).toContain('scale(0.75)')
  })

  it('uses grab-drag to pan an oversized image instead of selecting the image', () => {
    renderWithProviders(<ImageViewer path="/project/floor.png" name="floor.png" />)
    loadImageWithNaturalSize(1200, 900)
    fireEvent.click(screen.getByRole('radio', { name: 'imageViewer.actualSize' }))

    const canvas = screen.getByRole('region', { name: 'imageViewer.canvasAria' }) as HTMLDivElement
    Object.defineProperty(canvas, 'clientWidth', { value: 300, configurable: true })
    Object.defineProperty(canvas, 'clientHeight', { value: 200, configurable: true })
    const img = screen.getByRole('img', { name: 'floor.png' }) as HTMLImageElement

    dispatchPointer(canvas, 'pointerdown', { button: 0, clientX: 100, clientY: 100, pointerId: 1 })
    dispatchPointer(canvas, 'pointermove', { clientX: 80, clientY: 70, pointerId: 1 })

    expect(img.style.transform).toContain('translate(-20px, -30px)')
    expect(img.style.transform).toContain('scale(1)')

    dispatchPointer(canvas, 'pointerup', { clientX: 80, clientY: 70, pointerId: 1 })
    expect(canvas.style.cursor).toBe('grab')
  })

  it('zooms with the mouse wheel over the image canvas', () => {
    renderWithProviders(<ImageViewer path="/project/floor.png" name="floor.png" />)
    const img = loadImageWithNaturalSize(800, 600)
    const canvas = screen.getByRole('region', { name: 'imageViewer.canvasAria' }) as HTMLDivElement
    Object.defineProperty(canvas, 'clientWidth', { value: 400, configurable: true })
    Object.defineProperty(canvas, 'clientHeight', { value: 300, configurable: true })
    canvas.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 300,
      right: 400,
      width: 400,
      height: 300,
      toJSON: () => ({}),
    })

    fireEvent.wheel(canvas, { deltaY: -100, clientX: 200, clientY: 150 })

    expect(screen.getByRole('radio', { name: 'imageViewer.actualSize' })).toHaveAttribute('aria-checked', 'true')
    expect(img.style.transform).toContain('scale(1.25)')
  })

  it('toggles between fit and actual size with a canvas double click', () => {
    renderWithProviders(<ImageViewer path="/project/floor.png" name="floor.png" />)
    const img = loadImageWithNaturalSize(800, 600)
    const canvas = screen.getByRole('region', { name: 'imageViewer.canvasAria' })

    fireEvent.doubleClick(canvas)

    expect(screen.getByRole('radio', { name: 'imageViewer.actualSize' })).toHaveAttribute('aria-checked', 'true')
    expect(img.style.width).toBe('800px')
    expect(img.style.height).toBe('600px')

    fireEvent.doubleClick(canvas)

    expect(screen.getByRole('radio', { name: 'imageViewer.fitMode' })).toHaveAttribute('aria-checked', 'true')
    expect(img.style.width).toBe('auto')
    expect(img.style.height).toBe('auto')
  })

  it('supports keyboard zoom and fit shortcuts from the image canvas', () => {
    renderWithProviders(<ImageViewer path="/project/floor.png" name="floor.png" />)
    const img = loadImageWithNaturalSize(800, 600)
    const canvas = screen.getByRole('region', { name: 'imageViewer.canvasAria' })

    expect(canvas).toHaveAttribute('tabindex', '0')
    expect(canvas).toHaveAttribute('aria-keyshortcuts', '+ - 0 F')

    fireEvent.keyDown(canvas, { key: '+' })
    expect(screen.getByRole('radio', { name: 'imageViewer.actualSize' })).toHaveAttribute('aria-checked', 'true')
    expect(img.style.transform).toContain('scale(1.25)')

    fireEvent.keyDown(canvas, { key: '-' })
    fireEvent.keyDown(canvas, { key: '-' })
    expect(img.style.transform).toContain('scale(0.75)')

    fireEvent.keyDown(canvas, { key: '0' })
    expect(img.style.transform).toContain('scale(1)')

    fireEvent.keyDown(canvas, { key: 'f' })
    expect(screen.getByRole('radio', { name: 'imageViewer.fitMode' })).toHaveAttribute('aria-checked', 'true')
  })
})
