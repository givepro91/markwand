import { ipcMain } from 'electron'
import { getStore } from '../services/store'
import { checkClaude, openInClaude } from '../services/claude-launcher'
import { parseClaudeOpenInput, assertInWorkspace } from '../security/validators'

export function registerClaudeHandlers(): void {
  ipcMain.handle('claude:check', async () => {
    return checkClaude()
  })

  ipcMain.handle('claude:open', async (_event, raw: unknown) => {
    const { dir, terminal } = parseClaudeOpenInput(raw)

    const store = await getStore()
    const workspaces = store.get('workspaces')
    const roots = workspaces.map((w) => w.root)

    assertInWorkspace(dir, roots)

    return openInClaude(dir, terminal)
  })
}
