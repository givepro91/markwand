import fs from 'fs'
import { clipboard, ipcMain } from 'electron'
import { getStore } from '../services/store'
import {
  parseComposerSendInput,
  parseComposerEstimateInput,
  assertInWorkspace,
} from '../security/validators'
import { buildContextFile } from '../services/context-builder'
import { openInClaude } from '../services/claude-launcher'
import { openInCodex, checkCodex, buildCodexFallbackCommand } from '../services/codex-launcher'

// bash/zsh 싱글쿼트 이스케이프 — 공백/백틱/달러/따옴표 모두 안전.
// 내부 `'`는 `'\''`로 닫고 이스케이프 후 재개방.
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

function buildClaudeFallbackCommand(absDir: string, contextFile: string): string {
  return `cd ${shellQuote(absDir)} && claude ${shellQuote('@' + contextFile)}`
}

export function registerComposerHandlers(): void {
  // Codex CLI 존재/버전 검출
  ipcMain.handle('codex:check', async () => {
    return checkCodex()
  })

  // 선택된 paths의 bytes 합 기반 토큰 추정.
  // 휴리스틱: ceil(bytes / 3.5) × 1.35 (Claude 4.7 토크나이저 증가율 반영, 보수적 상한).
  ipcMain.handle('composer:estimate-tokens', async (_event, raw: unknown) => {
    const { paths } = parseComposerEstimateInput(raw)
    const store = await getStore()
    const workspaces = store.get('workspaces')
    const roots = workspaces.map((w) => w.root)

    let bytes = 0
    const missing: string[] = []
    for (const p of paths) {
      try {
        assertInWorkspace(p, roots)
        const stat = await fs.promises.stat(p)
        bytes += stat.size
      } catch {
        missing.push(p)
      }
    }

    const estimatedTokens = Math.ceil((bytes / 3.5) * 1.35)
    return { bytes, estimatedTokens, missing }
  })

  // Composer의 핵심 IPC. 선택 paths를 임시 파일로 concat → Claude/Codex 실행.
  ipcMain.handle('composer:send', async (_event, raw: unknown) => {
    const input = parseComposerSendInput(raw)
    const store = await getStore()
    const workspaces = store.get('workspaces')
    const roots = workspaces.map((w) => w.root)

    // projectDir 도 검증 (터미널 cd 대상)
    try {
      assertInWorkspace(input.projectDir, roots)
    } catch {
      return { ok: false, reason: 'PATH_OUT_OF_WORKSPACE' }
    }

    let contextFile: string
    try {
      contextFile = await buildContextFile(input.paths, roots)
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'CONTEXT_BUILD_FAILED'
      return { ok: false, reason }
    }

    if (input.target === 'claude') {
      const result = await openInClaude(input.projectDir, input.terminal, { contextFile })
      if (result.ok) {
        return { ok: true, contextFile }
      }
      // AppleScript 실패 → 클립보드 폴백
      clipboard.writeText(buildClaudeFallbackCommand(input.projectDir, contextFile))
      return {
        ok: false,
        reason: 'LAUNCH_FAILED',
        contextFile,
        fallbackCopied: true,
      }
    }

    // target === 'codex'
    const codexResult = await openInCodex(input.projectDir, input.terminal, {
      contextFile,
      instruction: input.instruction,
    })
    if (codexResult.ok) {
      return { ok: true, contextFile }
    }
    if (codexResult.reason === 'CODEX_NOT_FOUND') {
      return { ok: false, reason: 'CODEX_NOT_FOUND', contextFile }
    }
    clipboard.writeText(
      buildCodexFallbackCommand(input.projectDir, contextFile, input.instruction)
    )
    return {
      ok: false,
      reason: 'LAUNCH_FAILED',
      contextFile,
      fallbackCopied: true,
    }
  })
}
