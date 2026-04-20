import { contextBridge, ipcRenderer } from 'electron'
import type { ThemeType, TerminalType, ComposerSendInput } from './types'

// ipcRenderer 객체를 직접 노출하지 않는다.
// invoke 래퍼만 contextBridge를 통해 노출한다. (보안 P0)
contextBridge.exposeInMainWorld('api', {
  workspace: {
    list: () => ipcRenderer.invoke('workspace:list'),
    add: (root: string) => ipcRenderer.invoke('workspace:add', { root }),
    remove: (id: string) => ipcRenderer.invoke('workspace:remove', { id }),
    scan: (workspaceId: string) => ipcRenderer.invoke('workspace:scan', { workspaceId }),
    refresh: (workspaceId: string) => ipcRenderer.invoke('workspace:refresh', { workspaceId }),
  },

  project: {
    scanDocs: (projectId: string) => ipcRenderer.invoke('project:scan-docs', { projectId }),
    getDocCount: (projectId: string) => ipcRenderer.invoke('project:get-doc-count', { projectId }),
    onDocsChunk: (cb: (event: Electron.IpcRendererEvent, data: unknown) => void) => {
      ipcRenderer.on('project:docs-chunk', cb)
      return () => ipcRenderer.off('project:docs-chunk', cb)
    },
  },

  fs: {
    readDoc: (path: string) => ipcRenderer.invoke('fs:read-doc', { path }),
    onChange: (cb: (event: Electron.IpcRendererEvent, data: unknown) => void) => {
      ipcRenderer.on('fs:change', cb)
      return () => ipcRenderer.off('fs:change', cb)
    },
  },

  claude: {
    check: () => ipcRenderer.invoke('claude:check'),
    open: (dir: string, terminal: TerminalType) =>
      ipcRenderer.invoke('claude:open', { dir, terminal }),
  },

  codex: {
    check: () => ipcRenderer.invoke('codex:check'),
  },

  composer: {
    send: (input: ComposerSendInput) => ipcRenderer.invoke('composer:send', input),
    estimateTokens: (paths: string[]) =>
      ipcRenderer.invoke('composer:estimate-tokens', { paths }),
  },

  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', { url }),
    revealInFinder: (path: string) => ipcRenderer.invoke('shell:reveal', { path }),
  },

  theme: {
    set: (theme: ThemeType) => ipcRenderer.invoke('theme:set', { theme }),
  },

  prefs: {
    get: (key: string) => ipcRenderer.invoke('prefs:get', { key }),
    set: (key: string, value: unknown) => ipcRenderer.invoke('prefs:set', { key, value }),
  },
})
