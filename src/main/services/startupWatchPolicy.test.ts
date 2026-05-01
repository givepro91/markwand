import { describe, expect, it } from 'vitest'
import { shouldStartStartupWatcher } from './startupWatchPolicy'

describe('shouldStartStartupWatcher', () => {
  it('keeps startup file watching disabled by default to avoid CPU-heavy initial crawls', () => {
    expect(shouldStartStartupWatcher({})).toBe(false)
  })

  it('allows explicit opt-in for development or controlled dogfood runs', () => {
    expect(shouldStartStartupWatcher({ MARKWAND_ENABLE_STARTUP_WATCH: '1' })).toBe(true)
    expect(shouldStartStartupWatcher({ MARKWAND_ENABLE_STARTUP_WATCH: 'true' })).toBe(true)
    expect(shouldStartStartupWatcher({ MARKWAND_ENABLE_STARTUP_WATCH: 'yes' })).toBe(true)
  })

  it('does not enable watcher for arbitrary values', () => {
    expect(shouldStartStartupWatcher({ MARKWAND_ENABLE_STARTUP_WATCH: '0' })).toBe(false)
    expect(shouldStartStartupWatcher({ MARKWAND_ENABLE_STARTUP_WATCH: 'false' })).toBe(false)
  })
})
