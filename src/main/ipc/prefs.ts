import { ipcMain, nativeTheme, shell } from 'electron'
import { getStore } from '../services/store'
import {
  parseThemeInput,
  parsePrefsGetInput,
  parsePrefsSetInput,
  parseShellOpenExternalInput,
} from '../security/validators'

export function registerPrefsHandlers(): void {
  ipcMain.handle('theme:set', async (_event, raw: unknown) => {
    const { theme } = parseThemeInput(raw)
    nativeTheme.themeSource = theme
    const store = await getStore()
    store.set('theme', theme)
  })

  ipcMain.handle('prefs:get', async (_event, raw: unknown) => {
    const { key } = parsePrefsGetInput(raw)
    const store = await getStore()
    return store.get(key as Parameters<typeof store.get>[0])
  })

  ipcMain.handle('prefs:set', async (_event, raw: unknown) => {
    const { key, value } = parsePrefsSetInput(raw)
    const store = await getStore()
    // ALLOWED_PREFS_KEYS 화이트리스트를 통과한 key이므로 타입 캐스트는 안전하다
    ;(store as { set(k: string, v: unknown): void }).set(key, value)
  })

  ipcMain.handle('shell:open-external', async (_event, raw: unknown) => {
    const { url } = parseShellOpenExternalInput(raw)
    await shell.openExternal(url)
  })
}
