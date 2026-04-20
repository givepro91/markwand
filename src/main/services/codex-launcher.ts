import { ensureLoginPath } from './claude-launcher'
import type { TerminalType } from '../../preload/types'

export interface CodexLaunchResult {
  ok: boolean
  reason?: string
  version?: string
}

const DEFAULT_INSTRUCTION = '다음 문서들을 바탕으로 작업해줘'

export async function checkCodex(): Promise<{ available: boolean; version?: string }> {
  ensureLoginPath()
  const { default: which } = await import('which')
  const codexPath = await which('codex').catch(() => null)
  if (!codexPath) return { available: false }

  try {
    const { execa } = await import('execa')
    const { stdout } = await execa(codexPath, ['--version'], { timeout: 5000 })
    const version = stdout.trim().split('\n')[0]
    return { available: true, version }
  } catch {
    return { available: true }
  }
}

/**
 * Codex `exec` 비대화형 모드로 컨텍스트 파일을 stdin 파이프 전달.
 * 대화형 TUI가 아닌 단발 응답 실행임을 UI 레이블에 반드시 명시.
 */
export async function openInCodex(
  absDir: string,
  terminal: TerminalType,
  opts: { contextFile: string; instruction?: string }
): Promise<CodexLaunchResult> {
  if (process.platform !== 'darwin') {
    return { ok: false, reason: 'PLATFORM_UNSUPPORTED' }
  }

  ensureLoginPath()

  const { default: which } = await import('which')
  const codexPath = await which('codex').catch(() => null)
  if (!codexPath) return { ok: false, reason: 'CODEX_NOT_FOUND' }

  const instruction = opts.instruction?.trim() || DEFAULT_INSTRUCTION
  const script = buildCodexScript(terminal)

  try {
    const { execa } = await import('execa')
    await execa('osascript', ['-e', script], {
      env: {
        ...process.env,
        TARGET_DIR: absDir,
        CONTEXT_FILE: opts.contextFile,
        CODEX_INSTRUCTION: instruction,
      },
      timeout: 10_000,
    })
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: msg }
  }
}

function buildCodexScript(terminal: TerminalType): string {
  if (terminal === 'iTerm2') {
    return `
      set p to system attribute "TARGET_DIR"
      set ctx to system attribute "CONTEXT_FILE"
      set ins to system attribute "CODEX_INSTRUCTION"
      tell application "iTerm2"
        activate
        set newWindow to (create window with default profile)
        tell current session of newWindow
          write text "cd " & quoted form of p & " && codex exec " & quoted form of ins & " < " & quoted form of ctx
        end tell
      end tell
    `
  }
  return `
    set p to system attribute "TARGET_DIR"
    set ctx to system attribute "CONTEXT_FILE"
    set ins to system attribute "CODEX_INSTRUCTION"
    tell application "${terminal}"
      activate
      do script "cd " & quoted form of p & " && codex exec " & quoted form of ins & " < " & quoted form of ctx
    end tell
  `
}

// bash/zsh 싱글쿼트 이스케이프 — 공백/백틱/달러/따옴표 모두 안전.
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/**
 * AppleScript 런칭 실패 시 폴백용 쉘 커맨드 조립.
 * 클립보드 복사로 사용자가 수동 붙여넣기할 수 있게.
 */
export function buildCodexFallbackCommand(
  absDir: string,
  contextFile: string,
  instruction?: string
): string {
  const ins = instruction?.trim() || DEFAULT_INSTRUCTION
  return `cd ${shellQuote(absDir)} && codex exec ${shellQuote(ins)} < ${shellQuote(contextFile)}`
}
