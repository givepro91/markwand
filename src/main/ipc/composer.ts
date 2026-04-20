import fs from 'fs'
import { ipcMain } from 'electron'
import { getStore } from '../services/store'
import {
  parseComposerPrepareInput,
  parseComposerEstimateInput,
  assertInWorkspace,
} from '../security/validators'
import { buildContextFile } from '../services/context-builder'

export function registerComposerHandlers(): void {
  // 선택 paths bytes 합 기반 토큰 추정.
  // 휴리스틱: ceil(bytes / 3.5) × 1.35 (Claude 4.7 토크나이저 증가율, 보수적 상한).
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

  // Composer 핵심 IPC. 선택 paths를 임시 파일로 concat → contextFile 경로 반환.
  // 자동 런칭 없음 — renderer가 clipboard 복사 등으로 사용.
  ipcMain.handle('composer:prepare', async (_event, raw: unknown) => {
    const { paths } = parseComposerPrepareInput(raw)
    const store = await getStore()
    const workspaces = store.get('workspaces')
    const roots = workspaces.map((w) => w.root)

    try {
      const contextFile = await buildContextFile(paths, roots)
      return { ok: true, contextFile }
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'CONTEXT_BUILD_FAILED'
      return { ok: false, reason }
    }
  })
}
