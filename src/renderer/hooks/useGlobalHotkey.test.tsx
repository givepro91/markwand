/**
 * @vitest-environment jsdom
 *
 * useGlobalHotkey 자가 검증 — 글로벌 새로고침의 ⌘R 트리거 동작이 깨지지 않도록.
 *
 * 사전 점검 (race / edge):
 * - 키 매칭은 대소문자 구분 X (e.key.toLowerCase() 비교).
 * - meta 옵션 활성 시 ctrl-only 조합은 무시되어야 한다 (cross-platform 분리).
 * - unmount 후 핸들러가 더 이상 호출되지 않아야 한다 (메모리 leak / ghost handler 방어).
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useGlobalHotkey } from './useGlobalHotkey'

function dispatchKey(key: string, mods: { meta?: boolean; ctrl?: boolean; shift?: boolean } = {}) {
  const ev = new KeyboardEvent('keydown', {
    key,
    metaKey: mods.meta ?? false,
    ctrlKey: mods.ctrl ?? false,
    shiftKey: mods.shift ?? false,
    bubbles: true,
    cancelable: true,
  })
  window.dispatchEvent(ev)
  return ev
}

describe('useGlobalHotkey — ⌘R 글로벌 새로고침', () => {
  it('Cmd+R 누르면 핸들러 호출', () => {
    const handler = vi.fn()
    renderHook(() => useGlobalHotkey('r', handler, { meta: true }))
    dispatchKey('r', { meta: true })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('대문자 R(Shift+R) 도 매칭 — toLowerCase 비교', () => {
    const handler = vi.fn()
    renderHook(() => useGlobalHotkey('r', handler, { meta: true }))
    // Shift 가 false 옵션이라 modifier 일치 검사가 막아야 함 — Shift True 면 안 발화.
    // 대문자 케이스 검사는 Shift 없이 e.key='R' 시뮬 (잘 안 일어나지만 toLowerCase 회귀 방어).
    dispatchKey('R', { meta: true })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('Ctrl+R(meta 아님)은 meta 옵션 활성 시 무시 — macOS 와 Linux 분리 보장', () => {
    const handler = vi.fn()
    renderHook(() => useGlobalHotkey('r', handler, { meta: true }))
    dispatchKey('r', { ctrl: true })
    expect(handler).not.toHaveBeenCalled()
  })

  it('preventDefault 호출 — Electron default 메뉴의 reload 가로채기 보장', () => {
    const handler = vi.fn()
    renderHook(() => useGlobalHotkey('r', handler, { meta: true }))
    const ev = dispatchKey('r', { meta: true })
    expect(ev.defaultPrevented).toBe(true)
  })

  it('unmount 후엔 핸들러가 호출되지 않는다 (cleanup 보장)', () => {
    const handler = vi.fn()
    const { unmount } = renderHook(() =>
      useGlobalHotkey('r', handler, { meta: true })
    )
    unmount()
    dispatchKey('r', { meta: true })
    expect(handler).not.toHaveBeenCalled()
  })
})
