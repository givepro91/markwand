import { contextBridge, ipcRenderer } from 'electron'
import type {
  ThemeType,
  TerminalType,
  Doc,
  FsChangeEvent,
  HostKeyPromptPayload,
  TransportStatusEvent,
} from './types'

// ipcRenderer 객체를 직접 노출하지 않는다.
// invoke 래퍼만 contextBridge를 통해 노출한다. (보안 P0)
contextBridge.exposeInMainWorld('api', {
  workspace: {
    list: () => ipcRenderer.invoke('workspace:list'),
    add: (root: string) => ipcRenderer.invoke('workspace:add', { root }),
    addSsh: (input: {
      name: string
      host: string
      port: number
      user: string
      auth: { kind: 'agent' } | { kind: 'key-file'; path: string }
    }) => ipcRenderer.invoke('workspace:add-ssh', input),
    remove: (id: string) => ipcRenderer.invoke('workspace:remove', { id }),
    scan: (workspaceId: string) => ipcRenderer.invoke('workspace:scan', { workspaceId }),
    refresh: (workspaceId: string) => ipcRenderer.invoke('workspace:refresh', { workspaceId }),
  },

  project: {
    scanDocs: (projectId: string) => ipcRenderer.invoke('project:scan-docs', { projectId }),
    getDocCount: (projectId: string) => ipcRenderer.invoke('project:get-doc-count', { projectId }),
    // raw IpcRendererEvent 노출 차단 — data-only wrapper
    onDocsChunk: (cb: (data: Doc[]) => void) => {
      const wrapper = (_event: Electron.IpcRendererEvent, data: Doc[]) => cb(data)
      ipcRenderer.on('project:docs-chunk', wrapper)
      return () => ipcRenderer.off('project:docs-chunk', wrapper)
    },
  },

  fs: {
    readDoc: (path: string) => ipcRenderer.invoke('fs:read-doc', { path }),
    onChange: (cb: (data: FsChangeEvent) => void) => {
      const wrapper = (_event: Electron.IpcRendererEvent, data: FsChangeEvent) => cb(data)
      ipcRenderer.on('fs:change', wrapper)
      return () => ipcRenderer.off('fs:change', wrapper)
    },
  },

  drift: {
    verify: (docPath: string, projectRoot: string) =>
      ipcRenderer.invoke('drift:verify', { docPath, projectRoot }),
  },

  claude: {
    check: () => ipcRenderer.invoke('claude:check'),
    open: (dir: string, terminal: TerminalType) =>
      ipcRenderer.invoke('claude:open', { dir, terminal }),
  },

  composer: {
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

  // M3 S2 — SSH Transport UI 채널. feature flag off 사용자도 API 표면은 존재하나 호출 안 함.
  ssh: {
    onHostKeyPrompt: (cb: (data: HostKeyPromptPayload) => void) => {
      const wrapper = (_e: Electron.IpcRendererEvent, data: HostKeyPromptPayload) => cb(data)
      ipcRenderer.on('ssh:host-key-prompt', wrapper)
      return () => ipcRenderer.off('ssh:host-key-prompt', wrapper)
    },
    respondHostKey: (nonce: string, trust: boolean) =>
      ipcRenderer.invoke('ssh:respond-host-key', { nonce, trust }),
    onStatus: (cb: (data: TransportStatusEvent) => void) => {
      const wrapper = (_e: Electron.IpcRendererEvent, data: TransportStatusEvent) => cb(data)
      ipcRenderer.on('transport:status', wrapper)
      return () => ipcRenderer.off('transport:status', wrapper)
    },
  },
})
