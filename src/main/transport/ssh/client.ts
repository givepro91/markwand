// SshClient — ssh2 Client 래퍼. Plan §S1 PoC 범위.
//
// 책임:
//   - connect(): ssh2 Client 연결 수립 + SFTP subsystem 오픈
//   - dispose(): 연결 정리 (end → drain 대기)
//   - hostVerifier 콜백 훅 (S2 TOFU 모달과 연결)
//   - getSftp(): PromisifiedSftp 반환 (미연결 시 SSH_NOT_CONNECTED)
//
// S1 범위에서 제외 (S2 이관):
//   - reconnect backoff
//   - ProxyJump 1-hop 수동 체인
//   - 상태 머신 (connecting/connected/offline) — useTransportStatus 연동
//   - nonce IPC + 20s 타임아웃 (DC-4 race 방어) — 이 레이어는 hostVerifier 콜백만 노출

import crypto from 'node:crypto'
import fs from 'node:fs'
import { Client, type ConnectConfig, type SFTPWrapper } from 'ssh2'
import { promisifySftp, type PromisifiedSftp } from './util/promisifiedSftp'
import { SshErrorCode, type HostKeyInfo, type SshConnectOptions } from './types'

const DEFAULT_KEEPALIVE_INTERVAL = 30_000 // 30s (Plan §S2.4)
const DEFAULT_KEEPALIVE_COUNT_MAX = 3 //  90s 무응답 = 연결 종료
const DEFAULT_READY_TIMEOUT = 20_000

export class SshClient {
  private client: Client | null = null
  private sftpWrapper: SFTPWrapper | null = null
  private promisifiedSftp: PromisifiedSftp | null = null
  private hostKeyInfo: HostKeyInfo | null = null

  constructor(private readonly options: SshConnectOptions) {}

  /** 최종 인증된 호스트 키 정보 (connect 성공 후). 디버깅·TOFU 기록용. */
  get acceptedHostKey(): HostKeyInfo | null {
    return this.hostKeyInfo
  }

  get isConnected(): boolean {
    return this.client !== null && this.sftpWrapper !== null
  }

  getSftp(): PromisifiedSftp {
    if (!this.promisifiedSftp) {
      throw new Error(SshErrorCode.NOT_CONNECTED)
    }
    return this.promisifiedSftp
  }

  async connect(): Promise<void> {
    if (this.client) throw new Error('already connected')

    const client = new Client()
    const config: ConnectConfig = {
      host: this.options.host,
      port: this.options.port,
      username: this.options.username,
      readyTimeout: this.options.readyTimeout ?? DEFAULT_READY_TIMEOUT,
      keepaliveInterval: this.options.keepaliveInterval ?? DEFAULT_KEEPALIVE_INTERVAL,
      keepaliveCountMax: this.options.keepaliveCountMax ?? DEFAULT_KEEPALIVE_COUNT_MAX,
      // ssh2 HostVerifier 시그니처는 (key, verify) => void (비동기 callback 패턴) 과
      // SyncHostVerifier = (key) => boolean 두 가지. Promise 직접 반환은 ssh2 런타임이
      // Promise 객체를 `verify(...)` 에 전달해 truthy 로 평가 → 의도치 않은 trust 발생.
      // 반드시 verify 콜백을 명시 호출해야 DC-4 "bypass 0" 이 보장된다 (S1 Evaluator C-1).
      hostVerifier: (key: Buffer, verify: (result: boolean) => void) => {
        const info = buildHostKeyInfo(this.options.host, this.options.port, key)
        this.hostKeyInfo = info
        const verifier = this.options.hostVerifier
        if (!verifier) {
          verify(false) // 콜백 미제공 → DC-4 기본 reject
          return
        }
        verifier(info)
          .then((ok) => verify(ok === true))
          .catch(() => verify(false))
      },
    }

    // 인증 수단 추가 — agent OR key-file.
    if (this.options.auth.kind === 'agent') {
      const socketPath = this.options.auth.socketPath ?? process.env['SSH_AUTH_SOCK']
      if (!socketPath) {
        throw new Error(`${SshErrorCode.AUTH_FAILED} (no SSH_AUTH_SOCK)`)
      }
      config.agent = socketPath
    } else {
      // key-file
      const keyPath = this.options.auth.path
      let privateKey: Buffer
      try {
        privateKey = fs.readFileSync(keyPath)
      } catch (err) {
        throw new Error(
          `${SshErrorCode.AUTH_FAILED} (key read: ${(err as Error).message})`,
        )
      }
      config.privateKey = privateKey
      if (this.options.auth.passphrase) {
        config.passphrase = this.options.auth.passphrase
      }
    }

    // 연결 ready 대기.
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        client.off('error', onError)
        resolve()
      }
      const onError = (err: Error) => {
        client.off('ready', onReady)
        reject(mapConnectError(err))
      }
      client.once('ready', onReady)
      client.once('error', onError)
      client.connect(config)
    })

    // SFTP subsystem 오픈.
    const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
      client.sftp((err, s) => {
        if (err) reject(err)
        else resolve(s)
      })
    })

    this.client = client
    this.sftpWrapper = sftp
    this.promisifiedSftp = promisifySftp(sftp)
  }

  async dispose(): Promise<void> {
    if (!this.client) return
    const client = this.client
    this.client = null
    this.sftpWrapper = null
    this.promisifiedSftp = null
    await new Promise<void>((resolve) => {
      const onClose = () => resolve()
      client.once('close', onClose)
      client.end()
      // 이벤트 누락 가드 — 1s 초과 시 강제 resolve (close 이벤트를 못 받는 케이스 대비)
      setTimeout(() => {
        client.off('close', onClose)
        resolve()
      }, 1000).unref()
    })
  }
}

/**
 * 호스트 키 Buffer → HostKeyInfo (SHA256 base64 + MD5 legacy hex + algorithm 추측)
 * 알고리즘은 ssh2 hostVerifier 콜백 시점에 전달되지 않으므로 'unknown-from-key-buffer' 고정.
 * S2 에서 ssh2 client 의 'handshake' 이벤트로 알고리즘 확보 후 업데이트 가능.
 */
function buildHostKeyInfo(host: string, port: number, keyBuf: Buffer): HostKeyInfo {
  const sha256 = crypto
    .createHash('sha256')
    .update(keyBuf)
    .digest('base64')
    .replace(/=+$/, '')
  const md5 = crypto
    .createHash('md5')
    .update(keyBuf)
    .digest('hex')
    .match(/.{1,2}/g)!
    .join(':')
  return {
    host,
    port,
    algorithm: 'unknown',
    sha256,
    md5,
  }
}

function mapConnectError(err: Error): Error {
  const msg = err.message ?? ''
  // 순서 주의: 더 구체적인 매처가 먼저 (S1 Evaluator M-1 — ECONNREFUSED 를 TIMEOUT 과 구분).
  if (/ECONNREFUSED/i.test(msg)) return new Error(SshErrorCode.CONN_REFUSED)
  if (/ENOTFOUND|EHOSTUNREACH|ENETUNREACH/i.test(msg)) return new Error(SshErrorCode.HOST_UNREACHABLE)
  if (/timeout|timed out|ETIMEDOUT/i.test(msg)) return new Error(SshErrorCode.CONNECT_TIMEOUT)
  if (/host key|hostkey/i.test(msg)) return new Error(SshErrorCode.HOST_KEY_REJECTED)
  if (/all configured authentication methods failed|authentication/i.test(msg)) {
    return new Error(SshErrorCode.AUTH_FAILED)
  }
  return err
}
