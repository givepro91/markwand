// useTransportStatus — Plan §S2.5 (DC-3 단일 훅 + aria-live + focus 복원).
//
// 책임:
//   - main → renderer 'transport:status' 이벤트 수신 → store 에 반영
//   - status 전이 시 aria-live 메시지 debounce (backoff 6회 SR 노이즈 방지, 기본 1000ms)
//   - connecting 진입 시 document.activeElement 저장 → connected 복귀 시 재-focus
//   - 단일 consumer 원칙: TransportBadge 외 다른 곳에서 직접 store 접근 금지

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../state/store'
import type { TransportStatus, TransportStatusEvent } from '../../../src/preload/types'

export interface UseTransportStatusResult {
  status: TransportStatus | 'idle'
  event: TransportStatusEvent | undefined
  /** aria-live polite region 에 낭독할 메시지 (debounce 후) */
  liveMessage: string
}

export interface UseTransportStatusOptions {
  /** aria-live debounce ms (기본 1000) */
  debounceMs?: number
}

const DEFAULT_DEBOUNCE = 1000

/**
 * 단일 workspaceId 에 대한 transport 상태 훅.
 * workspaceId 가 없으면 'idle' 반환 (UI 미표시).
 */
export function useTransportStatus(
  workspaceId: string | null,
  opts: UseTransportStatusOptions = {},
): UseTransportStatusResult {
  const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE
  const event = useAppStore((s) =>
    workspaceId ? s.transportStatuses[workspaceId] : undefined,
  )
  const status: TransportStatus | 'idle' = event?.status ?? 'idle'

  const focusRef = useRef<HTMLElement | null>(null)
  const [liveMessage, setLiveMessage] = useState<string>('')
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevStatusRef = useRef<TransportStatus | 'idle'>('idle')

  // aria-live 전파: connecting→connected 는 즉시, 그 외 전환은 debounce.
  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = status

    if (prev === status) return
    const msg = composeLiveMessage(status, event)
    if (!msg) return

    const immediate = prev === 'connecting' && status === 'connected'
    if (liveTimerRef.current) {
      clearTimeout(liveTimerRef.current)
      liveTimerRef.current = null
    }
    if (immediate) {
      setLiveMessage(msg)
    } else {
      liveTimerRef.current = setTimeout(() => {
        setLiveMessage(msg)
        liveTimerRef.current = null
      }, debounceMs)
    }
    return () => {
      if (liveTimerRef.current) {
        clearTimeout(liveTimerRef.current)
        liveTimerRef.current = null
      }
    }
  }, [status, event, debounceMs])

  // focus 복원: connecting 진입 시 activeElement 저장, connected 복귀 시 재-focus.
  useEffect(() => {
    if (status === 'connecting' && document.activeElement instanceof HTMLElement) {
      focusRef.current = document.activeElement
    }
    if (status === 'connected' && focusRef.current) {
      const target = focusRef.current
      focusRef.current = null
      if (document.contains(target)) {
        try {
          target.focus({ preventScroll: true })
        } catch {
          // focus 실패는 silent — 포커스 복원은 best-effort.
        }
      }
    }
  }, [status])

  return useMemo(
    () => ({ status, event, liveMessage }),
    [status, event, liveMessage],
  )
}

function composeLiveMessage(
  status: TransportStatus | 'idle',
  event: TransportStatusEvent | undefined,
): string {
  const label = event?.label ?? ''
  switch (status) {
    case 'connected':
      return label ? `Connected to ${label}` : 'Connected'
    case 'connecting':
      return label ? `Connecting to ${label}` : 'Connecting'
    case 'offline':
      return label ? `Offline: ${label}` : 'Offline'
    default:
      return ''
  }
}

/**
 * main 이벤트 구독 훅 — App 진입점에서 1회 호출하여 store 에 상태 반영.
 * window.api.ssh 가 없으면(preload 로딩 실패) no-op.
 */
export function useTransportStatusSubscription(): void {
  const setTransportStatus = useAppStore((s) => s.setTransportStatus)
  useEffect(() => {
    const api = window.api?.ssh
    if (!api?.onStatus) return
    const unsub = api.onStatus((event) => setTransportStatus(event))
    return () => {
      unsub()
    }
  }, [setTransportStatus])
}
