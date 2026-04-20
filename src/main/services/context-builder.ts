import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { app } from 'electron'
import { assertInWorkspace } from '../security/validators'

// TTL: 사용자가 Claude 창을 열어두고 자리 비우는 시나리오 방어. 10분.
const CONTEXT_TTL_MS = 600_000
// 기동 시 선제 삭제 기준 (지난 실행 잔해)
const BOOT_CLEANUP_AGE_MS = 60 * 60_000

function getContextDir(): string {
  return path.join(app.getPath('userData'), 'context')
}

async function ensureContextDir(): Promise<string> {
  const dir = getContextDir()
  await fs.promises.mkdir(dir, { recursive: true })
  return dir
}

/**
 * 선택된 .md 파일들을 하나의 임시 markdown 파일로 concat한다.
 * 각 파일은 "# <workspace-relative-path>\n\n<content>" 블록으로 구분된다.
 * 반환된 경로는 AppleScript의 CONTEXT_FILE env에 넣어 Claude/Codex에 `@<path>` 또는 stdin으로 전달.
 *
 * @param paths 절대 경로 1~200개
 * @param workspaceRoots 경로 검증 + 상대 경로 계산용
 * @returns 임시 파일 절대 경로
 */
export async function buildContextFile(
  paths: string[],
  workspaceRoots: string[]
): Promise<string> {
  if (paths.length === 0) throw new Error('NO_PATHS')

  for (const p of paths) {
    assertInWorkspace(p, workspaceRoots)
  }

  const dir = await ensureContextDir()
  const filename = `ctx-${randomUUID()}.md`
  const outPath = path.join(dir, filename)

  const header = `<!-- markwand composer context — generated ${new Date().toISOString()} — ${paths.length} files -->\n\n`
  const blocks: string[] = [header]

  for (const absPath of paths) {
    const relPath = computeRelPath(absPath, workspaceRoots)
    let body: string
    try {
      body = await fs.promises.readFile(absPath, 'utf-8')
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      body = `<!-- READ FAILED: ${reason} -->`
    }
    blocks.push(`---\n\n# ${relPath}\n\n${body}\n\n`)
  }

  await fs.promises.writeFile(outPath, blocks.join(''), { mode: 0o600 })
  scheduleUnlink(outPath, CONTEXT_TTL_MS)
  return outPath
}

function computeRelPath(absPath: string, workspaceRoots: string[]): string {
  const resolved = path.resolve(absPath)
  for (const root of workspaceRoots) {
    const resolvedRoot = path.resolve(root)
    if (resolved.startsWith(resolvedRoot + path.sep)) {
      return path.relative(resolvedRoot, resolved)
    }
  }
  return path.basename(absPath)
}

function scheduleUnlink(absPath: string, ttlMs: number): void {
  setTimeout(() => {
    fs.promises.unlink(absPath).catch(() => {
      // 이미 삭제됐거나 접근 불가. 무시.
    })
  }, ttlMs).unref?.()
}

/**
 * 앱 기동 시 호출. <userData>/context/ 디렉토리에서 1시간 이상 묵은 .md 파일을
 * 선제 삭제한다. 지난 실행의 크래시 잔해 정리용.
 */
export async function cleanupOldContextFiles(): Promise<void> {
  const dir = getContextDir()
  let entries: string[]
  try {
    entries = await fs.promises.readdir(dir)
  } catch {
    return // dir 없으면 스킵
  }
  const now = Date.now()
  for (const name of entries) {
    if (!name.startsWith('ctx-') || !name.endsWith('.md')) continue
    const p = path.join(dir, name)
    try {
      const stat = await fs.promises.stat(p)
      if (now - stat.mtimeMs > BOOT_CLEANUP_AGE_MS) {
        await fs.promises.unlink(p)
      }
    } catch {
      // 무시
    }
  }
}

/**
 * 앱 종료 전 호출. context 디렉토리의 모든 .md를 동기 삭제. 앱 생명주기 훅.
 */
export function cleanupAllContextFilesSync(): void {
  const dir = getContextDir()
  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (!name.startsWith('ctx-') || !name.endsWith('.md')) continue
    try {
      fs.rmSync(path.join(dir, name), { force: true })
    } catch {
      // 무시
    }
  }
}
