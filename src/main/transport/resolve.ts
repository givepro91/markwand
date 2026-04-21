// Transport 해석 헬퍼 — Plan §S3.
//
// 워크스페이스 ID 로 해당 Transport 를 얻는다. 로컬은 싱글톤, SSH 는 pool 경유.
// IPC 핸들러가 이 함수만 호출하면 어떤 transport 든 일관된 API 로 동작.

import { getStore } from '../services/store'
import { localTransport } from './local'
import { getTransport as poolGetTransport } from './pool'
import { createSshTransport } from './ssh'
import type { Transport } from './types'
import type { Workspace, WorkspaceTransport } from '../../preload/types'

export async function getActiveTransport(workspaceId: string): Promise<Transport> {
  // 로컬 (UUID v4) 은 pool 우회.
  if (!workspaceId.startsWith('ssh:')) return localTransport

  // SSH — workspace entry 로부터 연결 옵션 복원.
  const store = await getStore()
  const workspaces = store.get('workspaces')
  const ws = workspaces.find((w) => w.id === workspaceId)
  if (!ws) throw new Error('WORKSPACE_NOT_FOUND')
  const transport = ws.transport
  if (!transport || transport.type !== 'ssh') {
    throw new Error('WORKSPACE_TRANSPORT_MISMATCH')
  }

  return poolGetTransport(workspaceId, async () => {
    const t = await createSshTransport(buildSshConnectOptionsFrom(transport))
    return t
  })
}

function buildSshConnectOptionsFrom(
  t: Extract<WorkspaceTransport, { type: 'ssh' }>,
) {
  return {
    host: t.host,
    port: t.port,
    username: t.user,
    auth: t.auth,
  }
}

/** 로컬 워크스페이스인지 검사 */
export function isLocalWorkspaceId(id: string): boolean {
  return !id.startsWith('ssh:')
}

// 타입 체크 실패 가드 — Workspace 구조 무효 시 undefined 반환.
export async function findWorkspace(id: string): Promise<Workspace | undefined> {
  const store = await getStore()
  return store.get('workspaces').find((w) => w.id === id)
}
