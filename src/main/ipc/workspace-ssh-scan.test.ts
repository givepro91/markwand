/**
 * Follow-up FS0 — scanProjectsViaSftp 단위 테스트.
 * mock PromisifiedSftp 로 SFTP readdir 시퀀스를 재현해 container/single 모드 모두 확인.
 */
import { describe, it, expect } from 'vitest'
import type { FileEntry } from 'ssh2'
import type { PromisifiedSftp } from '../transport/ssh/util/promisifiedSftp'
import { scanProjectsViaSftp } from './workspace'

const S_IFDIR = 0o040000
const S_IFREG = 0o100000

function dirEntry(name: string): FileEntry {
  return {
    filename: name,
    longname: `drwxr-xr-x 2 user user 4096 Jan 1 00:00 ${name}`,
    attrs: {
      mode: S_IFDIR | 0o755,
      size: 0,
      uid: 1000,
      gid: 1000,
      atime: 0,
      mtime: 0,
    },
  } as FileEntry
}

function fileEntry(name: string, size = 0): FileEntry {
  return {
    filename: name,
    longname: `-rw-r--r-- 1 user user ${size} Jan 1 00:00 ${name}`,
    attrs: {
      mode: S_IFREG | 0o644,
      size,
      uid: 1000,
      gid: 1000,
      atime: 0,
      mtime: 0,
    },
  } as FileEntry
}

/**
 * 경로→FileEntry[] 매핑 기반 mock. 미등록 경로는 throw (readdir 실패 — silent skip 계약 검증용).
 */
function makeMockSftp(tree: Record<string, FileEntry[]>): PromisifiedSftp {
  return {
    readdir: async (p: string) => {
      const entries = tree[p]
      if (entries === undefined) throw new Error(`ENOENT: ${p}`)
      return entries
    },
    stat: async () => {
      throw new Error('not-used-in-test')
    },
    lstat: async () => {
      throw new Error('not-used-in-test')
    },
    readFile: async () => {
      throw new Error('not-used-in-test')
    },
    createReadStream: (() => {
      throw new Error('not-used-in-test')
    }) as PromisifiedSftp['createReadStream'],
  }
}

describe('scanProjectsViaSftp', () => {
  it('single 모드 — 루트 자체가 프로젝트 (마커 있으면 markers 채움)', async () => {
    const sftp = makeMockSftp({
      '/home/alice/proj-a': [
        fileEntry('package.json'),
        fileEntry('README.md'),
        dirEntry('src'),
      ],
    })
    const projects = await scanProjectsViaSftp(sftp, 'ssh:abc', '/home/alice/proj-a', 'single')
    expect(projects).toHaveLength(1)
    expect(projects[0].root).toBe('/home/alice/proj-a')
    expect(projects[0].name).toBe('proj-a')
    expect(projects[0].workspaceId).toBe('ssh:abc')
    expect(projects[0].markers.sort()).toEqual(['README.md', 'package.json'])
    expect(projects[0].docCount).toBe(-1)
  })

  it('single 모드 — 마커 없어도 프로젝트 1건 반환 (사용자 명시 의도)', async () => {
    const sftp = makeMockSftp({
      '/home/alice/empty': [dirEntry('notes')],
    })
    const projects = await scanProjectsViaSftp(sftp, 'ssh:abc', '/home/alice/empty', 'single')
    expect(projects).toHaveLength(1)
    expect(projects[0].markers).toEqual([])
  })

  it('container 모드 — depth 2 탐색, 프로젝트 마커 발견 시 그 하위는 재귀 안 함', async () => {
    const sftp = makeMockSftp({
      '/home/alice/ws': [
        dirEntry('proj-a'), // 마커 있음
        dirEntry('meta'), // 마커 없음, 하위로 depth 2
        dirEntry('node_modules'), // IGNORE
      ],
      '/home/alice/ws/proj-a': [
        fileEntry('package.json'),
        dirEntry('src'), // 재귀 금지 (이미 프로젝트로 등록)
      ],
      '/home/alice/ws/meta': [dirEntry('proj-b')],
      '/home/alice/ws/meta/proj-b': [fileEntry('CLAUDE.md')],
      '/home/alice/ws/proj-a/src': [fileEntry('index.ts')], // 재귀되면 안 됨
    })
    const projects = await scanProjectsViaSftp(sftp, 'ssh:abc', '/home/alice/ws', 'container')
    expect(projects).toHaveLength(2)
    const roots = projects.map((p) => p.root).sort()
    expect(roots).toEqual(['/home/alice/ws/meta/proj-b', '/home/alice/ws/proj-a'])
    const projA = projects.find((p) => p.root === '/home/alice/ws/proj-a')!
    expect(projA.markers).toEqual(['package.json'])
    const projB = projects.find((p) => p.root === '/home/alice/ws/meta/proj-b')!
    expect(projB.markers).toEqual(['CLAUDE.md'])
  })

  it('container 모드 — PROJECT_SCAN_IGNORE 디렉토리 재귀 건너뜀', async () => {
    const sftp = makeMockSftp({
      '/root': [
        dirEntry('node_modules'),
        dirEntry('dist'),
        dirEntry('__fixtures__'),
        dirEntry('my-project'),
      ],
      '/root/my-project': [fileEntry('go.mod')],
    })
    const projects = await scanProjectsViaSftp(sftp, 'ssh:xyz', '/root', 'container')
    expect(projects).toHaveLength(1)
    expect(projects[0].root).toBe('/root/my-project')
  })

  it('readdir 실패 — silent skip (권한 거부 시나리오)', async () => {
    // 루트 readdir 성공, 하위 접근 권한 없음 → 빈 목록이 아닌 throw → silent skip.
    const sftp = makeMockSftp({
      '/root': [dirEntry('forbidden')],
      // '/root/forbidden' 미등록 → mock 이 throw → scanProjectsViaSftp 는 silent skip
    })
    const projects = await scanProjectsViaSftp(sftp, 'ssh:xyz', '/root', 'container')
    expect(projects).toHaveLength(0)
  })
})
