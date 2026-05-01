import { ipcMain } from 'electron'
import { z } from 'zod'
import { extractReferences } from '../../lib/drift/extractor'
import type { DriftReport, DriftStatus, Reference, VerifiedReference } from '../../lib/drift/types'
import { contentHash } from '../../lib/drift/hash'
import { getStore } from '../services/store'
import { assertInWorkspace } from '../security/validators'
import { classifyAsset } from '../../lib/viewable'
import { resolveTransportForPath } from './fs'

// extract + stat 을 메인 스레드에서 수행하므로 상한 필수.
// 2MB 초과 시 다수의 AI 산출물(보통 수십 KB)이 아닌 비정상 파일로 간주.
const MAX_DRIFT_FILE_BYTES = 2 * 1024 * 1024

const VerifyInputSchema = z.object({
  docPath: z.string().min(1).max(512),
  projectRoot: z.string().min(1).max(512),
})

function parseVerifyInput(raw: unknown): { docPath: string; projectRoot: string } {
  return VerifyInputSchema.parse(raw)
}

function emptyReport(docPath: string, docMtime: number, projectRoot: string): DriftReport {
  return {
    docPath,
    docMtime,
    projectRoot,
    references: [],
    counts: { ok: 0, missing: 0, stale: 0 },
    verifiedAt: Date.now(),
  }
}

export function registerDriftHandlers(): void {
  ipcMain.handle('drift:verify', async (_event, raw: unknown): Promise<DriftReport> => {
    const { docPath, projectRoot } = parseVerifyInput(raw)

    const store = await getStore()
    const workspaces = store.get('workspaces')

    // 2026-04-25 — SSH 워크스페이스 ENOENT 도배 fix. 기존엔 localTransport 하드코딩으로
    // SSH 경로를 로컬 fs.lstat 호출 → ENOENT throw → IPC 핸들러 에러 반복 출력.
    // fs:read-doc 와 동일하게 resolveTransportForPath 로 transport 역매핑.
    const resolved = await resolveTransportForPath(docPath, workspaces)
    if (!resolved) throw new Error('PATH_OUT_OF_WORKSPACE')
    const { transport, ws } = resolved
    const isSsh = ws.transport?.type === 'ssh'

    assertInWorkspace(docPath, [ws.root], { posix: isSsh })
    assertInWorkspace(projectRoot, [ws.root], { posix: isSsh })

    const docStat = await transport.fs.stat(docPath)
    if (docStat.size > MAX_DRIFT_FILE_BYTES) {
      // 거대 파일은 drift 검증 스킵 — 빈 리포트로 응답해 UI는 ok 취급.
      return emptyReport(docPath, docStat.mtimeMs, projectRoot)
    }

    // md만 참조 추출. 이미지 등 바이너리를 utf-8로 읽으면 regex가 쓰레기 content에서
    // false-positive 참조를 대량 생성한다. viewable 자산 범위에서 md가 아니면 빈 리포트.
    if (classifyAsset(docPath) !== 'md') {
      return emptyReport(docPath, docStat.mtimeMs, projectRoot)
    }

    // Transport 위임 — readFile 이 maxBytes(기본 2MB) 자체 방어.
    const buf = await transport.fs.readFile(docPath, { maxBytes: MAX_DRIFT_FILE_BYTES })
    const content = buf.toString('utf-8')
    // docPath 전달: inline/hint 는 문서 디렉토리 기준으로 상대 경로를 resolve 한다.
    const refs = extractReferences(content, projectRoot, docPath)
    const docMtime = docStat.mtimeMs

    // Known Limitations (v1):
    //  - FAT32/일부 macOS HFS+ 는 mtime 정밀도가 1초 — 동일 초 내 저장 시 ok 오판 가능.
    //  - `git checkout` 은 파일 mtime을 체크아웃 시각으로 갱신 → stale 오판. content hash 기반 판정은 v2.
    //  - 디렉토리는 내부 파일 추가·삭제마다 mtime 이 갱신되므로 stale 판정 제외 (존재=ok, 없음=missing 만).
    // primary resolvedPath 를 먼저 시도, 실패 시 fallbackPath 시도. 둘 다 실패하면 missing.
    // resolvedPath 를 실제 선택된 경로로 덮어써서 UI "Finder 열기" 가 정확한 파일을 가리키도록.
    async function statWithFallback(
      ref: Reference
    ): Promise<{ path: string; mtimeMs: number; size: number; isDirectory: boolean } | null> {
      try {
        const s = await transport.fs.stat(ref.resolvedPath)
        return { path: ref.resolvedPath, mtimeMs: s.mtimeMs, size: s.size, isDirectory: s.isDirectory }
      } catch {}
      if (ref.fallbackPath) {
        try {
          const s = await transport.fs.stat(ref.fallbackPath)
          return { path: ref.fallbackPath, mtimeMs: s.mtimeMs, size: s.size, isDirectory: s.isDirectory }
        } catch {}
      }
      return null
    }

    const maybeVerified: Array<VerifiedReference | null> = await Promise.all(
      refs.map(async (ref): Promise<VerifiedReference | null> => {
        const hit = await statWithFallback(ref)
        if (!hit) {
          if (ref.reportMissing === false) return null
          return { ...ref, status: 'missing' }
        }
        const status: DriftStatus = hit.isDirectory
          ? 'ok'
          : hit.mtimeMs > docMtime
            ? 'stale'
            : 'ok'

        // M2 hash 보조 계산 — 판정에는 사용하지 않음 (U-M2-1 사용자 승인 scope). 감사/디버깅용.
        // 디렉토리·크기 초과·읽기 실패는 silent undefined fallback (DriftReport 안정성 우선).
        let hashAtCheck: string | undefined
        if (!hit.isDirectory && hit.size <= MAX_DRIFT_FILE_BYTES) {
          try {
            hashAtCheck = await contentHash(transport.fs, hit.path, {
              mtimeMs: hit.mtimeMs,
              size: hit.size,
            })
          } catch {
            // IO 실패는 hashAtCheck undefined. 판정에 영향 없음.
          }
        }

        return {
          ...ref,
          resolvedPath: hit.path,
          status,
          targetMtime: hit.mtimeMs,
          isDirectory: hit.isDirectory,
          ...(hashAtCheck !== undefined ? { hashAtCheck } : {}),
        }
      })
    )
    const verified = maybeVerified.filter((ref): ref is VerifiedReference => ref != null)

    const counts = verified.reduce(
      (acc, v) => {
        acc[v.status]++
        return acc
      },
      { ok: 0, missing: 0, stale: 0 }
    )

    return {
      docPath,
      docMtime,
      projectRoot,
      references: verified,
      counts,
      verifiedAt: Date.now(),
    }
  })
}
