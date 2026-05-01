import { describe, expect, it } from 'vitest'
import { getDevRendererUrl, shouldAutoOpenDevTools } from './runtimeMode'

describe('runtimeMode', () => {
  it('ignores dev renderer env in packaged builds', () => {
    expect(getDevRendererUrl(true, { ELECTRON_RENDERER_URL: 'http://localhost:5173' })).toBeUndefined()
    expect(shouldAutoOpenDevTools(true, { ELECTRON_RENDERER_URL: 'http://localhost:5173' })).toBe(false)
  })

  it('ignores debug env in packaged builds', () => {
    expect(shouldAutoOpenDevTools(true, { MD_VIEWER_DEBUG: '1' })).toBe(false)
  })

  it('uses dev renderer URL and DevTools only in unpackaged builds', () => {
    expect(getDevRendererUrl(false, { ELECTRON_RENDERER_URL: 'http://localhost:5173' })).toBe('http://localhost:5173')
    expect(shouldAutoOpenDevTools(false, { ELECTRON_RENDERER_URL: 'http://localhost:5173' })).toBe(true)
    expect(shouldAutoOpenDevTools(false, { MD_VIEWER_DEBUG: '1' })).toBe(true)
  })
})
