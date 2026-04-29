/**
 * @vitest-environment jsdom
 *
 * 자가 검증 (CLAUDE.md "Self-QA First"):
 * 새로고침 시 현재 열린 문서 / 프로젝트 docs 가 재로드되는 동작이 다시 회귀하지 않도록 보장.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReloadOnRefresh } from './useReloadOnRefresh'
import { useAppStore } from '../state/store'

beforeEach(() => {
  // refreshKey 를 0 으로 초기화 — 다른 테스트가 bump 한 상태 영향을 차단.
  useAppStore.setState({ refreshKey: 0 })
})

describe('useReloadOnRefresh', () => {
  it('mount 시점에는 reload 가 호출되지 않는다 (mount = 새로고침 아님)', () => {
    const reload = vi.fn()
    renderHook(() => useReloadOnRefresh(reload))
    expect(reload).not.toHaveBeenCalled()
  })

  it('refreshKey 가 증가하면 reload 호출', () => {
    const reload = vi.fn()
    renderHook(() => useReloadOnRefresh(reload))
    act(() => {
      useAppStore.getState().bumpRefreshKey()
    })
    expect(reload).toHaveBeenCalledOnce()
  })

  it('연속된 새로고침마다 매번 reload 호출 (각 클릭 사이에 effect 가 flush 되는 실 사용 모델)', () => {
    const reload = vi.fn()
    renderHook(() => useReloadOnRefresh(reload))
    // 사용자가 버튼을 시간 간격을 두고 누르는 케이스 — 각 bump 사이에 effect flush.
    // 한 batch 안에 여러 번 bump 하면 React batching 으로 1회만 발화하지만,
    // 실제 UI 클릭/⌘R 은 별개 이벤트라 각각 commit 됨.
    act(() => {
      useAppStore.getState().bumpRefreshKey()
    })
    act(() => {
      useAppStore.getState().bumpRefreshKey()
    })
    act(() => {
      useAppStore.getState().bumpRefreshKey()
    })
    expect(reload).toHaveBeenCalledTimes(3)
  })

  it('호출자가 매 렌더 새 콜백을 넘겨도 최신 클로저가 호출 (stale 차단)', () => {
    const calls: string[] = []
    const { rerender } = renderHook(({ tag }: { tag: string }) =>
      useReloadOnRefresh(() => {
        calls.push(tag)
      }), { initialProps: { tag: 'v1' } }
    )
    rerender({ tag: 'v2' })
    rerender({ tag: 'v3' })
    act(() => {
      useAppStore.getState().bumpRefreshKey()
    })
    expect(calls).toEqual(['v3'])
  })

  it('unmount 후 새로고침 트리거는 무시 (cleanup 보장)', () => {
    const reload = vi.fn()
    const { unmount } = renderHook(() => useReloadOnRefresh(reload))
    unmount()
    act(() => {
      useAppStore.getState().bumpRefreshKey()
    })
    expect(reload).not.toHaveBeenCalled()
  })
})
