// LocalFsDriver — 설계서 §2.2 rev. M1 FsDriver 구현.
// 기존 src/main/ipc/** 의 fs.promises.* 직접 호출을 이쪽으로 위임.

import fs from 'fs'
import type { FileStat, FsDriver, ReadOptions } from '../types'

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 // 2MB — FsDriver.readFile 계약 (Known Risk Hard 해소)

async function toFileStat(absPath: string, stat: fs.Stats): Promise<FileStat> {
  return {
    path: absPath,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    isDirectory: stat.isDirectory(),
    isSymlink: stat.isSymbolicLink(),
  }
}

export const localFs: FsDriver = {
  async stat(absPath: string): Promise<FileStat> {
    // lstat을 써야 isSymlink 판정이 가능하다. stat은 symlink를 따라가 false가 나온다.
    const st = await fs.promises.lstat(absPath)
    // 단, mtimeMs/size는 실 파일 기준이 필요한 케이스가 있다 — Markwand는 readonly라
    // symlink가 있어도 따라간 파일의 메타를 쓰는 게 합리적. 기존 로직(fs.promises.stat)과
    // 동일 시맨틱 유지를 위해 symlink면 한 번 더 stat.
    if (st.isSymbolicLink()) {
      try {
        const resolved = await fs.promises.stat(absPath)
        return {
          path: absPath,
          size: resolved.size,
          mtimeMs: resolved.mtimeMs,
          isDirectory: resolved.isDirectory(),
          isSymlink: true,
        }
      } catch {
        // dangling symlink — lstat 값 유지
      }
    }
    return toFileStat(absPath, st)
  },

  async readFile(absPath: string, opts?: ReadOptions): Promise<Buffer> {
    const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES
    // size-first 검증 — 대용량 파일 힙 소진 방지. Known Risk Hard 해소.
    const st = await fs.promises.stat(absPath)
    if (st.size > maxBytes) {
      throw new Error('FILE_TOO_LARGE')
    }
    return fs.promises.readFile(absPath)
  },

  readStream(absPath: string, opts?: ReadOptions): AsyncIterable<Uint8Array> {
    // Node ReadableStream은 AsyncIterable 구현체. 상한 검사는 호출자가 필요 시 별도 수행.
    // app:// 프로토콜 M5에서 사용 예정 — M1은 계약만 노출.
    const maxBytes = opts?.maxBytes
    const stream = fs.createReadStream(absPath)
    if (maxBytes !== undefined) {
      let read = 0
      return (async function* () {
        for await (const chunk of stream) {
          const buf = chunk as Buffer
          read += buf.length
          if (read > maxBytes) {
            stream.destroy()
            throw new Error('FILE_TOO_LARGE')
          }
          yield new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
        }
      })()
    }
    return (async function* () {
      for await (const chunk of stream) {
        const buf = chunk as Buffer
        yield new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
      }
    })()
  },

  async access(absPath: string): Promise<boolean> {
    try {
      await fs.promises.access(absPath)
      return true
    } catch {
      return false
    }
  },
}
