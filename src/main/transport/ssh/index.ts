// SshTransport factory — Plan §S1.2.
//
// workspaceId = sha1(`${user}@${host}:${port}`).slice(0,16). Local workspace 의 UUID 네임스페이스와
// 분리해 "같은 호스트 재연결 시 동일 ID" 보장 (Design §2.3, UX Audit DC handoff).

import crypto from 'node:crypto'
import { SshClient } from './client'
import { createSshFsDriver } from './fs'
import { createSshScannerDriver } from './scanner'
import { createSshWatcherDriver } from './watcher'
import { requestHostKeyTrust } from './hostKeyPromptBridge'
import { setHostKey } from './hostKeyDb'
import { onTransportOffline } from '../pool'
import type { Transport } from '../types'
import type { HostKeyInfo, SshConnectOptions } from './types'
import type { TransportStatus, TransportStatusEvent } from '../../../preload/types'

export { SshClient } from './client'
export { createSshFsDriver } from './fs'
export { createSshScannerDriver } from './scanner'
export { createSshWatcherDriver, suggestInterval } from './watcher'
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

  // 연결 성공 후 handshake 이벤트로 갱신된 algorithm 을 저장소에도 반영.
  // 단, 사용자가 명시 hostVerifier 를 준 경로(테스트/smoke/CLI)는 electron-store 의존성을
  // 우회하기 위해 setHostKey 스킵. bridge 기본 경로는 verifier 내부에서 setHostKey 를 이미 호출.
  if (!options.hostVerifier) {
    const finalKey = client.acceptedHostKey
    if (finalKey) await setHostKey(id, finalKey)
  }

  // S4 Evaluator C-1 — transport:status IPC 전파. main → renderer 이벤트.
  emitStatus(id, options, 'connected')
  client.onClose(() => {
    emitStatus(id, options, 'offline')
    void onTransportOffline(id).catch(() => undefined)
  })
  client.onError(() => {
    emitStatus(id, options, 'offline')
  })

  const fs = createSshFsDriver(client)
  const scanner = createSshScannerDriver(client)
  const watcher = createSshWatcherDriver(client)

  // S4 Evaluator M-1 — watcher error 이벤트 → pool onTransportOffline 연결.
  // SshPoller 가 MAX_CONSEC_FAILURES 초과 시 emit('error') 하면 pool 에서 즉시 evict.
  const wrappedWatcher: typeof watcher = {
    watch(roots, opts) {
      const handle = watcher.watch(roots, opts)
      handle.on('error', (err: Error) => {
        process.stderr.write(`[ssh-transport ${id}] watcher error → pool evict: ${err.message}\n`)
        emitStatus(id, options, 'offline')
        void onTransportOffline(id).catch(() => undefined)
      })
      return handle
    },
  }

  return {
    id,
    kind: 'ssh',
    client,
    fs,
    scanner,
    watcher: wrappedWatcher,
    exec: undefined, // M6 (별도 Plan)
    async dispose() {
      await client.dispose()
    },
  }
}

// S4 Evaluator C-1 — renderer 에 상태 전파.
// 단일 창 앱이라 BrowserWindow.getAllWindows()[0]?.webContents 로 연결. require('electron') 은
// main process 전용 — Node CLI/test 경로에선 throw 하므로 try/catch silent drop.
function emitStatus(
  id: string,
  options: SshConnectOptions,
  status: TransportStatus,
): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BrowserWindow } = require('electron') as typeof import('electron')
    const wc = BrowserWindow.getAllWindows()[0]?.webContents
    if (!wc || wc.isDestroyed()) return
    const event: TransportStatusEvent = {
      workspaceId: id,
      status,
      label: `${options.username}@${options.host}${options.port !== 22 ? ':' + options.port : ''}`,
    }
    wc.send('transport:status', event)
  } catch {
    // main process 가 아닌 환경(test/CLI) — silent drop
  }
}
