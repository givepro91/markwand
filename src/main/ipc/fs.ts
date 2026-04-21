import { ipcMain } from 'electron'
import path from 'path'
import posix from 'node:path/posix'
import matter from 'gray-matter'
import { getStore } from '../services/store'
import { parseReadDocInput, assertInWorkspace } from '../security/validators'
import { classifyAsset } from '../../lib/viewable'
import { localTransport } from '../transport/local'
import { getActiveTransport } from '../transport/resolve'
import type { ReadDocResult, Workspace } from '../../preload/types'
import type { Transport } from '../transport/types'

const MAX_READ_BYTES = 2 * 1024 * 1024

/**
 * Follow-up FS1 — docPath 로부터 소속 workspace 와 해당 transport 를 역매핑한다.
 *
 * 경계 규칙:
 * - 로컬: `path.resolve` 후 `ws.root + path.sep` prefix 또는 동일 경로.
 * - SSH: `posix.resolve` 후 `ws.root + '/'` prefix 또는 동일 경로.
 *
 * RF-1 완화: 역매핑이 성공하더라도 호출부에서 `assertInWorkspace` 를 반드시 별도 호출해
 *  경계 검증의 단일 진실 공급원을 유지한다.
 *
 * @returns 매칭된 워크스페이스가 있으면 `{transport, ws}` 반환, 없으면 null.
 */
export async function resolveTransportForPath(
  docPath: string,
  workspaces: Workspace[]
): Promise<{ transport: Transport; ws: Workspace } | null> {
  for (const ws of workspaces) {
    const isSsh = ws.transport?.type === 'ssh'
    const p = isSsh ? posix : path
    const resolvedDoc = p.resolve(docPath)
    const resolvedRoot = p.resolve(ws.root)
    const belongs =
      resolvedDoc === resolvedRoot || resolvedDoc.startsWith(resolvedRoot + p.sep)
    if (!belongs) continue
    // Follow-up FS1 — SSH 는 pool 경유, 로컬은 singleton.
    const transport = isSsh ? await getActiveTransport(ws.id) : localTransport
    return { transport, ws }
  }
  return null
}

export function registerFsHandlers(): void {
  ipcMain.handle('fs:read-doc', async (_event, raw: unknown): Promise<ReadDocResult> => {
    const t0 = Date.now()
    const { path: docPath } = parseReadDocInput(raw)
    process.stderr.write(`[ipc] fs:read-doc start ${docPath}\n`)

    const store = await getStore()
    const workspaces = store.get('workspaces')

    // Follow-up FS1 — workspace 역매핑으로 transport 선택 + 경계 검증 분리.
    const resolved = await resolveTransportForPath(docPath, workspaces)
    if (!resolved) throw new Error('PATH_OUT_OF_WORKSPACE')
    const { transport, ws } = resolved

    // RF-1 — 역매핑 성공이 곧 허용이 아니다. assertInWorkspace 는 별도로 필수 호출.
    const isSsh = ws.transport?.type === 'ssh'
    assertInWorkspace(docPath, [ws.root], { posix: isSsh })

    // md만 텍스트로 파싱. 이미지 등 바이너리를 utf-8로 읽으면 matter()에 쓰레기가 들어가
    // MarkdownViewer에 깨진 텍스트로 렌더된다. 이미지는 app:// 프로토콜로 직접 로드해야 한다.
    if (classifyAsset(docPath) !== 'md') {
      throw new Error('NOT_A_TEXT_DOC')
    }

    // readFile 이 size-first + maxBytes 로 FILE_TOO_LARGE 를 자체 방어.
    const stat = await transport.fs.stat(docPath)
    const buf = await transport.fs.readFile(docPath, { maxBytes: MAX_READ_BYTES })
    const raw_content = buf.toString('utf-8')

    const parsed = matter(raw_content)
    process.stderr.write(`[ipc] fs:read-doc done ${docPath} (${Date.now() - t0}ms, ${raw_content.length}B, ${transport.kind})\n`)

    return {
      content: parsed.content,
      mtime: stat.mtimeMs,
      frontmatter: Object.keys(parsed.data).length > 0 ? parsed.data : undefined,
    }
  })
}
