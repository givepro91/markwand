import fs from 'fs'
import { ipcMain } from 'electron'
import { z } from 'zod'
import { extractReferences } from '../../lib/drift/extractor'
import type { DriftReport, DriftStatus, VerifiedReference } from '../../lib/drift/types'
import { getStore } from '../services/store'
import { assertInWorkspace } from '../security/validators'

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
    const roots = store.get('workspaces').map((w) => w.root)
    assertInWorkspace(docPath, roots)
    assertInWorkspace(projectRoot, roots)

    const docStat = await fs.promises.stat(docPath)
    if (docStat.size > MAX_DRIFT_FILE_BYTES) {
      // 거대 파일은 drift 검증 스킵 — 빈 리포트로 응답해 UI는 ok 취급.
      return emptyReport(docPath, docStat.mtimeMs, projectRoot)
    }

    const content = await fs.promises.readFile(docPath, 'utf-8')
    const refs = extractReferences(content, projectRoot)
    const docMtime = docStat.mtimeMs

    const verified: VerifiedReference[] = await Promise.all(
      refs.map(async (ref): Promise<VerifiedReference> => {
        try {
          const targetStat = await fs.promises.stat(ref.resolvedPath)
          // 대상이 doc보다 최근 수정 = stale. 동일 시각은 ok 처리.
          const status: DriftStatus = targetStat.mtimeMs > docMtime ? 'stale' : 'ok'
          return { ...ref, status, targetMtime: targetStat.mtimeMs }
        } catch {
          return { ...ref, status: 'missing' }
        }
      })
    )

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
