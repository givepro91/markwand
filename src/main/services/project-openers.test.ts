import { afterEach, describe, expect, it, vi } from 'vitest'
import { listProjectOpeners, openProjectWithOpener, type ProjectOpenerDeps } from './project-openers'

describe('project-openers', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('detects installed apps from CLI/path signals and always exposes Finder on macOS', async () => {
    const access = vi.fn(async (target: string) => {
      if (target.includes('Terminal.app')) return
      throw new Error('ENOENT')
    })
    const execa = vi.fn(async (file: string, args?: string[]) => {
      if (file === '/usr/bin/which' && args?.[0] === 'code') return { stdout: '/usr/local/bin/code' }
      if (file === '/usr/bin/which') throw new Error('not found')
      if (file === '/usr/bin/mdfind') return { stdout: '' }
      return { stdout: '' }
    })
    const deps: ProjectOpenerDeps = {
      platform: 'darwin',
      homedir: () => '/Users/alice',
      access,
      execa,
    }

    const openers = await listProjectOpeners(deps)

    expect(openers.find((opener) => opener.id === 'finder')?.available).toBe(true)
    expect(openers.find((opener) => opener.id === 'terminal')?.available).toBe(true)
    expect(openers.find((opener) => opener.id === 'vscode')?.available).toBe(true)
    expect(openers.find((opener) => opener.id === 'cursor')?.available).toBe(false)
  })

  it('opens VS Code through the detected CLI before falling back to LaunchServices', async () => {
    const execa = vi.fn(async (file: string, args?: string[]) => {
      if (file === '/usr/bin/which' && args?.[0] === 'code') return { stdout: '/opt/homebrew/bin/code' }
      return { stdout: '' }
    })

    const result = await openProjectWithOpener('/Users/alice/work/app', 'vscode', {
      platform: 'darwin',
      access: vi.fn(async () => {
        throw new Error('ENOENT')
      }),
      execa,
    })

    expect(result.ok).toBe(true)
    expect(execa).toHaveBeenCalledWith('/opt/homebrew/bin/code', ['/Users/alice/work/app'], { timeout: 10_000 })
  })

  it('opens Finder without shell command interpolation', async () => {
    const openPath = vi.fn(async () => '')

    const result = await openProjectWithOpener('/Users/alice/work/app', 'finder', {
      platform: 'darwin',
      openPath,
    })

    expect(result.ok).toBe(true)
    expect(openPath).toHaveBeenCalledWith('/Users/alice/work/app')
  })

  it('opens iTerm2 through its actual AppleScript application name', async () => {
    const execa = vi.fn(async (file: string, args?: string[]) => {
      if (file === '/usr/bin/which') throw new Error('not found')
      void args
      return { stdout: '' }
    })
    const result = await openProjectWithOpener('/Users/alice/work/app', 'iterm2', {
      platform: 'darwin',
      access: vi.fn(async (target: string) => {
        if (target === '/Applications/iTerm.app') return
        throw new Error('ENOENT')
      }),
      execa,
    })

    expect(result.ok).toBe(true)
    const osascriptCall = execa.mock.calls.find(([file]) => file === 'osascript')
    expect(osascriptCall).toBeTruthy()
    expect(osascriptCall?.[1]?.join('\n')).toContain('tell application "iTerm"')
    expect(osascriptCall?.[1]?.join('\n')).not.toContain('tell application "iTerm2"')
  })

  it('opens Ghostty through LaunchServices and forces the shell into the project directory', async () => {
    const execa = vi.fn(async (file: string, args?: string[]) => {
      if (file === '/usr/bin/which') throw new Error('not found')
      void args
      return { stdout: '' }
    })
    const result = await openProjectWithOpener('/Users/alice/work/app', 'ghostty', {
      platform: 'darwin',
      access: vi.fn(async (target: string) => {
        if (target === '/Applications/Ghostty.app') return
        throw new Error('ENOENT')
      }),
      execa,
    })

    expect(result.ok).toBe(true)
    expect(execa).toHaveBeenCalledWith('/usr/bin/open', [
      '-n',
      '/Applications/Ghostty.app',
      '--args',
      '--working-directory=/Users/alice/work/app',
    ], { timeout: 10_000 })
    expect(execa.mock.calls.some(([file]) => file === 'osascript')).toBe(false)
    expect(execa.mock.calls.flatMap(([, args]) => args ?? [])).not.toContain('-e')
  })

  it('passes Ghostty paths as separate LaunchServices args without shell interpolation', async () => {
    const execa = vi.fn(async (file: string, args?: string[]) => {
      if (file === '/usr/bin/which') throw new Error('not found')
      void args
      return { stdout: '' }
    })
    const result = await openProjectWithOpener("/Users/alice/work/bob's app", 'ghostty', {
      platform: 'darwin',
      access: vi.fn(async (target: string) => {
        if (target === '/Applications/Ghostty.app') return
        throw new Error('ENOENT')
      }),
      execa,
    })

    expect(result.ok).toBe(true)
    expect(execa).toHaveBeenCalledWith('/usr/bin/open', [
      '-n',
      '/Applications/Ghostty.app',
      '--args',
      "--working-directory=/Users/alice/work/bob's app",
    ], { timeout: 10_000 })
  })

  it('does not try to open local apps on unsupported platforms', async () => {
    const result = await openProjectWithOpener('/Users/alice/work/app', 'finder', {
      platform: 'linux',
    })

    expect(result).toEqual({ ok: false, reason: 'PLATFORM_UNSUPPORTED' })
  })
})
