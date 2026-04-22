// SSH IPC 핸들러 등록 — Plan §S2 + Follow-up FS5/FS9.
//
// 채널:
//   - 'ssh:respond-host-key' (renderer → main) — TOFU 모달 응답 전달
//   - 'ssh:load-config' (renderer → main) — ~/.ssh/config 파싱 결과 반환 (FS5)
//   - 'ssh:browse-folder' (renderer → main) — 원격 폴더 picker (FS9)
//   - 'ssh:read-image' (renderer → main) — 원격 이미지 바이너리 fetch (FS9-B)
//
// 'ssh:host-key-prompt' 와 'transport:status' 는 main → renderer 이벤트로 send 만 함 — 핸들러 없음.

import { ipcMain } from 'electron'
import path from 'path'
import posix from 'node:path/posix'
import { resolveHostKeyPrompt } from '../transport/ssh/hostKeyPromptBridge'
import {
  parseSshRespondHostKeyInput,
  parseSshBrowseFolderInput,
  parseSshReadImageInput,
  assertInWorkspace,
} from '../security/validators'
import { loadSshConfig } from '../transport/ssh/config'
import { isSshTransportEnabled, getStore } from '../services/store'
import { createSshTransport } from '../transport/ssh'
import { getActiveTransport } from '../transport/resolve'

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

// FS9-B — 원격 이미지 2MB 상한. 로컬 fs:read-doc 과 동일 기준.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const ALLOWED_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'])

function mimeFromExt(ext: string): string {
  switch (ext) {
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.svg': return 'image/svg+xml'
    case '.gif': return 'image/gif'
    case '.webp': return 'image/webp'
    default: return 'application/octet-stream'
  }
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

  // Follow-up FS9-B — 원격 이미지 fetch. MarkdownViewer SshImage 컴포넌트가 호출.
  // workspaceId 를 함께 받아 pool 경유 transport 재사용 — 이미지마다 새 연결 생성 방지.
  ipcMain.handle(
    'ssh:read-image',
    async (_event, raw: unknown): Promise<{ data: Buffer; mime: string }> => {
      if (!(await isSshTransportEnabled())) {
        throw new Error('SSH_TRANSPORT_DISABLED')
      }
      const { workspaceId, path: docPath } = parseSshReadImageInput(raw)
      const ext = path.extname(docPath).toLowerCase()
      if (!ALLOWED_IMAGE_EXTS.has(ext)) {
        throw new Error('FORBIDDEN_EXT')
      }
      // 경계 검증 — SSH workspace root 내부만 허용.
      const store = await getStore()
      const workspaces = store.get('workspaces')
      const ws = workspaces.find((w) => w.id === workspaceId)
      if (!ws || ws.transport?.type !== 'ssh') {
        throw new Error('WORKSPACE_NOT_FOUND')
      }
      assertInWorkspace(docPath, [ws.root], { posix: true })

      const transport = await getActiveTransport(workspaceId)
      if (transport.kind !== 'ssh') throw new Error('SSH_TRANSPORT_EXPECTED')
      const data = await transport.fs.readFile(docPath, { maxBytes: MAX_IMAGE_BYTES })
      const mime = mimeFromExt(ext)
      return { data, mime }
    },
  )

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
