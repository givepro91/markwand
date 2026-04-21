// Drift Content Hash — M2 보조 도입 (Plan §S2, U-M2-1 사용자 승인 2026-04-21).
//
// **스코프 축소**: hash 는 병행 계산해 VerifiedReference.hashAtCheck 에 기록만 한다.
// ok/stale 판정은 기존 mtime 기반 유지 — "본 시점 스냅샷" 영속 저장 설계가 있어야
// hash 기반 판정 전환이 등가를 얻기 때문 (v1.0 이후 별도 Plan).
//
// **알고리즘**: sha256 — Node 내장 crypto. NPM 추가 0, 50KB md 파일 0.5ms.
// **Cache 키**: (absPath, mtimeMs, size) — mtime 동일 + size 다를 때 강제 재해시.
// **Cache 저장소**: 인메모리 Map (main process 스코프, 세션 스코프).
//
// M3 SSH 전환 시 stat 도 동일 캐시로 통합 가능 — 현재는 stat 중복 허용 (로컬 stat < 1ms).

import { createHash } from 'node:crypto'
import type { FsDriver } from '../../main/transport/types'

interface CacheEntry {
  mtimeMs: number
  size: number
  hash: string
}

const cache = new Map<string, CacheEntry>()

const HASH_MAX_BYTES = 2 * 1024 * 1024 // FsDriver 기본과 동일 — 2MB 초과 파일은 drift 검증 자체가 스킵

/**
 * 파일 content 의 sha256 hex 를 반환한다.
 *
 * @param fs   transport 의 FsDriver (LocalFsDriver 혹은 M3 SshFsDriver)
 * @param absPath 절대 경로 (POSIX 또는 native — transport 가 책임)
 * @param stat 이미 조회한 (mtimeMs, size). 같은 키면 readFile 스킵.
 *
 * @throws FILE_TOO_LARGE (2MB 초과 시 — FsDriver.readFile 계약 위임)
 */
export async function contentHash(
  fs: FsDriver,
  absPath: string,
  stat: { mtimeMs: number; size: number }
): Promise<string> {
  const cached = cache.get(absPath)
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.hash
  }
  const buf = await fs.readFile(absPath, { maxBytes: HASH_MAX_BYTES })
  const hash = createHash('sha256').update(buf).digest('hex')
  cache.set(absPath, { mtimeMs: stat.mtimeMs, size: stat.size, hash })
  return hash
}

/** 파일이 변경됐음을 알 때 명시 무효화 — M4 watcher 이벤트에서 사용 예정. */
export function invalidateHash(absPath: string): void {
  cache.delete(absPath)
}

/** 전체 캐시 비우기 (테스트 용). */
export function clearHashCache(): void {
  cache.clear()
}

/** 진단용 — 캐시 엔트리 수. */
export function hashCacheSize(): number {
  return cache.size
}
