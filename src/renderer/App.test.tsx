/**
 * @vitest-environment jsdom
 *
 * Self-QA: all-project doc counting must stay scoped to the active workspace.
 * A slow SSH workspace saved before the local one should not be probed for each
 * local ProjectCard count.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { installApiMock } from './__test-utils__/apiMock'
import { renderWithProviders, waitFor } from './__test-utils__/render'
import { useAppStore } from './state/store'
import type { Project, Workspace } from '../preload/types'
import App from './App'

const ACTIVE_WS_ID = '11111111-1111-4111-8111-111111111111'
const SSH_WS_ID = 'ssh:aaaaaaaaaaaaaaaa'

const workspaces: Workspace[] = [
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
    root: '/Users/alice/workspace',
    mode: 'container',
    transport: { type: 'local' },
    addedAt: 2,
    lastOpened: null,
  },
]

const project: Project = {
  id: 'abcdef1234567890',
  workspaceId: ACTIVE_WS_ID,
  name: 'local-project',
  root: '/Users/alice/workspace/local-project',
  markers: ['README.md'],
  docCount: -1,
  lastModified: 1,
}

beforeEach(() => {
  useAppStore.setState({
    workspaces: [],
    activeWorkspaceId: null,
    activeProjectId: null,
    openProjectTabs: [],
    projectViewSessions: {},
    projects: [],
    projectsLoading: false,
    projectsError: null,
    docCountProgress: { done: 0, total: 0 },
    docs: [],
    docsByProject: new Map(),
    frontmatterIndex: { statuses: new Set(), sources: new Set() },
    viewMode: 'all',
    selectedDocPaths: new Set(),
    composerOnboardingSeen: true,
    cmdkHintSeen: true,
  })
})

describe('App — workspace-scoped doc counts', () => {
  it('passes activeWorkspaceId to project:get-doc-count', async () => {
    const api = installApiMock()
    const workspaceList = api.workspace.list as unknown as { mockResolvedValue: (value: Workspace[]) => void }
    const workspaceScan = api.workspace.scan as unknown as { mockResolvedValue: (value: Project[]) => void }
    const getDocCount = api.project.getDocCount as unknown as { mockResolvedValue: (value: number) => void }
    const prefsGet = api.prefs.get as unknown as {
      mockImplementation: (fn: (key: string) => Promise<unknown>) => void
    }
    workspaceList.mockResolvedValue(workspaces)
    workspaceScan.mockResolvedValue([project])
    getDocCount.mockResolvedValue(2)
    prefsGet.mockImplementation((key: string) => {
      if (key === 'activeWorkspaceId') return Promise.resolve(ACTIVE_WS_ID)
      if (key === 'viewMode') return Promise.resolve('all')
      if (key === 'openProjectTabs') return Promise.resolve([])
      if (key === 'projectViewSessions') return Promise.resolve({})
      return Promise.resolve(undefined)
    })

    renderWithProviders(<App />)

    await waitFor(() => expect(api.workspace.scan).toHaveBeenCalledWith(ACTIVE_WS_ID))
    await waitFor(() =>
      expect(api.project.getDocCount).toHaveBeenCalledWith(project.id, {
        workspaceId: ACTIVE_WS_ID,
      }),
    )
  })
})
