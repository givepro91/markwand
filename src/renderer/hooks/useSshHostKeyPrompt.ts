// useSshHostKeyPrompt — Plan §S2.1 (TOFU 모달 상태 훅).
//
// main 이 'ssh:host-key-prompt' 이벤트로 nonce + fingerprint 를 보내면 이 훅이 수신 → 큐에 적재.
// UI 가 큐의 첫 항목을 모달로 노출 + respond(true|false) 호출 → main IPC 응답 → 큐 shift.
//
// 복수 동시 요청 대응: 큐(FIFO) 로 처리. 현재 활성 prompt 는 queue[0].

import { useCallback, useEffect, useState } from 'react'
import type { HostKeyPromptPayload } from '../../../src/preload/types'

export interface UseSshHostKeyPromptResult {
  /** 현재 활성 prompt (없으면 null). */
  current: HostKeyPromptPayload | null
  /** 활성 prompt 에 응답. 큐 첫 항목을 제거 후 main IPC 호출. */
  respond: (trust: boolean, persistence?: 'session' | 'permanent') => Promise<void>
  /** 대기 큐 길이 (디버깅·e2e 용). */
  queueSize: number
}

export function useSshHostKeyPrompt(): UseSshHostKeyPromptResult {
  const [queue, setQueue] = useState<HostKeyPromptPayload[]>([])

  useEffect(() => {
    const api = window.api?.ssh
    if (!api?.onHostKeyPrompt) return
    const unsub = api.onHostKeyPrompt((data) => {
      setQueue((q) => [...q, data])
    })
    return () => {
      unsub()
    }
  }, [])

  const respond = useCallback(
    async (trust: boolean, persistence?: 'session' | 'permanent') => {
      const head = queue[0]
      if (!head) return
      try {
        await window.api.ssh.respondHostKey(head.nonce, trust, persistence)
      } finally {
        setQueue((q) => q.slice(1))
      }
    },
    [queue],
  )

  return {
    current: queue[0] ?? null,
    respond,
    queueSize: queue.length,
  }
}
