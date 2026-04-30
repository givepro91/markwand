import { describe, it, expect } from 'vitest'
import path from 'node:path'
import {
  assertInWorkspace,
  isValidSshRoot,
  parseWorkspaceAddSshInput,
  parsePrefsGetInput,
  parsePrefsSetInput,
} from './validators'

// IPC 핸들러 보안 체크리스트 (Plan §M1.4 Critic G-Major).
// 각 IPC 경계가 workspace 밖 경로를 받으면 PATH_OUT_OF_WORKSPACE 를 던지는지 계약 검증.
// assertInWorkspace 는 모든 FS IPC 의 진입 guard — 이 계약 깨지면 path traversal 발생.

const WS = '/Users/alice/workspace'
const OTHER = '/Users/bob/other-workspace'

describe('assertInWorkspace — path traversal 방어', () => {
  it('워크스페이스 내부 절대경로 — 통과', () => {
    expect(() => assertInWorkspace(`${WS}/doc.md`, [WS])).not.toThrow()
  })

  it('워크스페이스 루트 자체 — 통과 (startsWith === 케이스)', () => {
    expect(() => assertInWorkspace(WS, [WS])).not.toThrow()
  })

  it('워크스페이스 밖 경로 — PATH_OUT_OF_WORKSPACE', () => {
    expect(() => assertInWorkspace('/etc/passwd', [WS])).toThrow('PATH_OUT_OF_WORKSPACE')
  })

  it('다른 워크스페이스 경로 — PATH_OUT_OF_WORKSPACE', () => {
    expect(() => assertInWorkspace(`${OTHER}/doc.md`, [WS])).toThrow('PATH_OUT_OF_WORKSPACE')
  })

  it('../ traversal — path.resolve 후 바깥 경로로 해석되면 거부', () => {
    // 상대경로가 들어오면 path.resolve 는 cwd 기준으로 풀리므로 워크스페이스 밖.
    expect(() => assertInWorkspace(`${WS}/../../etc/passwd`, [WS])).toThrow('PATH_OUT_OF_WORKSPACE')
  })

  it('prefix collision 방어 — /root2 가 /root 의 하위로 오인되지 않아야', () => {
    // '/root/file' vs '/root2/file' — startsWith('/root') 만 보면 /root2 가 통과해버린다.
    // 구현은 sep 포함 비교(startsWith(root + sep))로 이를 막는다.
    expect(() => assertInWorkspace('/root2/file', ['/root'])).toThrow('PATH_OUT_OF_WORKSPACE')
  })

  it('여러 workspaceRoots 중 하나만 매칭해도 통과', () => {
    expect(() => assertInWorkspace(`${OTHER}/doc.md`, [WS, OTHER])).not.toThrow()
  })

  it('빈 roots — 무조건 거부', () => {
    expect(() => assertInWorkspace(`${WS}/doc.md`, [])).toThrow('PATH_OUT_OF_WORKSPACE')
  })
})

describe('assertInWorkspace — {posix:true} (M3 SSH 사전 계약)', () => {
  it('posix=true 일 때 path.posix 로 해석 — 슬래시 경로만 허용', () => {
    // 현재 플랫폼이 macOS/Linux 면 posix 와 native 가 동일해 기본 동작과 구분 안 됨.
    // 테스트는 "계약이 throw 하지 않는다" 까지만 확인.
    expect(() => assertInWorkspace('/remote/workspace/file.md', ['/remote/workspace'], { posix: true })).not.toThrow()
    expect(() => assertInWorkspace('/other/path.md', ['/remote/workspace'], { posix: true })).toThrow('PATH_OUT_OF_WORKSPACE')
  })

  it('기본 (posix 미지정) — 기존 동작 보존', () => {
    // opts 미전달 → native path 사용, 기존 호출부 회귀 0
    const native = process.platform === 'win32' ? 'C:\\ws' : '/ws'
    const inside = path.join(native, 'a.md')
    expect(() => assertInWorkspace(inside, [native])).not.toThrow()
  })
})

