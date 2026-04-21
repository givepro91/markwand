// ~/.ssh/config 파서 — Plan §S2.2.
//
// cyjake/ssh-config 라이브러리 래퍼. Markwand 전용 정책:
//   - 허용 11 directive 만 추출 (HostName/Port/User/IdentityFile/IdentitiesOnly/
//     ProxyJump/ServerAliveInterval/ServerAliveCountMax/UserKnownHostsFile/
//     StrictHostKeyChecking/Host)
//   - 거부 3 directive (ProxyCommand · Include · Match) 를 포함한 Host 블록은
//     **드롭다운에서 제외** + 경고 로그. 사용자 선택지에 노출되지 않음 (DC-4 RCE 방어).
//   - StrictHostKeyChecking=no 는 무시(DC-4 — 항상 검증).
//   - 파일 권한 0600 (느슨하면 경고, 차단 안 함 — OpenSSH 관례)

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import SSHConfig, { LineType } from 'ssh-config'

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.ssh', 'config')

export const ALLOWED_DIRECTIVES = new Set([
  'Host',
  'HostName',
  'Port',
  'User',
  'IdentityFile',
  'IdentitiesOnly',
  'ProxyJump',
  'ServerAliveInterval',
  'ServerAliveCountMax',
  'UserKnownHostsFile',
  'StrictHostKeyChecking',
])

export const REJECTED_DIRECTIVES = new Set(['ProxyCommand', 'Include', 'Match'])

export interface SshConfigHost {
  /** Host alias — 사용자 드롭다운에 표시되는 이름 */
  alias: string
  hostname?: string
  port?: number
  user?: string
  identityFile?: string[] // 복수 지정 가능
  identitiesOnly?: boolean
  proxyJump?: string
  serverAliveInterval?: number
  serverAliveCountMax?: number
  /** 거부 directive 가 섞여 있어 드롭다운에서 제외된 경우 사유 */
  rejectedReason?: string
}

export interface LoadSshConfigResult {
  /** ~/.ssh/config 경로. 존재 여부와 무관하게 항상 반환. */
  configPath: string
  /** 파일 존재 여부 */
  exists: boolean
  /** 권한 이슈(0077 & mode !== 0) — 경고용, 차단 아님 */
  permissionWarning?: string
  /** 허용 directive 로만 구성된 Host 블록 */
  hosts: SshConfigHost[]
  /** 거부 directive 로 제외된 Host alias + 사유 (경고 토스트 용) */
  rejected: Array<{ alias: string; reason: string }>
}

/**
 * ~/.ssh/config 파싱. 파일 없음 → exists:false + hosts:[]. 파싱 실패 → hosts:[] + 경고.
 */
export function loadSshConfig(configPath: string = DEFAULT_CONFIG_PATH): LoadSshConfigResult {
  const result: LoadSshConfigResult = {
    configPath,
    exists: false,
    hosts: [],
    rejected: [],
  }
  let text: string
  try {
    const st = fs.statSync(configPath)
    result.exists = true
    // 파일 권한 검사 (Linux/macOS only — Windows 는 스킵).
    // Mac/Linux 에서 group/other 비트가 세팅돼 있으면 OpenSSH 가 거부하기도 함. 경고만.
    if (process.platform !== 'win32') {
      const looseBits = st.mode & 0o077
      if (looseBits !== 0) {
        result.permissionWarning = `Insecure permissions (0${(st.mode & 0o777).toString(8)}), recommend 0600`
      }
    }
    text = fs.readFileSync(configPath, 'utf8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return result
    // EACCES·기타 read 실패 — Manual entry mode 로 폴백.
    result.permissionWarning = `Cannot read SSH config: ${(err as Error).message}`
    return result
  }

  let config: SSHConfig
  try {
    config = SSHConfig.parse(text)
  } catch (err) {
    result.permissionWarning = `Parse error: ${(err as Error).message}`
    return result
  }

  for (const line of config) {
    if (line.type !== LineType.DIRECTIVE) continue
    if (line.param !== 'Host') continue
    const sec = line as unknown as { param: string; value: string | Array<{ val: string }>; config?: SSHConfig }
    const aliases = normalizeValueToList(sec.value)
    if (aliases.length === 0) continue
    // Host 패턴 중 glob/negation 을 포함한 엔트리는 드롭다운에서 제외(본체 매칭·exclude 용).
    // S2 Evaluator m-1: `Host !bad good` 의 `!bad` 같은 single-alias negation 도 필터링.
    const userAliases = aliases.filter(
      (a) => !a.includes('*') && !a.includes('?') && !a.startsWith('!'),
    )
    if (userAliases.length === 0) continue

    const rejection = findRejectedDirective(sec.config)
    if (rejection) {
      for (const alias of userAliases) {
        result.rejected.push({ alias, reason: rejection })
      }
      continue
    }

    const host = extractHostSpec(sec.config)
    for (const alias of userAliases) {
      result.hosts.push({ alias, ...host })
    }
  }

  return result
}

function normalizeValueToList(v: string | Array<{ val: string }>): string[] {
  if (typeof v === 'string') return [v]
  return v.map((x) => x.val)
}

function findRejectedDirective(inner: SSHConfig | undefined): string | undefined {
  if (!inner) return undefined
  for (const line of inner) {
    if (line.type !== LineType.DIRECTIVE) continue
    if (REJECTED_DIRECTIVES.has(line.param)) {
      return `Unsupported directive: ${line.param}`
    }
  }
  return undefined
}

function extractHostSpec(inner: SSHConfig | undefined): Omit<SshConfigHost, 'alias'> {
  const out: Omit<SshConfigHost, 'alias'> = {}
  if (!inner) return out
  const identityFiles: string[] = []
  for (const line of inner) {
    if (line.type !== LineType.DIRECTIVE) continue
    const param = line.param
    if (!ALLOWED_DIRECTIVES.has(param)) continue
    const value = readDirectiveValue(line.value)
    if (value === undefined) continue
    switch (param) {
      case 'HostName':
        out.hostname = value
        break
      case 'Port': {
        const n = parseInt(value, 10)
        if (!Number.isNaN(n)) out.port = n
        break
      }
      case 'User':
        out.user = value
        break
      case 'IdentityFile':
        identityFiles.push(expandTilde(value))
        break
      case 'IdentitiesOnly':
        out.identitiesOnly = /^yes$/i.test(value)
        break
      case 'ProxyJump':
        out.proxyJump = value
        break
      case 'ServerAliveInterval': {
        const n = parseInt(value, 10)
        if (!Number.isNaN(n)) out.serverAliveInterval = n
        break
      }
      case 'ServerAliveCountMax': {
        const n = parseInt(value, 10)
        if (!Number.isNaN(n)) out.serverAliveCountMax = n
        break
      }
      // StrictHostKeyChecking: 'no' 는 무시(DC-4 — 항상 검증). 'yes'/'accept-new' 는 현재 영향 없음 (v1.0 에서는 TOFU 로 획일 처리).
    }
  }
  if (identityFiles.length > 0) out.identityFile = identityFiles
  return out
}

function readDirectiveValue(v: string | Array<{ val: string }>): string | undefined {
  if (typeof v === 'string') return v.trim()
  if (Array.isArray(v) && v.length > 0) return v[0].val.trim()
  return undefined
}

function expandTilde(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1))
  }
  return p
}
