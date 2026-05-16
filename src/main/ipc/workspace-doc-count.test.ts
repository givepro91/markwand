import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createHash } from 'crypto'
import type { Workspace } from '../../preload/types'

const mocked = vi.hoisted(() => ({
  workspaces: [] as Workspace[],
  touchedWorkspaceIds: [] as string[],
}))

vi.mock('../services/store', () => ({
  getStore: vi.fn(async () => ({
    get: (key: string) => {
      if (key === 'workspaces') return mocked.workspaces
      return undefined
    },
  })),
}))

vi.mock('../transport/resolve', async () => {
  const local = await vi.importActual<typeof import('../transport/local')>('../transport/local')
  return {
    getActiveTransport: vi.fn(async (workspaceId: string) => {
      mocked.touchedWorkspaceIds.push(workspaceId)
      if (workspaceId.startsWith('ssh:')) {
        throw new Error('UNRELATED_SSH_WORKSPACE_TOUCHED')
      }
      return local.localTransport
    }),
  }
})

import { getDocCountForProject } from './workspace'

const ACTIVE_WS_ID = '11111111-1111-4111-8111-111111111111'
const SSH_WS_ID = 'ssh:aaaaaaaaaaaaaaaa'

let tmpRoot = ''

function makeProjectId(root: string): string {
  return createHash('sha1').update(root).digest('hex').slice(0, 16)
}

function writeFile(relPath: string, content: string): void {
  const full = path.join(tmpRoot, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf8')
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'markwand-doc-count-ws-'))
  mocked.touchedWorkspaceIds = []
  mocked.workspaces = [
    {
      id: SSH_WS_ID,
      name: 'slow-ssh',
      root: '/home/ubuntu/projects',
      mode: 'single',
      transport: {
        type: 'ssh',
        host: 'example.invalid',
        port: 22,
        user: 'ubuntu',
        auth: { kind: 'agent' },
      },
      addedAt: 1,
      lastOpened: null,
    },
    {
      id: ACTIVE_WS_ID,
      name: 'local',
      root: tmpRoot,
      mode: 'container',
      transport: { type: 'local' },
      addedAt: 2,
      lastOpened: null,
    },
  ]
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('getDocCountForProject', () => {
  it('uses the supplied workspaceId instead of probing earlier unrelated workspaces', async () => {
    writeFile('proj/README.md', '# readme')
    writeFile('proj/docs/note.md', '# note')
    writeFile('proj/node_modules/pkg/ignored.md', '# ignored')
    writeFile('other/README.md', '# other')
    const projectId = makeProjectId(path.join(tmpRoot, 'proj'))

    const count = await getDocCountForProject(projectId, { workspaceId: ACTIVE_WS_ID })

    expect(count).toBe(2)
    expect(mocked.touchedWorkspaceIds).toEqual([ACTIVE_WS_ID])
  })
})
