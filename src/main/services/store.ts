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
            mode: { type: 'string', enum: ['container', 'single'] },
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

  // v0.1 이전에 저장된 워크스페이스는 mode 필드가 없다. 기존 동작(루트 마커 검사)을
  // 되살리는 것보다 container로 승격하는 게 swk 같은 케이스에서 덜 혼란스럽다.
  // schema required에 mode를 넣지 않는 이유: 이 migration이 schema 검증보다 먼저 돌 수
  // 없고, required 추가 시 기존 v0.1 사용자의 store 로드가 실패한다. mode는 런타임에서
  // scanner.ts의 기본 인자(='container')로 이중 방어한다.
  const existing = storeInstance.get('workspaces')
  const migrated = existing.map((w) => (w.mode != null ? w : { ...w, mode: 'container' as const }))
  if (migrated.some((w, i) => w !== existing[i])) {
    storeInstance.set('workspaces', migrated)
  }

  return storeInstance
}
