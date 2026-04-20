import { useEffect, useRef } from 'react'

interface HotkeyOptions {
  meta?: boolean
  ctrl?: boolean
  shift?: boolean
}

export function useGlobalHotkey(
  key: string,
  handler: () => void,
  options?: HotkeyOptions
) {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })

  const meta = options?.meta ?? false
  const ctrl = options?.ctrl ?? false
  const shift = options?.shift ?? false

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === key.toLowerCase() &&
        !!e.metaKey === meta &&
        !!e.ctrlKey === ctrl &&
        !!e.shiftKey === shift
      ) {
        e.preventDefault()
        handlerRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [key, meta, ctrl, shift])
}
