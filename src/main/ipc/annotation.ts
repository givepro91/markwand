import { ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { getStore } from '../services/store'
import {
  parseAnnotationLoadInput,
  parseAnnotationSaveInput,
  assertInWorkspace,
  AnnotationFileSchema,
} from '../security/validators'
import { classifyAsset } from '../../lib/viewable'
import { resolveTransportForPath } from './fs'

const MAX_ANNO_BYTES = 2 * 1024 * 1024
const ANNO_SUFFIX = '.anno.json'

// v0.4 S7 — sidecar 파일명. `<docPath>.anno.json` (예: /foo/bar.md.anno.json).
// docPath 는 반드시 workspace 경계 내부여야 한다 (assertInWorkspace).
export function sidecarPathFor(docPath: string): string {
  return docPath + ANNO_SUFFIX
}

type AnnotationFile = z.infer<typeof AnnotationFileSchema>

export function registerAnnotationHandlers(): void {
  ipcMain.handle(
    'annotation:load',
    async (_event, raw: unknown): Promise<AnnotationFile | null> => {
      const { path: docPath } = parseAnnotationLoadInput(raw)

      const store = await getStore()
      const workspaces = store.get('workspaces')
      const resolved = await resolveTransportForPath(docPath, workspaces)
      if (!resolved) throw new Error('PATH_OUT_OF_WORKSPACE')
      const { ws } = resolved

      if (ws.transport?.type !== 'local') throw new Error('ANNOTATION_SSH_UNSUPPORTED')
      assertInWorkspace(docPath, [ws.root])

      if (classifyAsset(docPath) !== 'md') throw new Error('NOT_A_TEXT_DOC')

      const sidecar = sidecarPathFor(docPath)
      try {
        const stat = await fs.stat(sidecar)
        if (stat.size > MAX_ANNO_BYTES) throw new Error('ANNOTATION_FILE_TOO_LARGE')
        const buf = await fs.readFile(sidecar)
        // TOCTOU 가드 — stat→read 사이 파일이 커진 경우 read 결과 길이로 재검증.
        if (buf.length > MAX_ANNO_BYTES) throw new Error('ANNOTATION_FILE_TOO_LARGE')
        const parsed = JSON.parse(buf.toString('utf-8'))
        return AnnotationFileSchema.parse(parsed)
      } catch (err) {
        const e = err as NodeJS.ErrnoException
        if (e.code === 'ENOENT') return null
        throw err
      }
    }
  )

  ipcMain.handle(
    'annotation:save',
    async (_event, raw: unknown): Promise<void> => {
      const { path: docPath, data } = parseAnnotationSaveInput(raw)

      const store = await getStore()
      const workspaces = store.get('workspaces')
      const resolved = await resolveTransportForPath(docPath, workspaces)
      if (!resolved) throw new Error('PATH_OUT_OF_WORKSPACE')
      const { ws } = resolved

      if (ws.transport?.type !== 'local') throw new Error('ANNOTATION_SSH_UNSUPPORTED')
      assertInWorkspace(docPath, [ws.root])

      if (classifyAsset(docPath) !== 'md') throw new Error('NOT_A_TEXT_DOC')

      const sidecar = sidecarPathFor(docPath)
      const body = JSON.stringify(data)
      const bytes = Buffer.byteLength(body, 'utf-8')
      if (bytes > MAX_ANNO_BYTES) throw new Error('ANNOTATION_FILE_TOO_LARGE')

      // 빈 배열이면 sidecar 삭제 (깔끔한 상태 유지).
      if (data.annotations.length === 0) {
        try {
          await fs.unlink(sidecar)
        } catch (err) {
          const e = err as NodeJS.ErrnoException
          if (e.code !== 'ENOENT') throw err
        }
        return
      }

      // atomic write: tmp → rename.
      const tmp = sidecar + '.tmp'
      await fs.mkdir(path.dirname(sidecar), { recursive: true })
      await fs.writeFile(tmp, body, 'utf-8')
      await fs.rename(tmp, sidecar)
    }
  )
}
