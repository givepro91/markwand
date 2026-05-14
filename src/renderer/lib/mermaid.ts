let mermaidModule: typeof import('mermaid').default | null = null
let currentTheme: 'default' | 'dark' = 'default'

export type MermaidRenderResult =
  | { ok: true; svg: string }
  | { ok: false; message: string }

// Mermaid 11.x — 옵션 미지정 시 노드 텍스트 측정과 실제 렌더 폭이 불일치해 text 가 노드 밖으로 잘림.
// 루트 `htmlLabels: true`(v11.12.3+ 에서 flowchart 하위 옵션이 deprecated) + 앱 CSS 와 일치하는
// fontFamily/fontSize 로 deterministic 측정. flowchart.padding 상향 + useMaxWidth 유지.
function buildConfig(theme: 'default' | 'dark') {
  return {
    startOnLoad: false,
    theme,
    htmlLabels: true,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    themeVariables: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '14px',
    },
    flowchart: {
      htmlLabels: true,
      useMaxWidth: true,
      padding: 16,
      nodeSpacing: 50,
      rankSpacing: 60,
      diagramPadding: 12,
    },
  } as const
}

async function getMermaid() {
  if (!mermaidModule) {
    const mod = await import('mermaid')
    mermaidModule = mod.default
    mermaidModule.initialize(buildConfig(currentTheme))
  }
  return mermaidModule
}

export async function renderMermaid(id: string, code: string): Promise<MermaidRenderResult> {
  const m = await getMermaid()
  try {
    const { svg } = await m.render(id, code)
    return { ok: true, svg }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, message: msg }
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
  m.initialize(buildConfig(theme))
  listeners.forEach((fn) => fn())
}
