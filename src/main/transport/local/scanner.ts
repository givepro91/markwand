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
          // stat 실패 = silent skip (의도적 설계 개선, M3 S0 Evaluator M-1).
          // 기존 services/scanner.scanDocs 는 stat 실패 시 Date.now() 를 mtime 으로 박아
          // Doc 을 계속 생성했으나, 실패 원인(race: 파일 삭제 중 / EMFILE / perm)에서 "가짜 mtime" 은
          // UI 상 정렬 왜곡 · drift 판정 오류로 이어짐. 다음 scan 시 파일이 회복되면 정상 수집되므로
          // 일시적 누락 > 가짜 Doc 생성이 안전한 트레이드오프. SSH Transport(M3)에서도 동일 원칙.
        }
      }
    })()
  },

  async detectWorkspaceMode(root: string): Promise<WorkspaceMode> {
    // scanner.ts의 기존 함수에 위임 — 외부 동작 변화 0.
    return localDetectWorkspaceMode(root)
  },
}