describe('isValidSshRoot — Follow-up RF-2', () => {
  it('POSIX 절대경로 depth ≥ 2 — 통과', () => {
    expect(isValidSshRoot('/home/user')).toBe(true)
    expect(isValidSshRoot('/config/workspace')).toBe(true)
    expect(isValidSshRoot('/var/www/html')).toBe(true)
    expect(isValidSshRoot('/a/b/c/d')).toBe(true)
  })

  it('`/` 단독 — 거부 (assertInWorkspace 전체 허용 방지)', () => {
    expect(isValidSshRoot('/')).toBe(false)
  })

  it('depth 1 (`/home`) — 거부', () => {
    expect(isValidSshRoot('/home')).toBe(false)
    expect(isValidSshRoot('/root')).toBe(false)
  })

  it('상대경로 거부 — 절대경로만 허용', () => {
    expect(isValidSshRoot('home/user')).toBe(false)
    expect(isValidSshRoot('~/projects')).toBe(false)
    expect(isValidSshRoot('./foo')).toBe(false)
  })

  it('trailing slash 정규화 — /home/user/ == /home/user', () => {
    expect(isValidSshRoot('/home/user/')).toBe(true)
    expect(isValidSshRoot('/home/')).toBe(false)
  })

  it('중복 슬래시 정규화 — //home//user → depth 2', () => {
    expect(isValidSshRoot('//home//user')).toBe(true)
  })
})

describe('parseWorkspaceAddSshInput — root 필수 + depth 검증', () => {
  const baseInput = {
    name: 'test',
    host: '127.0.0.1',
    port: 22,
    user: 'alice',
    auth: { kind: 'agent' as const },
  }

  it('root 있고 depth ≥ 2 — 통과', () => {
    const parsed = parseWorkspaceAddSshInput({ ...baseInput, root: '/home/alice' })
    expect(parsed.root).toBe('/home/alice')
  })

  it('root 부재 — 거부', () => {
    expect(() => parseWorkspaceAddSshInput(baseInput)).toThrow()
  })

  it('root = "/" — 거부 (RF-2)', () => {
    expect(() => parseWorkspaceAddSshInput({ ...baseInput, root: '/' })).toThrow()
  })

  it('key-file auth 경로 수용', () => {
    const parsed = parseWorkspaceAddSshInput({
      ...baseInput,
      auth: { kind: 'key-file', path: '/Users/alice/.ssh/id_ed25519' },
      root: '/home/alice/projects',
    })
    expect(parsed.auth).toEqual({ kind: 'key-file', path: '/Users/alice/.ssh/id_ed25519' })
  })

  it('mode 미지정 시 기본값 "single" (FS8 — 속도 우선 원격 기본)', () => {
    const parsed = parseWorkspaceAddSshInput({ ...baseInput, root: '/home/alice' })
    expect(parsed.mode).toBe('single')
  })

  it('mode="container" 명시 수용', () => {
    const parsed = parseWorkspaceAddSshInput({
      ...baseInput,
      root: '/home/alice',
      mode: 'container',
    })
    expect(parsed.mode).toBe('container')
  })

  it('mode="invalid" — 거부', () => {
    expect(() =>
      parseWorkspaceAddSshInput({ ...baseInput, root: '/home/alice', mode: 'invalid' }),
    ).toThrow()
  })
})

// FS-RT-2 — activeProjectId persist allowlist 회귀 차단.
// 사용자 보고: dev hot-reload / 재시작 후 activeProjectId 풀려 ProjectView 가 mount 안 되고
// 신규 파일이 좌측 트리에 안 들어옴. activeProjectId 가 ALLOWED_PREFS_KEYS 에 누락되면
// 이 회귀가 즉시 재발하므로, prefs:get/set 양쪽에서 통과 여부를 명시 검증한다.
describe('ALLOWED_PREFS_KEYS — activeProjectId 통과 (FS-RT-2)', () => {
  it('parsePrefsGetInput — activeProjectId 키 통과', () => {
    expect(() => parsePrefsGetInput({ key: 'activeProjectId' })).not.toThrow()
  })

  it('parsePrefsSetInput — activeProjectId 문자열 값 통과', () => {
    const out = parsePrefsSetInput({ key: 'activeProjectId', value: 'abc1234567890def' })
    expect(out.key).toBe('activeProjectId')
    expect(out.value).toBe('abc1234567890def')
  })

  it('parsePrefsSetInput — activeProjectId null 값 통과 (사용자가 프로젝트 빠져나간 의도 보존)', () => {
    const out = parsePrefsSetInput({ key: 'activeProjectId', value: null })
    expect(out.key).toBe('activeProjectId')
    expect(out.value).toBeNull()
  })

  it('parsePrefsGetInput — 알 수 없는 키 거부', () => {
    expect(() => parsePrefsGetInput({ key: 'fakeKey__' })).toThrow('PREFS_KEY_NOT_ALLOWED')
  })
})
