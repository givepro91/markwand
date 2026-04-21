import { ipcMain } from 'electron'
import matter from 'gray-matter'
import { getStore } from '../services/store'
import { parseReadDocInput, assertInWorkspace } from '../security/validators'
import { classifyAsset } from '../../lib/viewable'
import { localTransport } from '../transport/local'
import type { ReadDocResult } from '../../preload/types'

const MAX_READ_BYTES = 2 * 1024 * 1024

export function registerFsHandlers(): void {
  ipcMain.handle('fs:read-doc', async (_event, raw: unknown): Promise<ReadDocResult> => {
    const t0 = Date.now()
    const { path: docPath } = parseReadDocInput(raw)
    process.stderr.write(`[ipc] fs:read-doc start ${docPath}\n`)

    const store = await getStore()
    const workspaces = store.get('workspaces')
    const roots = workspaces.map((w) => w.root)

    assertInWorkspace(docPath, roots)

    // md만 텍스트로 파싱. 이미지 등 바이너리를 utf-8로 읽으면 matter()에 쓰레기가 들어가
    // MarkdownViewer에 깨진 텍스트로 렌더된다. 이미지는 app:// 프로토콜로 직접 로드해야 한다.
    if (classifyAsset(docPath) !== 'md') {
      throw new Error('NOT_A_TEXT_DOC')
    }

    // LocalTransport 위임. readFile이 size-first + maxBytes 로 FILE_TOO_LARGE 를 자체 방어.
    const stat = await localTransport.fs.stat(docPath)
    const buf = await localTransport.fs.readFile(docPath, { maxBytes: MAX_READ_BYTES })
    const raw_content = buf.toString('utf-8')

    const parsed = matter(raw_content)
    process.stderr.write(`[ipc] fs:read-doc done ${docPath} (${Date.now() - t0}ms, ${raw_content.length}B)\n`)

    return {
      content: parsed.content,
      mtime: stat.mtimeMs,
      frontmatter: Object.keys(parsed.data).length > 0 ? parsed.data : undefined,
    }
  })
}
