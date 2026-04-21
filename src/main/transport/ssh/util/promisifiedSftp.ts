// SFTP callback API → Promise 래퍼.
// ssh2 v1.17.0 는 공식 Promise API 를 제공하지 않고 util.promisify 를 쓰기에도
// fastGet 같은 step 콜백 패턴이 섞여 있어 얇은 수동 wrapper 가 안전하다.
// Plan §S1.2 (remote-fs-transport-m3-m4.md) — Explorer B 권고.

import type { FileEntry, SFTPWrapper, Stats } from 'ssh2'

export interface PromisifiedSftp {
  readdir: (path: string) => Promise<FileEntry[]>
  stat: (path: string) => Promise<Stats>
  lstat: (path: string) => Promise<Stats>
  readFile: (path: string) => Promise<Buffer>
  /**
   * createReadStream 은 Node Readable 그대로 노출 — app:// 스트리밍 / parseFrontmatter 의
   * for-await break 패턴과 호환. opts.start / opts.end 로 서버측 범위 요청 최적화
   * (Plan S1 DoD: S0 Evaluator M-2 반영 — parseFrontmatter 가 원격에서 전체 파일 전송 회피).
   */
  createReadStream: SFTPWrapper['createReadStream']
}

export function promisifySftp(sftp: SFTPWrapper): PromisifiedSftp {
  return {
    readdir: (p) =>
      new Promise((resolve, reject) => {
        sftp.readdir(p, (err, list) => {
          if (err) reject(err)
          else resolve(list as FileEntry[])
        })
      }),
    stat: (p) =>
      new Promise((resolve, reject) => {
        sftp.stat(p, (err, s) => {
          if (err) reject(err)
          else resolve(s)
        })
      }),
    lstat: (p) =>
      new Promise((resolve, reject) => {
        sftp.lstat(p, (err, s) => {
          if (err) reject(err)
          else resolve(s)
        })
      }),
    readFile: (p) =>
      new Promise((resolve, reject) => {
        sftp.readFile(p, (err, b) => {
          if (err) reject(err)
          else resolve(b as Buffer)
        })
      }),
    createReadStream: sftp.createReadStream.bind(sftp),
  }
}
