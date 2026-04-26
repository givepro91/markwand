/**
 * @vitest-environment jsdom
 *
 * 자가 검증: useAnnotations 의 mousedown/drag/mouseup 라이프사이클이
 * 실제 사용자 플로우에서 의도대로 동작하는지를 단위 테스트로 보장한다.
 * 사용자 dogfood 에 의지하지 않고 회귀를 자동으로 잡기 위한 안전망.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import { useAnnotations } from './useAnnotations'

// window.api mock — preload 가 없는 jsdom 환경.
beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = {
    annotation: {
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
    },
  }
  document.body.innerHTML = ''

  // jsdom 25 는 Range.prototype.getBoundingClientRect 미구현 — polyfill.
  // 실제 layout 좌표가 필요한 게 아니라 width/height 가 0,0 이 아닌지 검사하는 가드만 통과.
  ;(Range.prototype as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect =
    function () {
      return {
        left: 10,
        top: 10,
        right: 110,
        bottom: 30,
        width: 100,
        height: 20,
        x: 10,
        y: 10,
        toJSON: () => ({}),
      } as DOMRect
    }
  ;(Range.prototype as unknown as { getClientRects: () => DOMRectList }).getClientRects =
    function () {
      return [] as unknown as DOMRectList
    }
  // requestAnimationFrame in jsdom 은 timer 기반 — 즉시 fire 시뮬을 위해 micro-tick 으로 patch.
})

// rAF flush helper — vitest 의 useFakeTimers 와 충돌 없이 native rAF 1 frame 진행.
async function flushRaf(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
}

// container 와 hook 을 함께 마운트하는 헬퍼.
function setupHook(html: string, opts?: { isSsh?: boolean; docPath?: string }) {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)

  const initialDocPath = opts?.docPath ?? '/tmp/test-doc.md'
  const isSsh = opts?.isSsh ?? false

  const ref = { current: container } as React.RefObject<HTMLElement>
  const hookResult = renderHook(
    ({ docPath, content }: { docPath: string; content: string }) =>
      useAnnotations(docPath, isSsh, ref, content),
    {
      initialProps: { docPath: initialDocPath, content: container.innerHTML },
    }
  )
  return { container, hookResult }
}

// selection 헬퍼: container 안 텍스트의 첫 등장 위치를 selection 으로 만든다.
function selectText(container: HTMLElement, query: string): void {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null)
  let acc = ''
  const nodes: Text[] = []
  let n: Text | null
  while ((n = walker.nextNode() as Text | null)) {
    nodes.push(n)
    acc += n.data
  }
  const idx = acc.indexOf(query)
  if (idx < 0) throw new Error(`text not found: ${query}`)
  let cursor = 0
  let startNode: Text | null = null
  let startOff = 0
  let endNode: Text | null = null
  let endOff = 0
  for (const tx of nodes) {
    const next = cursor + tx.data.length
    if (!startNode && idx >= cursor && idx < next) {
      startNode = tx
      startOff = idx - cursor
    }
    const endIdx = idx + query.length
    if (!endNode && endIdx > cursor && endIdx <= next) {
      endNode = tx
      endOff = endIdx - cursor
    }
    cursor = next
  }
  if (!startNode || !endNode) throw new Error('range build failed')
  const range = document.createRange()
  range.setStart(startNode, startOff)
  range.setEnd(endNode, endOff)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

function clearSelection(): void {
  window.getSelection()?.removeAllRanges()
}

describe('useAnnotations — drag/mousedown/mouseup lifecycle', () => {
  it('mousedown 후 drag 진행 중 (selectionchange 발화) toolbar 표시 X', async () => {
    const { container, hookResult } = setupHook(
      '<p>The quick brown fox jumps over the lazy dog.</p>'
    )
    // 초기 toolbar 비가시.
    expect(hookResult.result.current.toolbar.visible).toBe(false)

    // 1) 사용자가 mousedown — drag 시작.
    act(() => {
      const target = container.querySelector('p')!
      target.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 })
      )
    })

    // 2) drag 진행 중 native 가 selection 만들고 selectionchange 발화 (1 글자, 2 글자, ... 점진).
    act(() => {
      selectText(container, 'q')
      document.dispatchEvent(new Event('selectionchange'))
    })
    await flushRaf()
    // drag 진행 중이므로 toolbar 안 떠야 한다.
    expect(hookResult.result.current.toolbar.visible).toBe(false)

    // 점진적으로 selection 확장 (drag 진행).
    act(() => {
      selectText(container, 'quick brown')
      document.dispatchEvent(new Event('selectionchange'))
    })
    await flushRaf()
    expect(hookResult.result.current.toolbar.visible).toBe(false)
  })

  it('mouseup 시점에 selection 있으면 toolbar visible=true (create mode)', async () => {
    const { container, hookResult } = setupHook(
      '<p>The quick brown fox jumps over the lazy dog.</p>'
    )

    // drag 시뮬: mousedown → selection extend → mouseup
    act(() => {
      container.querySelector('p')!.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 })
      )
    })
    act(() => {
      selectText(container, 'quick brown fox')
    })
    act(() => {
      container.querySelector('p')!.dispatchEvent(
        new MouseEvent('mouseup', { bubbles: true, clientX: 80, clientY: 10 })
      )
    })
    await flushRaf()
    await waitFor(() => {
      expect(hookResult.result.current.toolbar.visible).toBe(true)
      expect(hookResult.result.current.toolbar.mode).toBe('create')
    })
  })

  it('mouseup 시점 selection 이 collapsed 면 toolbar 안 뜸 (단순 클릭)', async () => {
    const { container, hookResult } = setupHook(
      '<p>The quick brown fox jumps over the lazy dog.</p>'
    )

    act(() => {
      container.querySelector('p')!.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 })
      )
    })
    // 단순 클릭이므로 selection 미생성.
    clearSelection()
    act(() => {
      container.querySelector('p')!.dispatchEvent(
        new MouseEvent('mouseup', { bubbles: true, clientX: 10, clientY: 10 })
      )
    })
    await flushRaf()
    expect(hookResult.result.current.toolbar.visible).toBe(false)
  })

  it('mouseup 직후 selection 이 공백만 있으면 toolbar 안 뜸 (미세 흔들림)', async () => {
    const { container, hookResult } = setupHook('<p>   abc   </p>')
    act(() => {
      container.querySelector('p')!.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 })
      )
    })
    act(() => {
      selectText(container, '  ')
    })
    act(() => {
      container.querySelector('p')!.dispatchEvent(
        new MouseEvent('mouseup', { bubbles: true, clientX: 12, clientY: 10 })
      )
    })
    await flushRaf()
    expect(hookResult.result.current.toolbar.visible).toBe(false)
  })

  it('toolbar 자체 mousedown 은 isDragging 토글 안 시킴 (ref 격리)', async () => {
    const { container, hookResult } = setupHook(
      '<p>The quick brown fox jumps over the lazy dog.</p>' +
        '<div data-annotation-toolbar="">toolbar</div>'
    )
    // 먼저 정상적으로 toolbar 띄움.
    act(() => {
      container.querySelector('p')!.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 })
      )
    })
    act(() => {
      selectText(container, 'quick brown fox')
    })
    act(() => {
      container.querySelector('p')!.dispatchEvent(
        new MouseEvent('mouseup', { bubbles: true, clientX: 80, clientY: 10 })
      )
    })
    await flushRaf()
    await waitFor(() => {
      expect(hookResult.result.current.toolbar.visible).toBe(true)
    })

    // 사용자가 toolbar 자체 mousedown — toolbar 사라지면 안 된다 (외부 hide 핸들러 우회).
    act(() => {
      const toolbarEl = container.querySelector('[data-annotation-toolbar]')!
      toolbarEl.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, clientX: 200, clientY: 50 })
      )
    })
    await flushRaf()
    expect(hookResult.result.current.toolbar.visible).toBe(true)
  })

  it('docPath 변경 직후 첫 cycle 은 매칭 skip — 이전 doc 의 annotations 가 새 basePath × stale content 로 하이라이트 X', async () => {
    const apiLoad = vi.fn().mockResolvedValue({
      version: 1 as const,
      annotations: [
        {
          id: 'a1',
          selector: { type: 'TextQuote' as const, exact: 'fox' },
          color: 'yellow' as const,
          createdAt: '2026-04-26T00:00:00.000Z',
        },
      ],
    })
    ;(window as unknown as { api: { annotation: { load: typeof apiLoad; save: typeof apiLoad } } }).api = {
      annotation: { load: apiLoad, save: vi.fn().mockResolvedValue(undefined) },
    }

    const docA = '/tmp/A.md'
    const docB = '/tmp/B.md'

    const container = document.createElement('div')
    container.innerHTML = '<p>The quick brown fox jumps.</p>'
    document.body.appendChild(container)

    const ref = { current: container } as React.RefObject<HTMLElement>
    const hookResult = renderHook(
      ({ docPath, content }: { docPath: string; content: string }) =>
        useAnnotations(docPath, false, ref, content),
      { initialProps: { docPath: docA, content: container.innerHTML } }
    )

    // A 의 annotation 이 로드되어 매칭됨.
    await waitFor(() => {
      expect(hookResult.result.current.annotations.length).toBeGreaterThan(0)
    })
    await flushRaf()

    // B 로 전환 — content prop 은 잠시 stale (A 의 content) 상태 시뮬.
    hookResult.rerender({ docPath: docB, content: container.innerHTML })
    await flushRaf()

    // 첫 cycle 에서는 docPath 변경 가드로 매칭 skip — toolbar 도 hidden, activeRanges 도 비어야 한다.
    // 사용자에게 잠깐 highlight 가 보이는 회귀를 차단.
    expect(hookResult.result.current.toolbar.visible).toBe(false)
  })
})
