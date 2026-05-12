/**
 * Follow-up FS1 — resolveTransportForPath 단위 테스트.
 * 경로 역매핑이 로컬/SSH/경계 밖 3 케이스에서 올바르게 분기하는지 확인.
 *
 * 주의: SSH 케이스는 getActiveTransport 가 electron-store + pool 의존성을 가지므로
 * 이 테스트에서는 로컬 workspace 매칭과 경계 밖 케이스 위주로 확인한다. SSH 매칭은
 * 통합 테스트(Docker sshd) 에서 커버.
 */
import { describe, it, expect, vi } from 'vitest'
import type { Workspace } from '../../preload/types'
import { normalizeMarkdownFileName, normalizeRenameFileName, resolveTransportForPath } from './fs'
import { localTransport } from '../transport/local'

vi.mock('../services/store', () => ({
  getStore: () => Promise.resolve({ get: () => [] }),
}))

const localWs: Workspace = {
  id: 'uuid-local',
  name: 'local-ws',
  root: '/Users/alice/projects',
  mode: 'container',
  transport: { type: 'local' },
  addedAt: 0,
  lastOpened: null,
}

const sshWs: Workspace = {
  id: 'ssh:abc123',
  name: 'remote-ws',
  root: '/home/bob/projects',
  mode: 'container',
  transport: {
    type: 'ssh',
    host: '127.0.0.1',
    port: 22,
    user: 'bob',
    auth: { kind: 'agent' },
  },
  addedAt: 0,
  lastOpened: null,
}

describe('resolveTransportForPath', () => {
  it('로컬 workspace 내부 경로 — localTransport 반환', async () => {
    const result = await resolveTransportForPath('/Users/alice/projects/foo/a.md', [localWs])
    expect(result).not.toBeNull()
    expect(result?.ws.id).toBe('uuid-local')
    expect(result?.transport).toBe(localTransport)
    expect(result?.transport.kind).toBe('local')
  })

  it('워크스페이스 밖 경로 — null 반환', async () => {
    const result = await resolveTransportForPath('/etc/passwd', [localWs])
    expect(result).toBeNull()
  })

  it('prefix 충돌 방어 — /Users/alice/projects-evil 은 /Users/alice/projects 에 매칭되지 않음', async () => {
    const result = await resolveTransportForPath('/Users/alice/projects-evil/x.md', [localWs])
    expect(result).toBeNull()
  })

  it('../ traversal — path.resolve 후 바깥 경로로 귀결되면 거부', async () => {
    // /Users/alice/projects/../../etc/passwd → /Users/etc/passwd (경계 밖)
    const result = await resolveTransportForPath(
      '/Users/alice/projects/../../etc/passwd',
      [localWs],
    )
    expect(result).toBeNull()
  })

  it('여러 workspaces 중 첫 매칭 반환', async () => {
    const other: Workspace = { ...localWs, id: 'uuid-other', root: '/tmp/other' }
    const result = await resolveTransportForPath('/tmp/other/x.md', [localWs, other])
    expect(result?.ws.id).toBe('uuid-other')
  })

  it('SSH workspace root 매칭 — getActiveTransport 호출 경로 확인 (throw 여부만)', async () => {
    // SSH 는 pool 의존성으로 실제 transport 가 생성되려 시도 — electron-store 접근 시점에서
    // 테스트 환경이 실패할 수 있음. 여기서는 경로 매칭 성공 후 transport 생성 시도가
    // 일어나는지(= 매칭은 성공함을 확인)만 체크.
    await expect(
      resolveTransportForPath('/home/bob/projects/x.md', [sshWs]),
    ).rejects.toThrow() // electron-store 또는 pool 초기화 실패
  })

  it('SSH workspace 밖 경로 — null 반환 (transport 생성 시도 없음)', async () => {
    const result = await resolveTransportForPath('/home/carol/other/x.md', [sshWs])
    expect(result).toBeNull()
  })
})

describe('file mutation helpers', () => {
  it('새 마크다운 이름에 .md 확장자를 보강하고 다른 확장자는 거부', () => {
    expect(normalizeMarkdownFileName('daily-note')).toBe('daily-note.md')
    expect(normalizeMarkdownFileName('daily-note.md')).toBe('daily-note.md')
    expect(() => normalizeMarkdownFileName('daily-note.txt')).toThrow('INVALID_MARKDOWN_EXTENSION')
  })

  it('rename 입력에 확장자가 없으면 기존 확장자를 보존하고 viewable 확장자만 허용', () => {
    expect(normalizeRenameFileName('spec.md', 'proposal')).toBe('proposal.md')
    expect(normalizeRenameFileName('screen.png', 'hero')).toBe('hero.png')
    expect(() => normalizeRenameFileName('spec.md', 'proposal.txt')).toThrow('UNSUPPORTED_FILE_TYPE')
    expect(() => normalizeRenameFileName('spec.md', 'proposal.png')).toThrow('INVALID_RENAME_EXTENSION')
  })
})
