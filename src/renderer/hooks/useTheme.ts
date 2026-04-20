import { useState, useEffect, useCallback } from 'react'
import type { ThemeType } from '../../../src/preload/types'
import { setMermaidTheme } from '../lib/mermaid'

function resolveEffectiveTheme(theme: ThemeType): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyThemeToHtml(effective: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', effective)
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeType>('system')

  // 초기값 복원
  useEffect(() => {
    window.api.prefs.get('theme').then((stored) => {
      const t = (stored as ThemeType | null) ?? 'system'
      setThemeState(t)
      const effective = resolveEffectiveTheme(t)
      applyThemeToHtml(effective)
      setMermaidTheme(effective === 'dark')
    })
  }, [])

  // system 테마일 때 OS 변경 감지
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      const effective = resolveEffectiveTheme('system')
      applyThemeToHtml(effective)
      setMermaidTheme(effective === 'dark')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const setTheme = useCallback(async (next: ThemeType) => {
    setThemeState(next)
    await window.api.theme.set(next)
    const effective = resolveEffectiveTheme(next)
    applyThemeToHtml(effective)
    setMermaidTheme(effective === 'dark')
  }, [])

  return { theme, setTheme }
}
