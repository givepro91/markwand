import { ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import posix from 'node:path/posix'
import matter from 'gray-matter'
import { getStore } from '../services/store'
import {
  parseFsCreateFolderInput,
  parseFsCreateMarkdownInput,
  parseFsRenameInput,
  parseFsTrashInput,
  parseReadDocInput,
  assertInWorkspace,
} from '../security/validators'
import { classifyAsset, isViewable } from '../../lib/viewable'
import { localTransport } from '../transport/local'
import { getActiveTransport } from '../transport/resolve'
import type { FsEntryResult, ReadDocResult, Workspace } from '../../preload/types'
import type { Transport } from '../transport/types'

const MAX_READ_BYTES = 2 * 1024 * 1024
const MARKDOWN_EXT = '.md'

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

function ensureLocalProjectPath(
  targetPath: string,
  projectRoot: string,
  ws: Workspace,
): void {
  if (ws.transport?.type === 'ssh') throw new Error('REMOTE_WRITE_UNSUPPORTED')
  assertInWorkspace(targetPath, [projectRoot], { posix: false })
}

async function resolveWritableProject(projectRoot: string, workspaces: Workspace[]): Promise<Workspace> {
  const resolved = await resolveTransportForPath(projectRoot, workspaces)
  if (!resolved) throw new Error('PATH_OUT_OF_WORKSPACE')
  if (resolved.transport.kind !== 'local' || resolved.ws.transport?.type === 'ssh') {
    throw new Error('REMOTE_WRITE_UNSUPPORTED')
  }
  assertInWorkspace(projectRoot, [resolved.ws.root], { posix: false })
  return resolved.ws
}

export function normalizeMarkdownFileName(rawName: string): string {
  const trimmed = rawName.trim()
  const ext = path.extname(trimmed)
  const next = ext ? trimmed : `${trimmed}${MARKDOWN_EXT}`
  if (path.extname(next).toLowerCase() !== MARKDOWN_EXT) {
    throw new Error('INVALID_MARKDOWN_EXTENSION')
  }
  return next
}

export function normalizeRenameFileName(currentName: string, rawName: string): string {
  const trimmed = rawName.trim()
  const currentExt = path.extname(currentName)
  const next = path.extname(trimmed) ? trimmed : `${trimmed}${currentExt}`
  if (!isViewable(next)) throw new Error('UNSUPPORTED_FILE_TYPE')
  if (path.extname(next).toLowerCase() !== currentExt.toLowerCase()) {
    throw new Error('INVALID_RENAME_EXTENSION')
  }
  return next
}

function titleFromMarkdownName(fileName: string): string {
  return path.basename(fileName, MARKDOWN_EXT).replace(/[#\r\n]/g, ' ').trim() || 'Untitled'
}

async function buildEntryResult(absPath: string): Promise<FsEntryResult> {
  const stat = await fs.promises.stat(absPath)
  return {
    path: absPath,
    name: path.basename(absPath),
    mtime: stat.mtimeMs,
    size: stat.size,
  }
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
      rawContent: raw_content,
      mtime: stat.mtimeMs,
      frontmatter: Object.keys(parsed.data).length > 0 ? parsed.data : undefined,
    }
  })

  ipcMain.handle('fs:create-markdown', async (_event, raw: unknown): Promise<FsEntryResult> => {
    const { projectRoot, dirPath, name } = parseFsCreateMarkdownInput(raw)
    const store = await getStore()
    const ws = await resolveWritableProject(projectRoot, store.get('workspaces'))
    const fileName = normalizeMarkdownFileName(name)
    const targetPath = path.join(dirPath, fileName)
    ensureLocalProjectPath(dirPath, projectRoot, ws)
    ensureLocalProjectPath(targetPath, projectRoot, ws)
    if (await localTransport.fs.access(targetPath)) throw new Error('FILE_EXISTS')

    const content = `# ${titleFromMarkdownName(fileName)}\n`
    await fs.promises.writeFile(targetPath, content, { encoding: 'utf-8', flag: 'wx' })
    return buildEntryResult(targetPath)
  })

  ipcMain.handle('fs:create-folder', async (_event, raw: unknown): Promise<FsEntryResult> => {
    const { projectRoot, dirPath, name } = parseFsCreateFolderInput(raw)
    const store = await getStore()
    const ws = await resolveWritableProject(projectRoot, store.get('workspaces'))
    const targetPath = path.join(dirPath, name)
    ensureLocalProjectPath(dirPath, projectRoot, ws)
    ensureLocalProjectPath(targetPath, projectRoot, ws)
    if (await localTransport.fs.access(targetPath)) throw new Error('FILE_EXISTS')

    await fs.promises.mkdir(targetPath)
    return buildEntryResult(targetPath)
  })

  ipcMain.handle('fs:rename', async (_event, raw: unknown): Promise<FsEntryResult> => {
    const { projectRoot, path: sourcePath, newName } = parseFsRenameInput(raw)
    const store = await getStore()
    const ws = await resolveWritableProject(projectRoot, store.get('workspaces'))
    ensureLocalProjectPath(sourcePath, projectRoot, ws)

    const currentName = path.basename(sourcePath)
    const nextName = normalizeRenameFileName(currentName, newName)
    const targetPath = path.join(path.dirname(sourcePath), nextName)
    ensureLocalProjectPath(targetPath, projectRoot, ws)
    if (path.resolve(sourcePath) === path.resolve(targetPath)) {
      return buildEntryResult(sourcePath)
    }
    if (await localTransport.fs.access(targetPath)) throw new Error('FILE_EXISTS')

    await fs.promises.rename(sourcePath, targetPath)
    return buildEntryResult(targetPath)
  })

  ipcMain.handle('fs:trash', async (_event, raw: unknown): Promise<FsEntryResult> => {
    const { projectRoot, path: targetPath } = parseFsTrashInput(raw)
    const store = await getStore()
    const ws = await resolveWritableProject(projectRoot, store.get('workspaces'))
    ensureLocalProjectPath(targetPath, projectRoot, ws)
    if (path.resolve(targetPath) === path.resolve(projectRoot)) {
      throw new Error('CANNOT_TRASH_PROJECT_ROOT')
    }
    const result = await buildEntryResult(targetPath)

    await shell.trashItem(targetPath)
    return result
  })
}
