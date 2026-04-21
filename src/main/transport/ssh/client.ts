// SshClient — ssh2 Client 래퍼. S1 PoC + S2 확장(ProxyJump 1-hop · handshake algorithm).
//
// 책임:
//   - connect(): ssh2 Client 연결 수립 + SFTP subsystem 오픈 + ProxyJump 체인 (옵션)
//   - dispose(): 연결 정리 (end → drain 대기, ProxyJump 는 역순)
//   - hostVerifier 콜백 훅 (S2 TOFU 모달과 연결)
//   - handshake 이벤트로 HostKeyInfo.algorithm 사후 업데이트 (S1 Evaluator m-3)
//   - getSftp(): PromisifiedSftp 반환 (미연결 시 SSH_NOT_CONNECTED)
//
// S2 후반부(다음 세션) 이관:
//   - 상태 머신 (connecting/connected/offline) UI 연동 — useTransportStatus 훅
//   - nonce IPC + 20s 타임아웃 (DC-4 race 방어) — 이 레이어는 hostVerifier 콜백만 노출

import crypto from 'node:crypto'
import fs from 'node:fs'
import type { Duplex } from 'node:stream'
import { Client, type ClientChannel, type ConnectConfig, type SFTPWrapper } from 'ssh2'
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
  /** ProxyJump 1-hop 체인의 jump Client (dispose 역순 종료용) */
  private jumpClient: Client | null = null

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

  /** S4 Evaluator C-1 — 연결 종료 이벤트 구독 (transport:status offline 전이용) */
  onClose(cb: () => void): void {
    this.client?.on('close', cb)
  }

  onError(cb: (err: Error) => void): void {
    this.client?.on('error', cb)
  }

  async connect(): Promise<void> {
    if (this.client) throw new Error('already connected')

    // ProxyJump 1-hop 체인 — jump 를 먼저 연결해 forwardOut 으로 target 까지 sock 포워딩.
    // v1.0 은 재귀 금지 (jump.proxyJump 가 설정돼 있어도 스킵 — 다중 hop v1.1).
    let jumpSock: Duplex | undefined
    if (this.options.proxyJump) {
      const jumpOpts = this.options.proxyJump
      const hop = new Client()
      try {
        await this.connectRaw(hop, this.buildConnectConfig(jumpOpts, undefined))
      } catch (err) {
        hop.end()
        throw err
      }
      this.jumpClient = hop
      try {
        jumpSock = await new Promise<Duplex>((resolve, reject) => {
          hop.forwardOut(
            '127.0.0.1',
            0,
            this.options.host,
            this.options.port,
            (err: Error | undefined, s: ClientChannel) =>
              err ? reject(mapConnectError(err)) : resolve(s),
          )
        })
      } catch (err) {
        hop.end()
        this.jumpClient = null
        throw err
      }
    }

    const client = new Client()
    const config = this.buildConnectConfig(this.options, jumpSock)

    // handshake 이벤트로 서버 hostkey algorithm 사후 업데이트 (S1 Evaluator m-3).
    // hostVerifier 단계에서는 key buffer 만 받아 algorithm='unknown' 으로 info 생성 후,
    // handshake 완료 시점에 negotiated.serverHostKey 로 실제 값 덮어씀.
    client.on('handshake', (negotiated) => {
      if (this.hostKeyInfo && negotiated && typeof negotiated.serverHostKey === 'string') {
        this.hostKeyInfo = { ...this.hostKeyInfo, algorithm: negotiated.serverHostKey }
      }
    })

    try {
      await this.connectRaw(client, config)
    } catch (err) {
      if (this.jumpClient) {
        this.jumpClient.end()
        this.jumpClient = null
      }
      throw err
    }

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
    const client = this.client
    const jump = this.jumpClient
    this.client = null
    this.sftpWrapper = null
    this.promisifiedSftp = null
    this.jumpClient = null

    // 역순 dispose — final 먼저, 그 다음 jump (Plan §S2.3 권고).
    if (client) await endAndWait(client)
    if (jump) await endAndWait(jump)
  }

  /** ssh2 Client connect 를 Promise 로 래핑 — ready/error 이벤트 경쟁 */
  private async connectRaw(client: Client, config: ConnectConfig): Promise<void> {
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
  }

  /**
   * SshConnectOptions → ssh2 ConnectConfig 변환.
   * sock 옵션이 있으면 host/port 대신 기존 stream 사용 (ProxyJump 1-hop target 연결).
   * hostVerifier 는 this 에 의존하므로 여기선 설정하지 않고 호출부에서 덮어쓴다 (target 전용).
   */
  private buildConnectConfig(
    opts: SshConnectOptions,
    sock: Duplex | undefined,
  ): ConnectConfig {
    const config: ConnectConfig = {
      host: opts.host,
      port: opts.port,
      username: opts.username,
      readyTimeout: opts.readyTimeout ?? DEFAULT_READY_TIMEOUT,
      keepaliveInterval: opts.keepaliveInterval ?? DEFAULT_KEEPALIVE_INTERVAL,
      keepaliveCountMax: opts.keepaliveCountMax ?? DEFAULT_KEEPALIVE_COUNT_MAX,
    }
    if (sock !== undefined) {
      // sock 옵션은 ssh2 에서 Duplex stream 으로 취급. forwardOut 결과가 이에 부합.
      // @types/ssh2 ConnectConfig 에 sock 이 명시되지 않아 타입 어설션 필요.
      ;(config as unknown as { sock: Duplex }).sock = sock
    }
    // 인증 수단.
    if (opts.auth.kind === 'agent') {
      const socketPath = opts.auth.socketPath ?? process.env['SSH_AUTH_SOCK']
      if (!socketPath) {
        throw new Error(`${SshErrorCode.AUTH_FAILED} (no SSH_AUTH_SOCK)`)
      }
      config.agent = socketPath
    } else {
      const keyPath = opts.auth.path
      let privateKey: Buffer
      try {
        privateKey = fs.readFileSync(keyPath)
      } catch (err) {
        throw new Error(`${SshErrorCode.AUTH_FAILED} (key read: ${(err as Error).message})`)
      }
      config.privateKey = privateKey
      if (opts.auth.passphrase) config.passphrase = opts.auth.passphrase
    }
    // target 전용 hostVerifier — jump 에는 this.hostKeyInfo 추적 불필요(별도 fingerprint 정책).
    // jump 도 추적하려면 별도 SshClient 인스턴스로 관리해야 하지만 v1.0 단순화.
    config.hostVerifier = (key: Buffer, verify: (result: boolean) => void) => {
      const info = buildHostKeyInfo(opts.host, opts.port, key)
      const isTarget = sock !== undefined || opts === this.options
      // target 일 때만 메인 hostKeyInfo 업데이트 (jump 의 key 는 별도 추적 안 함 v1.0).
      if (isTarget) {
        this.hostKeyInfo = info
      }
      // Evaluator M-1 (ProxyJump 동작 가능화): jump 전용 hostVerifier 가 없으면 target 의
      // hostVerifier 로 fallback. 사용자 입장에선 "target 과 jump 를 같은 콜백이 검증" —
      // info.host/port 로 두 호출을 구분 가능. DC-4 bypass 0 원칙은 여전히 유지 (모든 호출에서
      // verifier 반환값 기반으로 verify 실행).
      const verifier = opts.hostVerifier ?? (isTarget ? undefined : this.options.hostVerifier)
      if (!verifier) {
        verify(false) // 콜백 미제공 → DC-4 기본 reject
        return
      }
      verifier(info)
        .then((ok) => verify(ok === true))
        .catch(() => verify(false))
    }
    return config
  }
}

function endAndWait(client: Client): Promise<void> {
  return new Promise<void>((resolve) => {
    const onClose = () => resolve()
    client.once('close', onClose)
    client.end()
    // 이벤트 누락 가드 — 1s 초과 시 강제 resolve
    setTimeout(() => {
      client.off('close', onClose)
      resolve()
    }, 1000).unref()
  })
}

/**
 * 호스트 키 Buffer → HostKeyInfo (SHA256 base64 + MD5 legacy hex + algorithm placeholder).
 * algorithm 은 'unknown' 으로 초기화되며 handshake 이벤트에서 실제 값으로 교체된다 (S1 m-3).
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
