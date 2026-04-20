import fs from 'fs'
import { ipcMain } from 'electron'
import { getStore } from '../services/store'
import {
  parseComposerEstimateInput,
  assertInWorkspace,
} from '../security/validators'

export function registerComposerHandlers(): void {
  // 선택 paths bytes 합 기반 토큰 추정.
  // 휴리스틱: ceil(bytes / 3.5) × 1.35 (Claude 4.7 토크나이저 증가율, 보수적 상한).
  // 경로 검증 실패 시 해당 파일만 missing[]로 처리 — 부분 추정이 전체 실패보다 유용.
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
}
