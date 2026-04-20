import path from 'path'
import { net, protocol } from 'electron'
import { pathToFileURL } from 'url'
import { assertInWorkspace } from './validators'

const ALLOWED_EXTENSIONS = new Set(['.md', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'])

let workspaceRoots: string[] = []

export function setProtocolWorkspaceRoots(roots: string[]): void {
  workspaceRoots = roots
}

export function registerAppProtocol(): void {
  // app:// 핸들러 — normalize → resolve → assertInWorkspace 3단 검증
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url)
      const decoded = decodeURIComponent(url.pathname)
      const normalized = path.normalize(decoded)
      const resolved = path.resolve(normalized)

      assertInWorkspace(resolved, workspaceRoots)

      const ext = path.extname(resolved).toLowerCase()
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return new Response(null, { status: 403, statusText: 'Forbidden extension' })
      }

      return net.fetch(pathToFileURL(resolved).toString())
    } catch {
      return new Response(null, { status: 403, statusText: 'Forbidden' })
    }
  })
}
