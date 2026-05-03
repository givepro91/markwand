import { shell } from 'electron'
import { access } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { ProjectOpenerId, ProjectOpenerInfo, ProjectOpenResult, TerminalType } from '../../preload/types'
import { ensureLoginPath } from './claude-launcher'

interface ProjectOpenerDefinition {
  id: ProjectOpenerId
  label: string
  appName?: string
  appPaths?: string[]
  bundleIds?: string[]
  cli?: string
  system?: boolean
  terminal?: TerminalType
}

interface ExecResult {
  stdout?: string
}

export interface ProjectOpenerDeps {
  platform?: NodeJS.Platform
  homedir?: () => string
  access?: (target: string) => Promise<void>
  execa?: (file: string, args?: string[], options?: Record<string, unknown>) => Promise<ExecResult>
  openPath?: (target: string) => Promise<string>
}

const OPENERS: ProjectOpenerDefinition[] = [
  {
    id: 'vscode',
    label: 'VS Code',
    appName: 'Visual Studio Code',
    appPaths: ['/Applications/Visual Studio Code.app', '~/Applications/Visual Studio Code.app'],
    bundleIds: ['com.microsoft.VSCode'],
    cli: 'code',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    appName: 'Cursor',
    appPaths: ['/Applications/Cursor.app', '~/Applications/Cursor.app'],
    bundleIds: ['com.todesktop.230313mzl4w4u92'],
    cli: 'cursor',
  },
  { id: 'finder', label: 'Finder', system: true },
  {
    id: 'terminal',
    label: 'Terminal',
    appName: 'Terminal',
    appPaths: ['/System/Applications/Utilities/Terminal.app', '/Applications/Utilities/Terminal.app'],
    bundleIds: ['com.apple.Terminal'],
    terminal: 'Terminal',
  },
  {
    id: 'iterm2',
    label: 'iTerm2',
    appName: 'iTerm',
    appPaths: ['/Applications/iTerm.app', '~/Applications/iTerm.app'],
    bundleIds: ['com.googlecode.iterm2'],
    terminal: 'iTerm2',
  },
  {
    id: 'ghostty',
    label: 'Ghostty',
    appName: 'Ghostty',
    appPaths: ['/Applications/Ghostty.app', '~/Applications/Ghostty.app'],
    bundleIds: ['com.mitchellh.ghostty'],
    terminal: 'Ghostty',
  },
  {
    id: 'xcode',
    label: 'Xcode',
    appName: 'Xcode',
    appPaths: ['/Applications/Xcode.app', '~/Applications/Xcode.app'],
    bundleIds: ['com.apple.dt.Xcode'],
  },
  {
    id: 'intellij',
    label: 'IntelliJ IDEA',
    appName: 'IntelliJ IDEA',
    appPaths: ['/Applications/IntelliJ IDEA.app', '~/Applications/IntelliJ IDEA.app'],
    bundleIds: ['com.jetbrains.intellij', 'com.jetbrains.intellij.ce'],
  },
]

let openersCache: { at: number; items: ProjectOpenerInfo[] } | null = null
const OPENERS_CACHE_TTL_MS = 10_000

function resolveHomePath(rawPath: string, homeDir: string): string {
  if (rawPath === '~') return homeDir
  if (rawPath.startsWith('~/')) return path.join(homeDir, rawPath.slice(2))
  return rawPath
}

async function getExeca(deps?: ProjectOpenerDeps): Promise<ProjectOpenerDeps['execa']> {
  if (deps?.execa) return deps.execa
  const { execa } = await import('execa')
  return execa
}

async function getWhichPath(command: string, deps?: ProjectOpenerDeps): Promise<string | null> {
  ensureLoginPath()
  if (deps?.execa) {
    try {
      const result = await deps.execa('/usr/bin/which', [command], { timeout: 800 })
      return result.stdout?.trim() || null
    } catch {
      return null
    }
  }
  try {
    const { default: which } = await import('which')
    return await which(command)
  } catch {
    const execa = await getExeca(deps)
    try {
      const result = await execa?.('/usr/bin/which', [command], { timeout: 800 })
      return result?.stdout?.trim() || null
    } catch {
      return null
    }
  }
}

async function pathExists(target: string, deps?: ProjectOpenerDeps): Promise<boolean> {
  try {
    await (deps?.access ?? access)(target)
    return true
  } catch {
    return false
  }
}

async function findExistingAppPath(opener: ProjectOpenerDefinition, deps?: ProjectOpenerDeps): Promise<string | null> {
  const homeDir = deps?.homedir?.() ?? os.homedir()
  for (const appPath of opener.appPaths ?? []) {
    const resolved = resolveHomePath(appPath, homeDir)
    if (await pathExists(resolved, deps)) return resolved
  }
  return null
}

