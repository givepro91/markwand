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

export interface OpenInClaudeOptions {
  contextFile?: string // 있으면 Composer 모드 — 새 창 강제 + `@<path>` 초기 프롬프트
}

export async function openInClaude(
  absDir: string,
  terminal: TerminalType,
  options: OpenInClaudeOptions = {}
): Promise<LaunchResult> {
  // v0.2: win/linux 분기 자리
  if (process.platform !== 'darwin') {
    return { ok: false, reason: 'PLATFORM_UNSUPPORTED' }
  }

  ensureLoginPath()

  const { default: which } = await import('which')
  const claudePath = await which('claude').catch(() => null)
  if (!claudePath) return { ok: false, reason: 'CLAUDE_NOT_FOUND' }

  // Ghostty는 AppleScript scripting suite를 구현하지 않는다(`do script` 실패).
  // 공식 가이드: `open -na Ghostty.app --args --working-directory=<dir> -e <command>`.
  // `open -na` 자체가 매 호출 새 창 생성 → Composer 새 창 강제가 자연스럽게 해결됨.
  if (terminal === 'Ghostty') {
    return openInGhostty(absDir, options, 'claude')
  }

  const script = options.contextFile
    ? buildComposerScript(terminal)
    : buildDefaultScript(terminal)

  try {
    const { execa } = await import('execa')
    await execa('osascript', ['-e', script], {
      env: {
        ...process.env,
        TARGET_DIR: absDir,
        ...(options.contextFile ? { CONTEXT_FILE: options.contextFile } : {}),
      },
      timeout: 10_000,
    })
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: msg }
  }
}

// bash/zsh 싱글쿼트 이스케이프 — 공백/따옴표/달러/백틱 안전.
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

// Ghostty 런칭 — claude / codex 공용. 내부 셸에서 login 프로파일을 거쳐야 PATH가 살아있으므로
// 명령을 `bash -lc` 래퍼로 감싼다. `open -na Ghostty.app --args ... -e <단일 명령 문자열>`.
export async function openInGhostty(
  absDir: string,
  options: { contextFile?: string },
  cli: 'claude' | 'codex',
  codexInstruction?: string
): Promise<LaunchResult> {
  let innerCmd: string
  if (cli === 'claude') {
    innerCmd = options.contextFile
      ? `claude ${shellQuote('@' + options.contextFile)}`
      : 'claude'
  } else {
    // codex: 반드시 contextFile과 instruction이 있어야 한다 (composer 전용 호출)
    if (!options.contextFile) return { ok: false, reason: 'CONTEXT_REQUIRED' }
    innerCmd = `codex exec ${shellQuote(codexInstruction ?? '다음 문서들을 바탕으로 작업해줘')} < ${shellQuote(options.contextFile)}`
  }
  // Ghostty 내부 셸은 user $SHELL — PATH는 login 프로파일에서 로드됨.
  // 그래도 안전을 위해 bash -lc로 로그인 셸 관행을 강제.
  const bashScript = `bash -lc ${shellQuote(innerCmd)}`

  try {
    const { execa } = await import('execa')
    await execa(
      'open',
      [
        '-na',
        'Ghostty.app',
        '--args',
        `--working-directory=${absDir}`,
        '-e',
        bashScript,
      ],
      { timeout: 10_000 }
    )
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: msg }
  }
}

// TARGET_DIR을 ENV로 전달하여 문자열 직접 보간을 회피한다 (Plan R3, P0: D2)
// 기존 창이 있으면 front window 에서 실행 (새 창 중복 방지)
function buildDefaultScript(terminal: TerminalType): string {
  if (terminal === 'iTerm2') {
    return `
      set p to system attribute "TARGET_DIR"
      tell application "iTerm2"
        activate
        if (count of windows) is 0 then
          set newWindow to (create window with default profile)
          tell current session of newWindow
            write text "cd " & quoted form of p & " && claude"
          end tell
        else
          tell current session of current window
            write text "cd " & quoted form of p & " && claude"
          end tell
        end if
      end tell
    `
  }
  return `
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
}

// Composer 모드: @<contextFile> 초기 프롬프트 + **새 창 강제 개방**.
// 동일 세션 중복 Send 시 기존 Claude 대화에 섞이지 않도록 `in front window` 생략.
// Ghostty는 AppleScript 지원이 불안정 — caller가 실패 시 클립보드 폴백 처리.
function buildComposerScript(terminal: TerminalType): string {
  if (terminal === 'iTerm2') {
    return `
      set p to system attribute "TARGET_DIR"
      set ctx to system attribute "CONTEXT_FILE"
      tell application "iTerm2"
        activate
        set newWindow to (create window with default profile)
        tell current session of newWindow
          write text "cd " & quoted form of p & " && claude " & quoted form of ("@" & ctx)
        end tell
      end tell
    `
  }
  return `
    set p to system attribute "TARGET_DIR"
    set ctx to system attribute "CONTEXT_FILE"
    tell application "${terminal}"
      activate
      do script "cd " & quoted form of p & " && claude " & quoted form of ("@" & ctx)
    end tell
  `
}
