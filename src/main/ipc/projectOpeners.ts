import { ipcMain } from 'electron'
import { getStore } from '../services/store'
import { listProjectOpeners, openProjectWithOpener } from '../services/project-openers'
import { assertInWorkspace, parseProjectOpenInput } from '../security/validators'

export function registerProjectOpenerHandlers(): void {
  ipcMain.handle('project-openers:list', async () => {
    return listProjectOpeners()
  })

  ipcMain.handle('project-openers:open', async (_event, raw: unknown) => {
    const { projectRoot, openerId } = parseProjectOpenInput(raw)

    const store = await getStore()
    const workspaces = store.get('workspaces')
    const roots = workspaces
      .filter((workspace) => workspace.transport?.type !== 'ssh')
      .map((workspace) => workspace.root)

    assertInWorkspace(projectRoot, roots)

    return openProjectWithOpener(projectRoot, openerId)
  })
}
