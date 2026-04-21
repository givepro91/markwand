// SshTransport factory — Plan §S1.2.
//
// workspaceId = sha1(`${user}@${host}:${port}`).slice(0,16). Local workspace 의 UUID 네임스페이스와
// 분리해 "같은 호스트 재연결 시 동일 ID" 보장 (Design §2.3, UX Audit DC handoff).

import crypto from 'node:crypto'
import { SshClient } from './client'
import { createSshFsDriver } from './fs'
import { createSshScannerDriver } from './scanner'
import { requestHostKeyTrust } from './hostKeyPromptBridge'
import { setHostKey } from './hostKeyDb'
import type { Transport } from '../types'
import type { HostKeyInfo, SshConnectOptions } from './types'

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
  const id = `ssh:${computeSshTransportId(options.username, options.host, options.port)}`

  // S2 후반부: hostVerifier 미지정 시 renderer TOFU bridge 기본 주입.
  // bridge 는 hostKeyDb 를 통해 match/mismatch/unknown 3분류 후 필요 시 모달 prompt.
  // 사용자가 명시 hostVerifier 를 줬다면 그걸 우선 — 테스트/CLI smoke 경로 보존.
  const hostVerifier =
    options.hostVerifier ??
    (async (info: HostKeyInfo): Promise<boolean> => {
      const trusted = await requestHostKeyTrust(id, info)
      if (trusted) {
        // TOFU 최초 또는 재-trust → 저장 (이미 저장된 match 케이스도 덮어쓰기로 algorithm 업데이트)
        await setHostKey(id, info)
      }
      return trusted
    })

  const client = new SshClient({ ...options, hostVerifier })
  await client.connect()

  // 연결 성공 후 handshake 이벤트로 갱신된 algorithm 을 저장소에도 반영 (sha256 동일이면 setHostKey 가 firstSeenAt 유지).
  // bridge 가 이미 저장한 경우엔 중복 set 이 되지만 schema 동등성 유지되므로 무해.
  const finalKey = client.acceptedHostKey
  if (finalKey) {
    // setHostKey 는 덮어쓰기 — match 경로에서 TOFU prompt 스킵된 경우에도 최신 algorithm 반영.
    await setHostKey(id, finalKey)
  }

  const fs = createSshFsDriver(client)
  const scanner = createSshScannerDriver(client)

  return {
    id,
    kind: 'ssh',
    client,
    fs,
    scanner,
    watcher: undefined, // M4 (S4)
    exec: undefined, // M6 (별도 Plan)
    async dispose() {
      await client.dispose()
    },
  }
}
