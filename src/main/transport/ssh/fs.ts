// SshFsDriver — FsDriver 의 SSH/SFTP 구현.
// Plan §S1.2 (remote-fs-transport-m3-m4.md).
//
// 계약:
//   - readFile: size-first + maxBytes 2MB 기본, 초과 시 FILE_TOO_LARGE (LocalFsDriver 와 동일)
//   - readStream: opts.maxBytes 가 있으면 sftp.createReadStream({start:0, end:maxBytes-1})
//     로 서버측 범위 요청 (S0 Evaluator M-2 최적화 — parseFrontmatter 에서 4KB 만 전송)
//   - isSymlink: 항상 false (Design §3.6 — SFTP symlink 는 v1.0 에서 일반 파일로 취급)

import type { FsDriver, FileStat, ReadOptions } from '../types'
import type { SshClient } from './client'

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024

export function createSshFsDriver(client: SshClient): FsDriver {
  return {
    async stat(absPath: string): Promise<FileStat> {
      const sftp = client.getSftp()
      const st = await sftp.stat(absPath)
      return {
        path: absPath,
        size: st.size,
        // SFTP v3: mtime 은 epoch seconds (32-bit). Critic M-2: 일부 구현에서 0 반환 가능.
        mtimeMs: st.mtime > 0 ? st.mtime * 1000 : -1,
        isDirectory: st.isDirectory(),
        isSymlink: false,
      }
    },

    async readFile(absPath: string, opts?: ReadOptions): Promise<Buffer> {
      const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES
      const sftp = client.getSftp()
      // size-first: stat 먼저 — maxBytes 초과 파일은 전송 전에 차단.
      const st = await sftp.stat(absPath)
      if (st.size > maxBytes) throw new Error('FILE_TOO_LARGE')
      return sftp.readFile(absPath)
    },

    readStream(absPath: string, opts?: ReadOptions): AsyncIterable<Uint8Array> {
      const sftp = client.getSftp()
      const maxBytes = opts?.maxBytes
      // 서버측 범위 요청 최적화 (S0 Evaluator M-2).
      // maxBytes 미지정/0 → 전체 파일 stream. maxBytes>0 → [0, maxBytes-1] bytes 만 요청.
      // maxBytes=0 가드 — ssh2 SFTP.js checkPosition 이 end:-1 에 ERR_OUT_OF_RANGE throw
      // (S1 Evaluator M-2). 0 은 API 계약상 유효 입력이지만 실용적으로 "전체 stream 과 동등" 처리.
      const streamOpts =
        maxBytes !== undefined && maxBytes > 0
          ? { start: 0, end: maxBytes - 1 }
          : undefined
      const stream = sftp.createReadStream(absPath, streamOpts)
      return (async function* () {
        for await (const chunk of stream) {
          const buf = chunk as Buffer
          yield new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
        }
      })()
    },

    async access(absPath: string): Promise<boolean> {
      try {
        const sftp = client.getSftp()
        await sftp.stat(absPath)
        return true
      } catch {
        return false
      }
    },
  }
}
