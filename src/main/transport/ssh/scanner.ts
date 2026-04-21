// SshScannerDriver — ScannerDriver 의 SFTP 구현.
// Plan §S1.2 — SFTP readdir attrs 재활용으로 per-entry stat 재호출 회피 (RTT 50ms × 10k ≈ 500ms 목표).
//
// 구현 전략:
//   - walk(dir): readdir → (디렉토리는 재귀 / 파일은 패턴 매치 후 yield FileStat)
//   - readdir 의 `entry.attrs` 가 mode/size/mtime 포함 → stat 재호출 불필요
//   - attrs.mtime > 0 검증 (Critic M-2 폴백 — 일부 SFTP 구현에서 0 반환 가능)
//   - picomatch 로 glob 매칭 (fast-glob 은 stream 기반이라 원격엔 부적합)

import picomatch from 'picomatch'
import posix from 'node:path/posix'
import type { ScannerDriver, FileStat } from '../types'
import type { WorkspaceMode } from '../../../preload/types'
import type { SshClient } from './client'

const PROJECT_MARKERS = [
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'CLAUDE.md',
  '.git',
  'README.md',
  'Makefile',
]

// readdir 결과의 엔트리를 컨테이너 스캔에서 건너뛸 디렉토리 이름 (로컬 PROJECT_SCAN_IGNORE 미러)
const PROJECT_SCAN_IGNORE = new Set([
  'node_modules', 'dist', 'build', 'out', 'target', 'vendor', 'coverage',
  '__pycache__', '__fixtures__', '__snapshots__',
  '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache', '.venv',
])

// SFTP attrs.mode 의 type bits — POSIX `man 2 stat` 의 S_IFMT.
const S_IFMT = 0o170000
const S_IFDIR = 0o040000
const S_IFLNK = 0o120000

function isDirFromMode(mode: number): boolean {
  return (mode & S_IFMT) === S_IFDIR
}

function isSymlinkFromMode(mode: number): boolean {
  return (mode & S_IFMT) === S_IFLNK
}

export function createSshScannerDriver(client: SshClient): ScannerDriver {
  return {
    async countDocs(root: string, patterns: string[], ignore: string[]): Promise<number> {
      let count = 0
      for await (const _ of scanDocsImpl(client, root, patterns, ignore)) {
        count++
      }
      return count
    },

    scanDocs(root: string, patterns: string[], ignore: string[]): AsyncIterable<FileStat> {
      return scanDocsImpl(client, root, patterns, ignore)
    },

    async detectWorkspaceMode(root: string): Promise<WorkspaceMode> {
      const sftp = client.getSftp()
      let entries
      try {
        entries = await sftp.readdir(root)
      } catch {
        return 'single'
      }
      // 하위 디렉토리에 프로젝트 마커가 있으면 'container'
      for (const entry of entries) {
        const name = entry.filename
        if (PROJECT_SCAN_IGNORE.has(name)) continue
        if (name.startsWith('.')) continue
        if (!isDirFromMode(entry.attrs.mode)) continue

        const childPath = posix.join(root, name)
        try {
          const childEntries = await sftp.readdir(childPath)
          const names = new Set(childEntries.map((e) => e.filename))
          if (PROJECT_MARKERS.some((m) => names.has(m))) {
            return 'container'
          }
        } catch {
          // 권한 없는 하위는 스킵
        }
      }
      return 'single'
    },
  }
}

async function* scanDocsImpl(
  client: SshClient,
  root: string,
  patterns: string[],
  ignore: string[],
): AsyncGenerator<FileStat> {
  // picomatch 는 다중 패턴 union 을 제공 — 단일 matcher 로 합성.
  const patternMatch = picomatch(patterns, { dot: true, nocase: true })
  const ignoreMatch = picomatch(ignore, { dot: true, nocase: true })

  const sftp = client.getSftp()
  const rootPosix = toPosix(root)

  async function* walk(dir: string): AsyncGenerator<FileStat> {
    let entries
    try {
      entries = await sftp.readdir(dir)
    } catch {
      // 권한 거부·경로 부재 silent skip (LocalScannerDriver 와 동일 정책)
      return
    }
    for (const entry of entries) {
      const full = posix.join(dir, entry.filename)
      // ignore 매칭은 절대 경로 기준으로 판정 — `**/node_modules/**` 패턴이 작동하도록.
      if (ignoreMatch(full)) continue
      // 엔트리 basename 이 디렉토리 블랙리스트에 있으면 재귀 진입 금지.
      if (isDirFromMode(entry.attrs.mode)) {
        if (PROJECT_SCAN_IGNORE.has(entry.filename)) continue
        yield* walk(full)
        continue
      }
      if (isSymlinkFromMode(entry.attrs.mode)) continue // v1.0 symlink 미지원 (Design §3.6)
      if (!patternMatch(full)) continue
      yield {
        path: full,
        size: entry.attrs.size,
        // SFTP v3 attrs.mtime 은 epoch seconds. 0 이면 -1 (무효 마커 — Critic M-2 폴백)
        mtimeMs: entry.attrs.mtime > 0 ? entry.attrs.mtime * 1000 : -1,
        isDirectory: false,
        isSymlink: false,
      }
    }
  }

  yield* walk(rootPosix)
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}
