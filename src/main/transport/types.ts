// Transport abstraction — 설계서 docs/designs/remote-fs-transport.md §2.2 rev. M1 (2026-04-21)
//
// 로컬/원격 FS를 하나의 인터페이스 뒤로 추상화한다. M1에서는 LocalTransport만 구현.
// WatcherDriver/ExecDriver는 타입만 정의 (구현은 M4/M6).

import type { WorkspaceMode } from '../../preload/types'

export interface FileStat {
  path: string // POSIX 정규화
  size: number
  mtimeMs: number // best-effort, 1초 정밀도 가정
  isDirectory: boolean
  isSymlink: boolean // local only; SFTP는 항상 false
}

export interface ReadOptions {
  maxBytes?: number // 기본 2MB (FsDriver 구현에서 보장)
  encoding?: 'utf8' | 'binary'
}

export interface FsDriver {
  stat(absPath: string): Promise<FileStat>

  // rev. M1 — 기본 maxBytes 2MB. 초과 시 FILE_TOO_LARGE 에러로 Known Risk Hard 해소.
  readFile(absPath: string, opts?: ReadOptions): Promise<Buffer>

  readStream(absPath: string, opts?: ReadOptions): AsyncIterable<Uint8Array>
  access(absPath: string): Promise<boolean> // 존재 여부만 — throw 없음
}

export interface ScannerDriver {
  countDocs(root: string, patterns: string[], ignore: string[]): Promise<number>
  scanDocs(root: string, patterns: string[], ignore: string[]): AsyncIterable<FileStat>

  // rev. M1 — workspace container/single 감지. 루트가 프로젝트 마커 포함 → 'single',
  // 하위 디렉토리들에 마커 존재 → 'container'.
  detectWorkspaceMode(root: string): Promise<WorkspaceMode>
}

// M4 에서 구현. M1은 타입만.
export interface WatcherDriver {
  watch(roots: string[], opts: WatchOptions): WatchHandle
}

export interface WatchHandle {
  on(event: 'add' | 'change' | 'unlink', cb: (stat: FileStat) => void): void
  on(event: 'error', cb: (err: Error) => void): void
  close(): Promise<void>
}

export interface WatchOptions {
  ignored: (path: string) => boolean
  debounceMs: number // 로컬 150, 원격 2000 등 transport별 기본값
  pollIntervalMs?: number // 원격 폴링 간격 (옵션)
}

// M6 에서 구현. M1은 타입만.
export interface ExecDriver {
  run(cmd: string, args: string[], opts: ExecOptions): Promise<ExecResult>
}

export interface ExecOptions {
  cwd?: string
  env?: Record<string, string>
  timeout?: number
}

export interface ExecResult {
  code: number
  stdout: string
  stderr: string
}

export interface Transport {
  id: string // 'local' | 'ssh:<workspaceId>'
  kind: 'local' | 'ssh'
  fs: FsDriver
  scanner: ScannerDriver
  watcher?: WatcherDriver // M1은 undefined
  exec?: ExecDriver // M1은 undefined
  dispose(): Promise<void>
}

export const LOCAL_TRANSPORT_ID = 'local' as const
