// SSH IPC 핸들러 등록 — Plan §S2.
//
// 채널:
//   - 'ssh:respond-host-key' (renderer → main) — TOFU 모달 응답 전달
//
// 'ssh:host-key-prompt' 와 'transport:status' 는 main → renderer 이벤트로 send 만 함 — 핸들러 없음.

import { ipcMain } from 'electron'
import { resolveHostKeyPrompt } from '../transport/ssh/hostKeyPromptBridge'
import { parseSshRespondHostKeyInput } from '../security/validators'

export function registerSshIpcHandlers(): void {
  ipcMain.handle('ssh:respond-host-key', async (_event, raw: unknown) => {
    const { nonce, trust } = parseSshRespondHostKeyInput(raw)
    resolveHostKeyPrompt(nonce, trust)
  })
}
