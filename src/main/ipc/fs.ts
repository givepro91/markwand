import fs from 'fs'
import { ipcMain } from 'electron'
import matter from 'gray-matter'
import { getStore } from '../services/store'
import { parseReadDocInput, assertInWorkspace } from '../security/validators'
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

    const stat = await fs.promises.stat(docPath)
    if (stat.size > MAX_READ_BYTES) throw new Error('FILE_TOO_LARGE')

    const raw_content = await fs.promises.readFile(docPath, 'utf-8')

    const parsed = matter(raw_content)
    process.stderr.write(`[ipc] fs:read-doc done ${docPath} (${Date.now() - t0}ms, ${raw_content.length}B)\n`)

    return {
      content: parsed.content,
      mtime: stat.mtimeMs,
      frontmatter: Object.keys(parsed.data).length > 0 ? parsed.data : undefined,
    }
  })
}
