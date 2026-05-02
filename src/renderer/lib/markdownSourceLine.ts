export interface MarkdownSourceTarget {
  line: number
  raw?: string
}

function attrNum(el: Element, name: string): number | null {
  const value = el.getAttribute(name)
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function findMarkdownSourceElement(container: HTMLElement, target: MarkdownSourceTarget): HTMLElement | null {
  if (!Number.isFinite(target.line) || target.line < 1) return null
  const raw = target.raw ? normalizeText(target.raw) : ''
  const candidates = Array.from(
    container.querySelectorAll<HTMLElement>('[data-source-start][data-source-end]'),
  ).filter((el) => {
    const start = attrNum(el, 'data-source-start')
    const end = attrNum(el, 'data-source-end')
    return start !== null && end !== null && start <= target.line && target.line <= end
  })
  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    const aStart = attrNum(a, 'data-source-start') ?? 0
    const aEnd = attrNum(a, 'data-source-end') ?? aStart
    const bStart = attrNum(b, 'data-source-start') ?? 0
    const bEnd = attrNum(b, 'data-source-end') ?? bStart
    const aTextMatch = raw && normalizeText(a.textContent ?? '').includes(raw) ? 0 : 1
    const bTextMatch = raw && normalizeText(b.textContent ?? '').includes(raw) ? 0 : 1
    const byText = aTextMatch - bTextMatch
    if (byText !== 0) return byText
    const bySpan = (aEnd - aStart) - (bEnd - bStart)
    if (bySpan !== 0) return bySpan
    return Math.abs(aStart - target.line) - Math.abs(bStart - target.line)
  })

  return candidates[0]
}

export function scrollMarkdownSourceLineIntoView(container: HTMLElement, target: MarkdownSourceTarget): boolean {
  const el = findMarkdownSourceElement(container, target)
  if (!el) return false

  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.setAttribute('data-drift-jump-target', 'true')
  window.setTimeout(() => {
    if (el.isConnected) el.removeAttribute('data-drift-jump-target')
  }, 1800)
  return true
}
