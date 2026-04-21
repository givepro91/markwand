// SshTransport factory — Plan §S1.2.
//
// workspaceId = sha1(`${user}@${host}:${port}`).slice(0,16). Local workspace 의 UUID 네임스페이스와
// 분리해 "같은 호스트 재연결 시 동일 ID" 보장 (Design §2.3, UX Audit DC handoff).

import crypto from 'node:crypto'
import { SshClient } from './client'
import { createSshFsDriver } from './fs'
import { createSshScannerDriver } from './scanner'
import type { Transport } from '../types'
import type { SshConnectOptions } from './types'

export { SshClient } from './client'
export { createSshFsDriver } from './fs'
export { createSshScannerDriver } from './scanner'
export * from './types'

/**
 * workspaceId seed — user@host:port. S1 Evaluator m-4: 인수 순서를 해시 포맷과 일치시켜 가독성 향상.
 */
export function computeSshTransportId(
  username: string,
  host: string,
  port: number,
): string {
  return crypto
    .createHash('sha1')
    .update(`${username}@${host}:${port}`)
    .digest('hex')
    .slice(0, 16)
}

export interface SshTransport extends Transport {
  kind: 'ssh'
  /** 내부 SshClient 노출 — S2 상태머신·reconnect 에서 client.on(...) 구독 목적 */
  client: SshClient
}

/**
 * SshTransport 를 생성하고 연결한다. 연결 실패 시 throw.
 * dispose() 호출 시 SshClient 정리.
 *
 * S1 범위: FsDriver + ScannerDriver + dispose.
 * S2 에서 watcher(SshPoller), S3 에서 pool.ts 의 active/warm lifecycle 에 편입.
 */
export async function createSshTransport(options: SshConnectOptions): Promise<SshTransport> {
  const client = new SshClient(options)
  await client.connect()

  const id = `ssh:${computeSshTransportId(options.username, options.host, options.port)}`
  const fs = createSshFsDriver(client)
  const scanner = createSshScannerDriver(client)

  return {
    id,
    kind: 'ssh',
    client,
    fs,
    scanner,
    watcher: undefined, // M4 (S2)
    exec: undefined, // M6 (S2 이후 별도 Plan)
    async dispose() {
      await client.dispose()
    },
  }
}
