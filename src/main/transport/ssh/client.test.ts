/**
 * SshClient 최소 unit tests — workspaceId 계산 + getSftp 미연결 가드.
 * (실제 ssh2 Client 연결 플로우는 Docker sshd smoke(verify-ssh2-abi.ts) 가 담당.
 * 여기선 pure logic 만 — mock 이 ssh2 내부 이벤트 시퀀스까지 흉내내는 비용 대비 이득 적음.)
 */
import { describe, it, expect } from 'vitest'
import { SshClient, computeSshTransportId } from './index'
import { SshErrorCode } from './types'

describe('computeSshTransportId', () => {
  it('(username, host, port) 조합에 대해 동일 입력 → 동일 16자 hex', () => {
    const id1 = computeSshTransportId('alice', 'example.com', 22)
    const id2 = computeSshTransportId('alice', 'example.com', 22)
    expect(id1).toBe(id2)
    expect(id1).toMatch(/^[0-9a-f]{16}$/)
  })

  it('port 가 다르면 다른 ID', () => {
    const id1 = computeSshTransportId('u', 'host', 22)
    const id2 = computeSshTransportId('u', 'host', 2222)
    expect(id1).not.toBe(id2)
  })

  it('username 이 다르면 다른 ID', () => {
    const id1 = computeSshTransportId('alice', 'host', 22)
    const id2 = computeSshTransportId('bob', 'host', 22)
    expect(id1).not.toBe(id2)
  })
})

describe('SshClient — 미연결 상태 가드', () => {
  it('getSftp() before connect → SSH_NOT_CONNECTED throw', () => {
    const client = new SshClient({
      host: 'localhost',
      port: 22,
      username: 'nobody',
      auth: { kind: 'agent' },
    })
    expect(() => client.getSftp()).toThrow(SshErrorCode.NOT_CONNECTED)
    expect(client.isConnected).toBe(false)
  })

  it('acceptedHostKey — connect 전 null', () => {
    const client = new SshClient({
      host: 'localhost',
      port: 22,
      username: 'nobody',
      auth: { kind: 'agent' },
    })
    expect(client.acceptedHostKey).toBe(null)
  })

  it('dispose 는 미연결 상태에서도 안전 (no-op)', async () => {
    const client = new SshClient({
      host: 'localhost',
      port: 22,
      username: 'nobody',
      auth: { kind: 'agent' },
    })
    await expect(client.dispose()).resolves.toBeUndefined()
  })
})
