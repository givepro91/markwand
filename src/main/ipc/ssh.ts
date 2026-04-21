// SSH IPC 핸들러 등록 — Plan §S2 + Follow-up FS5.
//
// 채널:
//   - 'ssh:respond-host-key' (renderer → main) — TOFU 모달 응답 전달
//   - 'ssh:load-config' (renderer → main) — ~/.ssh/config 파싱 결과 반환 (FS5)
//
// 'ssh:host-key-prompt' 와 'transport:status' 는 main → renderer 이벤트로 send 만 함 — 핸들러 없음.

import { ipcMain } from 'electron'
import { resolveHostKeyPrompt } from '../transport/ssh/hostKeyPromptBridge'
import { parseSshRespondHostKeyInput } from '../security/validators'
import { loadSshConfig } from '../transport/ssh/config'
import { isSshTransportEnabled } from '../services/store'

export function registerSshIpcHandlers(): void {
  ipcMain.handle('ssh:respond-host-key', async (_event, raw: unknown) => {
    const { nonce, trust } = parseSshRespondHostKeyInput(raw)
    resolveHostKeyPrompt(nonce, trust)
  })

  // Follow-up FS5 — ~/.ssh/config 호스트 목록 반환. feature flag on 필수.
  // 파싱 결과는 allowed hosts + rejected hosts + permission warning 을 포함.
  ipcMain.handle('ssh:load-config', async () => {
    if (!(await isSshTransportEnabled())) {
      throw new Error('SSH_TRANSPORT_DISABLED')
    }
    return loadSshConfig()
  })
}
