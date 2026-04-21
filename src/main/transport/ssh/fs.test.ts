/**
 * SshFsDriver unit tests — mock SFTP 기반.
 * Plan §S1 DoD.
 */
import { describe, it, expect, vi } from 'vitest'
import { Readable } from 'node:stream'
import { createSshFsDriver } from './fs'
import type { SshClient } from './client'
import type { PromisifiedSftp } from './util/promisifiedSftp'

function makeMockSftp(partial: Partial<PromisifiedSftp>): PromisifiedSftp {
  return {
    readdir: vi.fn().mockRejectedValue(new Error('not mocked')),
    stat: vi.fn().mockRejectedValue(new Error('not mocked')),
    lstat: vi.fn().mockRejectedValue(new Error('not mocked')),
    readFile: vi.fn().mockRejectedValue(new Error('not mocked')),
    createReadStream: vi.fn().mockImplementation(() => Readable.from([])),
    ...partial,
  } as PromisifiedSftp
}

function makeMockClient(sftp: PromisifiedSftp): SshClient {
  return { getSftp: () => sftp, isConnected: true } as unknown as SshClient
}

describe('SshFsDriver.stat', () => {
  it('SFTP Stats → FileStat 변환 (mtime seconds → ms)', async () => {
    const sftp = makeMockSftp({
      stat: vi.fn().mockResolvedValue({
        size: 1024,
        mtime: 1776756069, // epoch seconds
        mode: 0o100644, // regular file
        isDirectory: () => false,
      }),
    })
    const fs = createSshFsDriver(makeMockClient(sftp))
    const st = await fs.stat('/remote/note.md')
    expect(st.size).toBe(1024)
    expect(st.mtimeMs).toBe(1776756069 * 1000)
    expect(st.isDirectory).toBe(false)
    expect(st.isSymlink).toBe(false) // v1.0 고정
  })

  it('attrs.mtime=0 → mtimeMs=-1 (Critic M-2 폴백)', async () => {
    const sftp = makeMockSftp({
      stat: vi.fn().mockResolvedValue({ size: 10, mtime: 0, isDirectory: () => false }),
    })
    const fs = createSshFsDriver(makeMockClient(sftp))
    const st = await fs.stat('/x.md')
    expect(st.mtimeMs).toBe(-1)
  })
})

describe('SshFsDriver.readFile', () => {
  it('size-first + maxBytes 2MB 기본 — 초과 파일 FILE_TOO_LARGE', async () => {
    const sftp = makeMockSftp({
      stat: vi.fn().mockResolvedValue({ size: 3 * 1024 * 1024, mtime: 1, isDirectory: () => false }),
    })
    const fs = createSshFsDriver(makeMockClient(sftp))
    await expect(fs.readFile('/big.md')).rejects.toThrow('FILE_TOO_LARGE')
  })

  it('기본 maxBytes 이하 파일은 readFile 실행', async () => {
    const expected = Buffer.from('hello')
    const sftp = makeMockSftp({
      stat: vi.fn().mockResolvedValue({ size: 5, mtime: 1, isDirectory: () => false }),
      readFile: vi.fn().mockResolvedValue(expected),
    })
    const fs = createSshFsDriver(makeMockClient(sftp))
    const buf = await fs.readFile('/small.md')
    expect(buf.toString('utf8')).toBe('hello')
  })

  it('opts.maxBytes 초과 시 FILE_TOO_LARGE (2MB 디폴트 무시하고 더 작은 한도 준수)', async () => {
    const sftp = makeMockSftp({
      stat: vi.fn().mockResolvedValue({ size: 8192, mtime: 1, isDirectory: () => false }),
    })
    const fs = createSshFsDriver(makeMockClient(sftp))
    await expect(fs.readFile('/m.md', { maxBytes: 4096 })).rejects.toThrow('FILE_TOO_LARGE')
  })
})

describe('SshFsDriver.readStream — 서버측 범위 요청 최적화 (S0 Evaluator M-2)', () => {
  it('opts.maxBytes 있으면 createReadStream 에 {start:0, end:maxBytes-1} 전달', async () => {
    const createReadStream = vi.fn().mockImplementation(() => Readable.from([Buffer.from('x')]))
    const sftp = makeMockSftp({ createReadStream: createReadStream as unknown as PromisifiedSftp['createReadStream'] })
    const fs = createSshFsDriver(makeMockClient(sftp))
    const iter = fs.readStream('/note.md', { maxBytes: 4096 })
    // iterator 소비 시작 — createReadStream 호출 강제
    await iter[Symbol.asyncIterator]().next()
    expect(createReadStream).toHaveBeenCalledWith('/note.md', { start: 0, end: 4095 })
  })

  it('opts.maxBytes 없으면 범위 옵션 없이 전체 stream 요청', async () => {
    const createReadStream = vi.fn().mockImplementation(() => Readable.from([]))
    const sftp = makeMockSftp({ createReadStream: createReadStream as unknown as PromisifiedSftp['createReadStream'] })
    const fs = createSshFsDriver(makeMockClient(sftp))
    const iter = fs.readStream('/big.md')
    await iter[Symbol.asyncIterator]().next()
    expect(createReadStream).toHaveBeenCalledWith('/big.md', undefined)
  })
})

describe('SshFsDriver.access', () => {
  it('stat 성공 → true', async () => {
    const sftp = makeMockSftp({
      stat: vi.fn().mockResolvedValue({ size: 1, mtime: 1, isDirectory: () => false }),
    })
    const fs = createSshFsDriver(makeMockClient(sftp))
    expect(await fs.access('/x')).toBe(true)
  })
  it('stat throw → false (throw 전파 안 함)', async () => {
    const sftp = makeMockSftp({ stat: vi.fn().mockRejectedValue(new Error('ENOENT')) })
    const fs = createSshFsDriver(makeMockClient(sftp))
    expect(await fs.access('/ghost')).toBe(false)
  })
})
