import fs from 'fs'
import { ipcMain } from 'electron'
import matter from 'gray-matter'
import { getStore } from '../services/store'
import { parseReadDocInput, assertInWorkspace } from '../security/validators'
import type { ReadDocResult } from '../../preload/types'

export function registerFsHandlers(): void {
  ipcMain.handle('fs:read-doc', async (_event, raw: unknown): Promise<ReadDocResult> => {
    const t0 = Date.now()
    const { path: docPath } = parseReadDocInput(raw)
    process.stderr.write(`[ipc] fs:read-doc start ${docPath}\n`)

    const store = await getStore()
    const workspaces = store.get('workspaces')
    const roots = workspaces.map((w) => w.root)

    assertInWorkspace(docPath, roots)

    const raw_content = await fs.promises.readFile(docPath, 'utf-8')
    const stat = await fs.promises.stat(docPath)

    const parsed = matter(raw_content)
    process.stderr.write(`[ipc] fs:read-doc done ${docPath} (${Date.now() - t0}ms, ${raw_content.length}B)\n`)

    return {
      content: parsed.content,
      mtime: stat.mtimeMs,
      frontmatter: Object.keys(parsed.data).length > 0 ? parsed.data : undefined,
    }
  })
}
