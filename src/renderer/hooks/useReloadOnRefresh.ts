import { useEffect, useRef } from 'react'
import { useAppStore } from '../state/store'

/**
 * store.refreshKey 변경(=명시 새로고침 / 자동 fs:project-change)에 반응해 reload 콜백을 호출.
 *
 * - mount 첫 발화는 무시 (deps 가 무엇이든 useEffect 가 한 번 도는 React 동작에서 중복 호출 방지).
 * - reload 콜백은 ref 로 받아 stale closure 회피 — 호출자가 매 렌더 새 클로저를 넘겨도 안전.
 * - 호출자가 reload 내부에서 nullable 가드(예: !selectedDoc) 를 직접 처리.
 */
export function useReloadOnRefresh(reload: () => void): void {
  const refreshKey = useAppStore((s) => s.refreshKey)
  const reloadRef = useRef(reload)
  useEffect(() => {
    reloadRef.current = reload
  })
  const isFirstRef = useRef(true)
  useEffect(() => {
    if (isFirstRef.current) {
      isFirstRef.current = false
      return
    }
    reloadRef.current()
  }, [refreshKey])
}
