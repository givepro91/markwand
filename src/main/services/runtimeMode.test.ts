import { describe, expect, it } from 'vitest'
import { getDevRendererUrl, getDevWrapperPid, shouldAutoOpenDevTools } from './runtimeMode'

describe('runtimeMode', () => {
  it('ignores dev renderer env in packaged builds', () => {
    expect(getDevRendererUrl(true, { ELECTRON_RENDERER_URL: 'http://localhost:5173' })).toBeUndefined()
    expect(shouldAutoOpenDevTools(true, { ELECTRON_RENDERER_URL: 'http://localhost:5173' })).toBe(false)
  })

  it('ignores debug env in packaged builds', () => {
    expect(shouldAutoOpenDevTools(true, { MD_VIEWER_DEBUG: '1' })).toBe(false)
  })

  it('uses dev renderer URL without auto-opening DevTools by default', () => {
    expect(getDevRendererUrl(false, { ELECTRON_RENDERER_URL: 'http://localhost:5173' })).toBe('http://localhost:5173')
    expect(shouldAutoOpenDevTools(false, { ELECTRON_RENDERER_URL: 'http://localhost:5173' })).toBe(false)
    expect(shouldAutoOpenDevTools(false, { MD_VIEWER_DEBUG: '1' })).toBe(true)
    expect(shouldAutoOpenDevTools(false, { MD_VIEWER_DEBUG: 'true' })).toBe(true)
  })

  it('parses dev wrapper pid only for unpackaged dev runs', () => {
    expect(getDevWrapperPid(false, { MARKWAND_DEV_WRAPPER_PID: '12345' })).toBe(12345)
    expect(getDevWrapperPid(false, { MARKWAND_DEV_WRAPPER_PID: 'abc' })).toBeNull()
    expect(getDevWrapperPid(false, { MARKWAND_DEV_WRAPPER_PID: '-1' })).toBeNull()
    expect(getDevWrapperPid(true, { MARKWAND_DEV_WRAPPER_PID: '12345' })).toBeNull()
  })
})
