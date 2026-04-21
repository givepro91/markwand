import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { localFs } from './fs'

// LocalFsDriver 단위 테스트 — FsDriver 계약 검증 (설계서 §2.2 rev. M1).
// 초점: stat(FileStat 변환)·readFile(maxBytes 기본 2MB·size-first)·readStream(cap)·access.

let tmp: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'markwand-fs-'))
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('LocalFsDriver.stat', () => {
  it('파일 stat — size/mtimeMs/isDirectory=false/isSymlink=false', async () => {
    const p = path.join(tmp, 'a.md')
    fs.writeFileSync(p, '# hi', 'utf-8')
    const st = await localFs.stat(p)
    expect(st.path).toBe(p)
    expect(st.size).toBe(4)
    expect(typeof st.mtimeMs).toBe('number')
    expect(st.mtimeMs).toBeGreaterThan(0)
    expect(st.isDirectory).toBe(false)
    expect(st.isSymlink).toBe(false)
  })

  it('디렉토리 stat — isDirectory=true', async () => {
    const d = path.join(tmp, 'sub')
    fs.mkdirSync(d)
    const st = await localFs.stat(d)
    expect(st.isDirectory).toBe(true)
    expect(st.isSymlink).toBe(false)
  })

  it('symlink stat — isSymlink=true + follow 후 메타 반영', async () => {
    const target = path.join(tmp, 'target.md')
    fs.writeFileSync(target, 'body', 'utf-8')
    const link = path.join(tmp, 'link.md')
    fs.symlinkSync(target, link)
    const st = await localFs.stat(link)
    expect(st.isSymlink).toBe(true)
    expect(st.size).toBe(4) // target 의 size
    expect(st.isDirectory).toBe(false)
  })
})

describe('LocalFsDriver.readFile (maxBytes 계약 — Known Risk Hard 해소)', () => {
  it('기본 maxBytes=2MB 하에 정상 크기 파일 읽기', async () => {
    const p = path.join(tmp, 'small.md')
    fs.writeFileSync(p, 'hello', 'utf-8')
    const buf = await localFs.readFile(p)
    expect(buf.toString('utf-8')).toBe('hello')
  })

  it('size-first: 2MB 초과 파일은 FILE_TOO_LARGE 예외 (기본 maxBytes)', async () => {
    const p = path.join(tmp, 'huge.md')
    fs.writeFileSync(p, Buffer.alloc(3 * 1024 * 1024, 'a')) // 3MB
    await expect(localFs.readFile(p)).rejects.toThrow('FILE_TOO_LARGE')
  })

  it('opts.maxBytes 커스텀 상한 존중', async () => {
    const p = path.join(tmp, 'mid.md')
    fs.writeFileSync(p, Buffer.alloc(100, 'b')) // 100B
    await expect(localFs.readFile(p, { maxBytes: 50 })).rejects.toThrow('FILE_TOO_LARGE')
    const buf = await localFs.readFile(p, { maxBytes: 100 })
    expect(buf.length).toBe(100)
  })
})

describe('LocalFsDriver.readStream (M5 app:// 사전 계약)', () => {
  it('청크 스트림 수집이 전체 바이트 일치', async () => {
    const p = path.join(tmp, 'img.bin')
    const payload = Buffer.from('sample-bytes')
    fs.writeFileSync(p, payload)
    const chunks: Uint8Array[] = []
    for await (const chunk of localFs.readStream(p)) chunks.push(chunk)
    const total = Buffer.concat(chunks.map((c) => Buffer.from(c)))
    expect(total.equals(payload)).toBe(true)
  })

  it('opts.maxBytes 초과 시 스트림 중단 + FILE_TOO_LARGE', async () => {
    const p = path.join(tmp, 'big.bin')
    fs.writeFileSync(p, Buffer.alloc(1000, 'c'))
    let threw = false
    try {
      for await (const _ of localFs.readStream(p, { maxBytes: 500 })) {
        // 일부 청크 수신 후 예외 발생 예상
      }
    } catch (e) {
      threw = true
      expect((e as Error).message).toBe('FILE_TOO_LARGE')
    }
    expect(threw).toBe(true)
  })
})

describe('LocalFsDriver.access', () => {
  it('존재 — true', async () => {
    const p = path.join(tmp, 'exists.md')
    fs.writeFileSync(p, 'x')
    expect(await localFs.access(p)).toBe(true)
  })

  it('부재 — false (throw 없음)', async () => {
    const p = path.join(tmp, 'ghost.md')
    expect(await localFs.access(p)).toBe(false)
  })
})
