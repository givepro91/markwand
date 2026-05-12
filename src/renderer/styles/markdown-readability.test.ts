import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const markdownCss = readFileSync(new URL('./markdown.css', import.meta.url), 'utf8')
const themesCss = readFileSync(new URL('./themes.css', import.meta.url), 'utf8')

function cssBlock(selector: RegExp): string {
  const match = themesCss.match(selector)
  if (!match) throw new Error(`Missing CSS block: ${selector}`)
  return match[1]
}

function cssHexVar(block: string, name: string): string {
  const match = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match) throw new Error(`Missing CSS variable: ${name}`)
  return match[1]
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
  const [r, g, b] = channels.map((channel) => (
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(foreground)
  const bg = relativeLuminance(background)
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
}

describe('markdown readability styles', () => {
  it('keeps the reader surface at a proven reading measure', () => {
    expect(markdownCss).toMatch(/max-width:\s*min\(100%,\s*840px\)/)
    expect(markdownCss).toMatch(/font-size:\s*16px/)
    expect(markdownCss).toMatch(/line-height:\s*1\.75/)
    expect(markdownCss).toMatch(/letter-spacing:\s*0/)
    expect(markdownCss).not.toMatch(/font-size:\s*(?:clamp|calc|[0-9.]+vw)/)
  })

  it('keeps markdown text and links above AA contrast in both themes', () => {
    const light = cssBlock(/:root,\s*\[data-theme="light"\]\s*{([\s\S]*?)\n}/)
    const dark = cssBlock(/\[data-theme="dark"\]\s*{([\s\S]*?)\n}/)

    expect(contrastRatio(cssHexVar(light, '--text'), cssHexVar(light, '--bg'))).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(cssHexVar(light, '--text-muted'), cssHexVar(light, '--bg'))).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(cssHexVar(light, '--accent'), cssHexVar(light, '--bg'))).toBeGreaterThanOrEqual(4.5)

    expect(contrastRatio(cssHexVar(dark, '--text'), cssHexVar(dark, '--bg'))).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(cssHexVar(dark, '--text-muted'), cssHexVar(dark, '--bg'))).toBeGreaterThanOrEqual(4.5)
    expect(markdownCss).toContain('[data-theme="dark"] .markdown-viewer a')
    expect(contrastRatio(cssHexVar(dark, '--accent-hover'), cssHexVar(dark, '--bg'))).toBeGreaterThanOrEqual(4.5)
  })
})
