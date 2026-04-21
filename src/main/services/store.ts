import type { Workspace, ViewMode, SortOrder, ThemeType, TerminalType } from '../../preload/types'

/**
 * SSH TOFU 저장소 엔트리 — workspaceId 기준 (M3 Plan §S2.1).
 * - sha256: 서버 호스트키 SHA256 fingerprint (base64, no trailing '=')
 * - algorithm: 'ssh-ed25519' / 'ssh-rsa' / 'ecdsa-sha2-*' — handshake 에서 추출 (S1 Evaluator m-3)
 * - firstSeenAt: 최초 trust 시각 (Date.now ms)
 *
 * 보안 원칙 (DC-4):
 *   - 키 내용 직렬화 금지 — fingerprint 만 저장
 *   - sha256 불일치 시 재연결 금지(bypass 0). "Remove & re-trust" 만 허용.
 */
export interface SshKnownHostEntry {
  sha256: string
  algorithm: string
  firstSeenAt: number
}

export interface ExperimentalFeatures {
  /** M3 S3 — SSH Transport (alpha). 기본 false. 개발자 옵션 Settings → Experimental 에서 활성. */
  sshTransport: boolean
}

export interface StoreSchema {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  viewMode: ViewMode
  theme: ThemeType
  readDocs: Record<string, number>
  treeExpanded: Record<string, string[]>
  sortOrder: SortOrder
  terminal: TerminalType
  /** M3 S2 — SSH TOFU 저장소. workspaceId(ssh:<hex>) → hostKey entry. */
  sshKnownHosts: Record<string, SshKnownHostEntry>
  /** M3 S3 — experimental flag 모음. 신규 기능을 기본 off 로 배송하기 위한 layer. */
  experimentalFeatures: ExperimentalFeatures
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
      sshKnownHosts: {},
      experimentalFeatures: { sshTransport: false },
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
            // M1 (2026-04-21): transport 필드 추가. schema required 에는 넣지 않음 —
            // 기존 저장 엔트리는 아래 런타임 마이그레이션에서 { type: 'local' } 로 승격.
            transport: {
              // M3 S3: type 에 'ssh' 추가. ssh 변형은 host/port/user 필수 + auth 객체.
              // schema 는 'type' 만 엄격 검증하고 나머지 필드는 선택(ssh 변형이면 ipc 핸들러에서 검증).
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['local', 'ssh'] },
                host: { type: 'string' },
                port: { type: 'number' },
                user: { type: 'string' },
                auth: { type: 'object' },
                hostKeyFingerprint: { type: 'string' },
              },
              required: ['type'],
            },
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
      sshKnownHosts: { type: 'object', default: {} },
      experimentalFeatures: {
        type: 'object',
        properties: {
          sshTransport: { type: 'boolean', default: false },
        },
        default: { sshTransport: false },
      },
    },
  })

  // v0.1 이전에 저장된 워크스페이스는 mode 필드가 없다. 기존 동작(루트 마커 검사)을
  // 되살리는 것보다 container로 승격하는 게 swk 같은 케이스에서 덜 혼란스럽다.
  // schema required에 mode를 넣지 않는 이유: 이 migration이 schema 검증보다 먼저 돌 수
  // 없고, required 추가 시 기존 v0.1 사용자의 store 로드가 실패한다. mode는 런타임에서
  // scanner.ts의 기본 인자(='container')로 이중 방어한다.
  //
  // M1 (2026-04-21): transport 필드도 동일 lazy 마이그레이션 — 기존 엔트리는 local 로 주입.
  const existing = storeInstance.get('workspaces')
  const migrated = existing.map((w) => {
    let next = w
    if (next.mode == null) {
      next = { ...next, mode: 'container' as const }
    }
    if (next.transport == null) {
      next = { ...next, transport: { type: 'local' as const } }
    }
    return next
  })
  if (migrated.some((w, i) => w !== existing[i])) {
    storeInstance.set('workspaces', migrated)
  }

  // M3 S3: experimentalFeatures 필드가 없는 구 사용자에게 default 주입.
  const ef = storeInstance.get('experimentalFeatures') as ExperimentalFeatures | undefined
  if (!ef || typeof ef.sshTransport !== 'boolean') {
    storeInstance.set('experimentalFeatures', { sshTransport: false })
  }

  return storeInstance
}

/**
 * M3 S3 — SSH Transport feature flag 판정.
 * env MARKWAND_SSH=1 이 override 1순위 (개발자 편의), 그 외 electron-store 값.
 */
export async function isSshTransportEnabled(): Promise<boolean> {
  if (process.env['MARKWAND_SSH'] === '1') return true
  const store = await getStore()
  const ef = store.get('experimentalFeatures') as ExperimentalFeatures | undefined
  return ef?.sshTransport === true
}
