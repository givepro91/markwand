import { ipcMain } from 'electron'
import { getStore } from '../services/store'
import {
  parseComposerEstimateInput,
  assertInWorkspace,
} from '../security/validators'
import { classifyAsset } from '../../lib/viewable'
import { localTransport } from '../transport/local'

export function registerComposerHandlers(): void {
  // 선택 paths bytes 합 기반 토큰 추정.
  // 휴리스틱: ceil(bytes / 3.5) × 1.35 (Claude 4.7 토크나이저 증가율, 보수적 상한).
  // 경로 검증 실패 시 해당 파일만 missing[]로 처리 — 부분 추정이 전체 실패보다 유용.
  // non-md 자산(이미지 등)은 Composer 대상이 아니므로 missing으로 분류해
  // 렌더러 UI가 bytes/token에 포함하지 않도록 이중 방어 (FileTree Checkbox 차단이 1차).
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
        if (classifyAsset(p) !== 'md') {
          missing.push(p)
          continue
        }
        const stat = await localTransport.fs.stat(p)
        bytes += stat.size
      } catch {
        missing.push(p)
      }
    }

    const estimatedTokens = Math.ceil((bytes / 3.5) * 1.35)
    return { bytes, estimatedTokens, missing }
  })
}
