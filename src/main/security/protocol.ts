import path from 'path'
import { net, protocol } from 'electron'
import { pathToFileURL } from 'url'
import { assertInWorkspace } from './validators'

const ALLOWED_EXTENSIONS = new Set(['.md', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'])

let workspaceRoots: string[] = []

export function setProtocolWorkspaceRoots(roots: string[]): void {
  workspaceRoots = roots
}

// URL 형식 계약:
//   app://local/<absolute-posix-path>
// host는 고정 문자열 `local`(무의미 placeholder). 렌더러가 절대 경로의 path 세그먼트를
// host 자리에 넣으면 Chromium이 host를 소문자로 정규화하면서 대소문자가 바뀐 경로로
// 파일 시스템 비교가 깨진다 (예: /Users/... → /users/... — APFS는 통과해도
// `startsWith` 비교가 실패해 PATH_OUT_OF_WORKSPACE).
// host는 읽지 않는다. pathname 만 사용해야 case 보존.
const EXPECTED_HOST = 'local'

export function registerAppProtocol(): void {
  // app:// 핸들러 — normalize → resolve → assertInWorkspace 3단 검증
  protocol.handle('app', async (request) => {
    let resolved = ''
    try {
      const url = new URL(request.url)
      if (url.host !== EXPECTED_HOST) {
        // 예전 형식(app://<path>) 호환을 위해 host가 비어있을 때만 pathname만 그대로 수용.
        // 그 외 host는 잘못된 호출로 거부 (path를 host에 넣지 말 것).
        if (url.host !== '') {
          process.stderr.write(`[app-protocol] 400 UNEXPECTED_HOST host=${url.host} url=${request.url}\n`)
          return new Response(null, { status: 400, statusText: 'UNEXPECTED_HOST' })
        }
      }
      const decoded = decodeURIComponent(url.pathname)
      const normalized = path.normalize(decoded)
      resolved = path.resolve(normalized)

      try {
        assertInWorkspace(resolved, workspaceRoots)
      } catch {
        process.stderr.write(
          `[app-protocol] 403 PATH_OUT_OF_WORKSPACE url=${request.url} resolved=${resolved} roots=${JSON.stringify(workspaceRoots)}\n`
        )
        return new Response(null, { status: 403, statusText: 'PATH_OUT_OF_WORKSPACE' })
      }

      const ext = path.extname(resolved).toLowerCase()
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        process.stderr.write(`[app-protocol] 403 FORBIDDEN_EXT ext=${ext} resolved=${resolved}\n`)
        return new Response(null, { status: 403, statusText: 'FORBIDDEN_EXT' })
      }

      const fileUrl = pathToFileURL(resolved).toString()
      const res = await net.fetch(fileUrl)
      if (!res.ok) {
        process.stderr.write(`[app-protocol] upstream ${res.status} ${res.statusText} resolved=${resolved}\n`)
      }
      return res
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(
        `[app-protocol] 500 HANDLER_EXCEPTION url=${request.url} resolved=${resolved} err=${msg}\n`
      )
      return new Response(null, { status: 500, statusText: 'HANDLER_EXCEPTION' })
    }
  })
}
