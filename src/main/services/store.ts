import type { Workspace, ViewMode, SortOrder, ThemeType, TerminalType } from '../../preload/types'

export interface StoreSchema {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  viewMode: ViewMode
  theme: ThemeType
  readDocs: Record<string, number>
  treeExpanded: Record<string, string[]>
  sortOrder: SortOrder
  terminal: TerminalType
}

// electron-store v10은 ESM 전용이므로 동적 import로 로드한다 (R2 대응)
// rollupOptions.external에 'electron-store'가 선언되어 빌드 타임 require() 오류를 방지한다.
let storeInstance: import('electron-store').default<StoreSchema> | null = null

export async function getStore(): Promise<import('electron-store').default<StoreSchema>> {
  if (storeInstance) return storeInstance

  const { default: Store } = await import('electron-store')

  storeInstance = new Store<StoreSchema>({
    name: 'md-viewer',
    defaults: {
      workspaces: [],
      activeWorkspaceId: null,
      viewMode: 'all',
      theme: 'system',
      readDocs: {},
      treeExpanded: {},
      sortOrder: 'recent',
      terminal: 'Terminal',
    },
    schema: {
      workspaces: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            root: { type: 'string' },
            addedAt: { type: 'number' },
            lastOpened: { type: ['number', 'null'] },
          },
          required: ['id', 'name', 'root', 'addedAt'],
        },
        default: [],
      },
      activeWorkspaceId: { type: ['string', 'null'], default: null },
      viewMode: { type: 'string', enum: ['all', 'inbox', 'project'], default: 'all' },
      theme: { type: 'string', enum: ['light', 'dark', 'system'], default: 'system' },
      readDocs: { type: 'object', default: {} },
      treeExpanded: { type: 'object', default: {} },
      sortOrder: { type: 'string', enum: ['recent', 'name', 'count'], default: 'recent' },
      terminal: {
        type: 'string',
        enum: ['Terminal', 'iTerm2', 'Ghostty'],
        default: 'Terminal',
      },
    },
  })

  return storeInstance
}
