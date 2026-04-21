import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { contentHash, invalidateHash, clearHashCache, hashCacheSize } from './hash'
import { localFs } from '../../main/transport/local/fs'

// M2 hash 보조 계산 — Plan §S2 DoD 5 케이스.
// 판정은 drift.ts 에서 mtime 유지 — hash 는 병행 기록만 (VerifiedReference.hashAtCheck).

let tmp: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'markwand-hash-'))
  clearHashCache()
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('contentHash — sha256 + (mtimeMs, size) 캐시', () => {
  it('같은 mtime + 다른 content → 다른 hash (cache miss 후 재계산)', async () => {
    const p = path.join(tmp, 'a.md')
    fs.writeFileSync(p, 'version-one', 'utf-8')
    const s1 = await localFs.stat(p)
    const h1 = await contentHash(localFs, p, { mtimeMs: s1.mtimeMs, size: s1.size })

    // 파일을 같은 길이로 수정하면 size 동일 + mtime 갱신 → 캐시 miss
    // 여기서는 mtime 을 강제로 s1 과 동일하게 둔 채 내용만 바꾼 시뮬레이션을 위해
    // 직접 mtimeMs 를 이전 값으로 호출 — size 가 달라지므로 캐시 invalidate 될 것.
    fs.writeFileSync(p, 'version-TWO!', 'utf-8')
    const s2 = await localFs.stat(p)
    expect(s2.size).not.toBe(s1.size) // size 가 다름을 전제
    const h2 = await contentHash(localFs, p, { mtimeMs: s1.mtimeMs, size: s2.size })
    expect(h2).not.toBe(h1)
  })

  it('다른 mtime + 같은 content → cache miss → 같은 hash', async () => {
    const p = path.join(tmp, 'b.md')
    fs.writeFileSync(p, 'stable-body', 'utf-8')
    const s1 = await localFs.stat(p)
    const h1 = await contentHash(localFs, p, { mtimeMs: s1.mtimeMs, size: s1.size })

    // mtime 만 갱신 (touch) — content 는 그대로
    const future = s1.mtimeMs + 10_000
    fs.utimesSync(p, future / 1000, future / 1000)
    const s2 = await localFs.stat(p)
    expect(s2.mtimeMs).not.toBe(s1.mtimeMs)

    const h2 = await contentHash(localFs, p, { mtimeMs: s2.mtimeMs, size: s2.size })
    expect(h2).toBe(h1) // content 동일
  })

  it('같은 (mtime, size) → cache hit (readFile 호출 0회 검증)', async () => {
    const p = path.join(tmp, 'c.md')
    fs.writeFileSync(p, 'cached', 'utf-8')
    const s = await localFs.stat(p)
    const h1 = await contentHash(localFs, p, { mtimeMs: s.mtimeMs, size: s.size })

    // readFile 호출 여부 검증: 파일 자체를 삭제해도 캐시 hit 이면 성공해야 한다.
    fs.unlinkSync(p)
    const h2 = await contentHash(localFs, p, { mtimeMs: s.mtimeMs, size: s.size })
    expect(h2).toBe(h1)
  })

  it('2MB 초과 파일 → FILE_TOO_LARGE 전파', async () => {
    const p = path.join(tmp, 'huge.md')
    fs.writeFileSync(p, Buffer.alloc(3 * 1024 * 1024, 'x'))
    const s = await localFs.stat(p)
    await expect(
      contentHash(localFs, p, { mtimeMs: s.mtimeMs, size: s.size })
    ).rejects.toThrow('FILE_TOO_LARGE')
  })

  it('invalidate 후 재계산 — 같은 키여도 cache miss', async () => {
    const p = path.join(tmp, 'd.md')
    fs.writeFileSync(p, 'before', 'utf-8')
    const s = await localFs.stat(p)
    const h1 = await contentHash(localFs, p, { mtimeMs: s.mtimeMs, size: s.size })
    expect(hashCacheSize()).toBeGreaterThan(0)

    invalidateHash(p)
    // 파일을 새로 써서 내용이 달라졌지만 mtime/size 는 현재 호출자가 넘기는 값을 쓰므로
    // 여기선 캐시 miss 만 증명하면 된다 — 삭제 후 호출 시 readFile 이 실패한다면 invalidate 동작 증명.
    fs.unlinkSync(p)
    await expect(
      contentHash(localFs, p, { mtimeMs: s.mtimeMs, size: s.size })
    ).rejects.toThrow()
    // 위 throw 는 readFile(existent check)가 실패한 것 — invalidate 가 제대로 캐시를 지웠다는 증거
    void h1
  })
})
