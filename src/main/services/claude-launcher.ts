import { execSync } from 'child_process'
import type { TerminalType } from '../../preload/types'

export interface LaunchResult {
  ok: boolean
  reason?: string
  version?: string
}

export function ensureLoginPath(): void {
  if (process.platform !== 'darwin') return
  if (process.env['_PATH_INJECTED']) return

  try {
    const out = execSync("/bin/bash -lc 'echo $PATH'", { encoding: 'utf8', timeout: 3000 })
    process.env['PATH'] = out.trim()
    process.env['_PATH_INJECTED'] = '1'
  } catch {
    // fallback
  }
}

export async function checkClaude(): Promise<{ available: boolean; version?: string }> {
  ensureLoginPath()

  const { default: which } = await import('which')
  const claudePath = await which('claude').catch(() => null)
  if (!claudePath) return { available: false }

  try {
    const { execa } = await import('execa')
    const { stdout } = await execa(claudePath, ['--version'], { timeout: 5000 })
    const version = stdout.trim().split('\n')[0]
    return { available: true, version }
  } catch {
    return { available: true }
  }
}

export async function openInClaude(absDir: string, terminal: TerminalType): Promise<LaunchResult> {
  // v0.2: win/linux 분기 자리
  if (process.platform !== 'darwin') {
    return { ok: false, reason: 'PLATFORM_UNSUPPORTED' }
  }

  ensureLoginPath()

  const { default: which } = await import('which')
  const claudePath = await which('claude').catch(() => null)
  if (!claudePath) return { ok: false, reason: 'CLAUDE_NOT_FOUND' }

  // TARGET_DIR을 ENV로 전달하여 문자열 직접 보간을 회피한다 (Plan R3, P0: D2)
  // 기존 창이 있으면 front window 에서 실행 (새 창 중복 방지)
  const script = `
    set p to system attribute "TARGET_DIR"
    tell application "${terminal}"
      activate
      if (count of windows) is 0 then
        do script "cd " & quoted form of p & " && claude"
      else
        do script "cd " & quoted form of p & " && claude" in front window
      end if
    end tell
  `

  try {
    const { execa } = await import('execa')
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
