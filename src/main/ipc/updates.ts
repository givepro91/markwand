import { app, ipcMain } from 'electron'
import { checkForUpdates } from '../services/update-checker'

export function registerUpdateHandlers(): void {
  ipcMain.handle('updates:check', async () => checkForUpdates(app.getVersion()))
}
