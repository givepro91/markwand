let mermaidModule: typeof import('mermaid').default | null = null
let currentTheme: 'default' | 'dark' = 'default'

async function getMermaid() {
  if (!mermaidModule) {
    const mod = await import('mermaid')
    mermaidModule = mod.default
    mermaidModule.initialize({ startOnLoad: false, theme: currentTheme })
  }
  return mermaidModule
}

export async function renderMermaid(id: string, code: string): Promise<string> {
  const m = await getMermaid()
  try {
    const { svg } = await m.render(id, code)
    return svg
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return `<pre style="color:red">Mermaid error: ${msg}</pre>`
  }
}

// theme 변경 시 mermaid를 재초기화한다.
// 각 MermaidBlock 컴포넌트가 이 함수를 구독하여 재렌더를 트리거한다.
type ThemeListener = () => void
const listeners = new Set<ThemeListener>()

export function onMermaidThemeChange(fn: ThemeListener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export async function setMermaidTheme(isDark: boolean): Promise<void> {
  const theme = isDark ? 'dark' : 'default'
  if (theme === currentTheme) return
  currentTheme = theme

  const m = await getMermaid()
  m.initialize({ startOnLoad: false, theme })
  listeners.forEach((fn) => fn())
}