async function spotlightHasApp(bundleIds: string[], deps?: ProjectOpenerDeps): Promise<boolean> {
  if (bundleIds.length === 0) return false
  const execa = await getExeca(deps)
  if (!execa) return false
  const query = bundleIds.map((id) => `kMDItemCFBundleIdentifier == "${id}"`).join(' || ')
  try {
    const result = await execa('/usr/bin/mdfind', [query], { timeout: 1_200 })
    return Boolean(result.stdout?.trim())
  } catch {
    return false
  }
}

async function isOpenerAvailable(opener: ProjectOpenerDefinition, deps?: ProjectOpenerDeps): Promise<boolean> {
  const platform = deps?.platform ?? process.platform
  if (platform !== 'darwin') return false
  if (opener.system) return true

  if (opener.cli && (await getWhichPath(opener.cli, deps))) return true

  if (await findExistingAppPath(opener, deps)) return true

  return spotlightHasApp(opener.bundleIds ?? [], deps)
}

export async function listProjectOpeners(deps?: ProjectOpenerDeps): Promise<ProjectOpenerInfo[]> {
  if (!deps && openersCache && Date.now() - openersCache.at < OPENERS_CACHE_TTL_MS) {
    return openersCache.items
  }
  const availability = await Promise.all(OPENERS.map(async (opener) => {
    try {
      return await isOpenerAvailable(opener, deps)
    } catch {
      // App detection is best-effort. A broken Spotlight/which signal must not
      // hide Finder or make the whole menu look empty.
      return opener.system === true && (deps?.platform ?? process.platform) === 'darwin'
    }
  }))
  const items = OPENERS.map((opener, index) => ({
    id: opener.id,
    label: opener.label,
    available: availability[index],
  }))
  if (!deps) openersCache = { at: Date.now(), items }
  return items
}

async function openTerminalAt(absDir: string, terminal: TerminalType, deps?: ProjectOpenerDeps): Promise<ProjectOpenResult> {
  const execa = await getExeca(deps)
  if (!execa) return { ok: false, reason: 'OPEN_FAILED' }

  if (terminal === 'Ghostty') {
    const ghostty = OPENERS.find((item) => item.id === 'ghostty')
    const appPath = ghostty ? await findExistingAppPath(ghostty, deps) : null
    const args = appPath
      ? ['-n', appPath, '--args', `--working-directory=${absDir}`]
      : ['-na', 'Ghostty.app', '--args', `--working-directory=${absDir}`]
    try {
      await execa('/usr/bin/open', args, { timeout: 10_000 })
      return { ok: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, reason: msg }
    }
  }

  const script = terminal === 'iTerm2'
    ? `
    set p to system attribute "TARGET_DIR"
    tell application "iTerm"
      activate
      if (count of windows) is 0 then
        create window with default profile
      else
        tell current window
          create tab with default profile
        end tell
      end if
      tell current session of current window
        write text "cd " & quoted form of p
      end tell
    end tell
  `
    : `
    set p to system attribute "TARGET_DIR"
    tell application "${terminal}"
      activate
      if (count of windows) is 0 then
        do script "cd " & quoted form of p
      else
        do script "cd " & quoted form of p in front window
      end if
    end tell
  `

  try {
    await execa('osascript', ['-e', script], {
      env: { ...process.env, TARGET_DIR: absDir },
      timeout: 10_000,
    })
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: msg }
  }
}

export async function openProjectWithOpener(
  projectRoot: string,
  openerId: ProjectOpenerId,
  deps?: ProjectOpenerDeps
): Promise<ProjectOpenResult> {
  const platform = deps?.platform ?? process.platform
  if (platform !== 'darwin') return { ok: false, reason: 'PLATFORM_UNSUPPORTED' }

  const opener = OPENERS.find((item) => item.id === openerId)
  if (!opener) return { ok: false, reason: 'OPENER_NOT_FOUND' }
  if (!(await isOpenerAvailable(opener, deps))) return { ok: false, reason: 'OPENER_NOT_AVAILABLE' }

  if (opener.id === 'finder') {
    const failedReason = await (deps?.openPath ?? shell.openPath)(projectRoot)
    return failedReason ? { ok: false, reason: failedReason } : { ok: true }
  }

  if (opener.terminal) {
    return openTerminalAt(projectRoot, opener.terminal, deps)
  }

  try {
    const cliPath = opener.cli ? await getWhichPath(opener.cli, deps) : null
    const execa = await getExeca(deps)
    if (!execa) return { ok: false, reason: 'OPEN_FAILED' }

    if (cliPath) {
      await execa(cliPath, [projectRoot], { timeout: 10_000 })
      return { ok: true }
    }

    if (!opener.appName) return { ok: false, reason: 'OPEN_FAILED' }
    await execa('/usr/bin/open', ['-a', opener.appName, projectRoot], { timeout: 10_000 })
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: msg }
  }
}
