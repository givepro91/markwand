// SSH IPC 핸들러 등록 — Plan §S2 + Follow-up FS5/FS9.
//
// 채널:
//   - 'ssh:respond-host-key' (renderer → main) — TOFU 모달 응답 전달
//   - 'ssh:load-config' (renderer → main) — ~/.ssh/config 파싱 결과 반환 (FS5)
//   - 'ssh:browse-folder' (renderer → main) — 원격 폴더 picker (FS9)
//
// 'ssh:host-key-prompt' 와 'transport:status' 는 main → renderer 이벤트로 send 만 함 — 핸들러 없음.

import { ipcMain } from 'electron'
import posix from 'node:path/posix'
import { resolveHostKeyPrompt } from '../transport/ssh/hostKeyPromptBridge'
import {
  parseSshRespondHostKeyInput,
  parseSshBrowseFolderInput,
} from '../security/validators'
import { loadSshConfig } from '../transport/ssh/config'
import { isSshTransportEnabled } from '../services/store'
import { createSshTransport } from '../transport/ssh'

const S_IFMT = 0o170000
const S_IFDIR = 0o040000
function isDir(mode: number): boolean {
  return (mode & S_IFMT) === S_IFDIR
}

export interface SshBrowseResult {
  path: string
  parent: string | null
  entries: { name: string; isDirectory: boolean }[]
}

export function registerSshIpcHandlers(): void {
  ipcMain.handle('ssh:respond-host-key', async (_event, raw: unknown) => {
    const { nonce, trust } = parseSshRespondHostKeyInput(raw)
    resolveHostKeyPrompt(nonce, trust)
  })

  // Follow-up FS5 — ~/.ssh/config 호스트 목록 반환. feature flag on 필수.
  ipcMain.handle('ssh:load-config', async () => {
    if (!(await isSshTransportEnabled())) {
      throw new Error('SSH_TRANSPORT_DISABLED')
    }
    return loadSshConfig()
  })

  // Follow-up FS9 — 원격 폴더 picker. workspace 등록 전 단계에서 임시 연결로 디렉토리 탐색.
  // TOFU 모달은 bridge 기본 경로로 자동 트리거. dispose 로 즉시 정리 (pool 미경유).
  ipcMain.handle('ssh:browse-folder', async (_event, raw: unknown): Promise<SshBrowseResult> => {
    if (!(await isSshTransportEnabled())) {
      throw new Error('SSH_TRANSPORT_DISABLED')
    }
    const input = parseSshBrowseFolderInput(raw)
    const path = input.path
    const transport = await createSshTransport({
      host: input.host,
      port: input.port,
      username: input.user,
      auth: input.auth,
    })
    try {
      const sftp = transport.client.getSftp()
      const entries = await sftp.readdir(path)
      const mapped = entries
        .filter((e) => !e.filename.startsWith('.')) // 숨김 파일 UI 노출 안 함
        .map((e) => ({ name: e.filename, isDirectory: isDir(e.attrs.mode) }))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
          return a.name.localeCompare(b.name)
        })
      const normalized = posix.resolve(path)
      const parent = normalized === '/' ? null : posix.dirname(normalized)
      return { path: normalized, parent, entries: mapped }
    } finally {
      await transport.dispose()
    }
  })
}
