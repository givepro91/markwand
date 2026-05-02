/**
 * SshScannerDriver unit tests — mock SFTP 기반.
 * Plan §S1 DoD.
 */
import { describe, it, expect, vi } from 'vitest'
import { Readable } from 'node:stream'
import { createSshScannerDriver } from './scanner'
import type { SshClient } from './client'
import type { PromisifiedSftp } from './util/promisifiedSftp'

const S_IFREG = 0o100000
const S_IFDIR = 0o040000

function entry(name: string, opts: { size?: number; mtime?: number; isDir?: boolean } = {}) {
  return {
    filename: name,
    longname: '',
    attrs: {
      size: opts.size ?? 0,
      mtime: opts.mtime ?? 1776756069,
      mode: (opts.isDir ? S_IFDIR : S_IFREG) | 0o644,
    },
  }
}

function makeTree(tree: Record<string, ReturnType<typeof entry>[]>) {
  return async (path: string) => {
    if (!(path in tree)) throw new Error(`no readdir: ${path}`)
    return tree[path]
  }
}

function makeClient(readdir: (p: string) => Promise<ReturnType<typeof entry>[]>): SshClient {
  const sftp: PromisifiedSftp = {
    readdir: readdir as unknown as PromisifiedSftp['readdir'],
    stat: vi.fn(),
    lstat: vi.fn(),
    readFile: vi.fn(),
    createReadStream: vi.fn().mockImplementation(() => Readable.from([])),
  }
  return { getSftp: () => sftp, isConnected: true } as unknown as SshClient
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const x of iter) out.push(x)
  return out
}

describe('SshScannerDriver.scanDocs', () => {
  it('readdir 결과에서 md 파일만 FileStat 로 yield (attrs.mtime 재활용 — stat 재호출 0)', async () => {
    const readdir = makeTree({
      '/root': [entry('note.md', { size: 100, mtime: 1000 }), entry('image.png', { size: 50 })],
    })
    const scanner = createSshScannerDriver(makeClient(readdir))
    const docs = await collect(scanner.scanDocs('/root', ['**/*.md'], []))
    expect(docs).toHaveLength(1)
    expect(docs[0].path).toBe('/root/note.md')
    expect(docs[0].size).toBe(100)
    expect(docs[0].mtimeMs).toBe(1000 * 1000)
    expect(docs[0].isSymlink).toBe(false)
  })

  it('디렉토리는 재귀 walk (attrs.mode 기반 디렉토리 판정)', async () => {
    const readdir = makeTree({
      '/root': [entry('docs', { isDir: true })],
      '/root/docs': [entry('a.md', { size: 10 }), entry('b.md', { size: 20 })],
    })
    const scanner = createSshScannerDriver(makeClient(readdir))
    const docs = await collect(scanner.scanDocs('/root', ['**/*.md'], []))
    expect(docs.map((d) => d.path).sort()).toEqual(['/root/docs/a.md', '/root/docs/b.md'])
  })

  it('ignore 패턴 준수 — **/node_modules/** / **/__fixtures__/** / **/.pytest_cache/**', async () => {
    const readdir = makeTree({
      '/root': [
        entry('README.md', { size: 10 }),
        entry('node_modules', { isDir: true }),
        entry('__fixtures__', { isDir: true }),
        entry('.pytest_cache', { isDir: true }),
      ],
    })
    const scanner = createSshScannerDriver(makeClient(readdir))
    const docs = await collect(
      scanner.scanDocs('/root', ['**/*.md'], ['**/node_modules/**', '**/__fixtures__/**', '**/.pytest_cache/**']),
    )
    expect(docs.map((d) => d.path)).toEqual(['/root/README.md'])
  })

  it('attrs.mtime=0 → mtimeMs=-1 (Critic M-2 폴백)', async () => {
    const readdir = makeTree({
      '/root': [entry('z.md', { size: 5, mtime: 0 })],
    })
    const scanner = createSshScannerDriver(makeClient(readdir))
    const docs = await collect(scanner.scanDocs('/root', ['**/*.md'], []))
    expect(docs[0].mtimeMs).toBe(-1)
  })

  it('readdir 실패는 silent skip (권한 거부·경로 부재)', async () => {
    const readdir = async (p: string) => {
      if (p === '/root') return [entry('secret', { isDir: true }), entry('ok.md', { size: 1 })]
      throw new Error('EACCES')
    }
    const scanner = createSshScannerDriver(makeClient(readdir))
    const docs = await collect(scanner.scanDocs('/root', ['**/*.md'], []))
    expect(docs.map((d) => d.path)).toEqual(['/root/ok.md'])
  })
})

describe('SshScannerDriver.countDocs', () => {
  it('scanDocs 결과 count 반환', async () => {
    const readdir = makeTree({
      '/root': [entry('a.md', { size: 1 }), entry('b.md', { size: 1 }), entry('c.png', { size: 1 })],
    })
    const scanner = createSshScannerDriver(makeClient(readdir))
    const n = await scanner.countDocs('/root', ['**/*.md'], [])
    expect(n).toBe(2)
  })
})

describe('SshScannerDriver.detectWorkspaceMode', () => {
  it('하위에 package.json 이 있으면 container', async () => {
    const readdir = makeTree({
      '/root': [entry('proj-a', { isDir: true })],
      '/root/proj-a': [entry('package.json'), entry('index.ts')],
    })
    const scanner = createSshScannerDriver(makeClient(readdir))
    expect(await scanner.detectWorkspaceMode('/root')).toBe('container')
  })

  it('하위에 마커 없으면 single', async () => {
    const readdir = makeTree({
      '/root': [entry('notes', { isDir: true })],
      '/root/notes': [entry('a.md')],
    })
    const scanner = createSshScannerDriver(makeClient(readdir))
    expect(await scanner.detectWorkspaceMode('/root')).toBe('single')
  })

  it('root readdir 실패 → single (fallback)', async () => {
    const readdir = async () => {
      throw new Error('ENOTDIR')
    }
    const scanner = createSshScannerDriver(makeClient(readdir))
    expect(await scanner.detectWorkspaceMode('/root')).toBe('single')
  })
})
