// LocalScannerDriver — 설계서 §2.2 rev. M1 ScannerDriver 구현.
//
// 저수준 프리미티브를 제공한다 (FileStat 스트림). Markwand의 Doc composition·frontmatter
// 파싱은 서비스 레이어(services/scanner.ts)가 계속 담당한다. Transport 경계는
// "파일 열거 + 메타 수집"까지만.

import fs from 'fs'
import fg from 'fast-glob'
import { detectWorkspaceMode as localDetectWorkspaceMode } from '../../services/scanner'
import type { FileStat, ScannerDriver } from '../types'
import type { WorkspaceMode } from '../../../preload/types'

export const localScanner: ScannerDriver = {
  async countDocs(root: string, patterns: string[], ignore: string[]): Promise<number> {
    const stream = fg.stream(patterns, {
      cwd: root,
      ignore,
      onlyFiles: true,
      followSymbolicLinks: false,
      suppressErrors: true,
      dot: true,
      caseSensitiveMatch: false,
    })
    let count = 0
    for await (const _ of stream) count++
    return count
  },

  scanDocs(root: string, patterns: string[], ignore: string[]): AsyncIterable<FileStat> {
    // fast-glob + stat per file. 원격 transport(M3)에서는 내부 구현이 SFTP readdir이 될 것.
    return (async function* () {
      const stream = fg.stream(patterns, {
        cwd: root,
        ignore,
        absolute: true,
        onlyFiles: true,
        followSymbolicLinks: false,
        suppressErrors: true,
        dot: true,
        caseSensitiveMatch: false,
      })
      for await (const entry of stream) {
        const absPath = entry as string
        try {
          const st = await fs.promises.stat(absPath)
          yield {
            path: absPath,
            size: st.size,
            mtimeMs: st.mtimeMs,
            isDirectory: st.isDirectory(),
            isSymlink: st.isSymbolicLink(),
          }
        } catch {
          // stat 실패는 silent skip — 기존 scanner.scanDocs 동작과 동일 시맨틱 유지를 위해
          // mtime fallback(Date.now())가 아닌 "없던 셈" 처리. 호출자(IPC)가 fallback 담당.
        }
      }
    })()
  },

  async detectWorkspaceMode(root: string): Promise<WorkspaceMode> {
    // scanner.ts의 기존 함수에 위임 — 외부 동작 변화 0.
    return localDetectWorkspaceMode(root)
  },
}
