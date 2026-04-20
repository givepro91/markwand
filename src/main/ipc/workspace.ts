import { dialog, ipcMain, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import path from 'path'
import { getStore } from '../services/store'
import { scanProjects, scanDocs, countDocs } from '../services/scanner'
import { setProtocolWorkspaceRoots } from '../security/protocol'
import {
  parseScanInput,
  parseScanDocsInput,
  parseWorkspaceRemoveInput,
} from '../security/validators'
import type { Workspace, Project } from '../../preload/types'

function getWorkspaceRoots(workspaces: Workspace[]): string[] {
  return workspaces.map((w) => w.root)
}

// scanProjects 결과 캐시 + in-flight 중복 방지.
// renderer의 여러 뷰가 동시에 workspace.scan / project.scan-docs를 호출해도
// 같은 워크스페이스에 대한 scanProjects는 한 번만 실제 실행된다.
const projectsCache = new Map<string, Project[]>()
const inflightScans = new Map<string, Promise<Project[]>>()

function invalidateProjectsCache(workspaceId?: string): void {
  if (workspaceId) {
    projectsCache.delete(workspaceId)
    inflightScans.delete(workspaceId)
  } else {
    projectsCache.clear()
    inflightScans.clear()
  }
}

async function getOrScanProjects(
  workspaceId: string,
  root: string
): Promise<Project[]> {
  const cached = projectsCache.get(workspaceId)
  if (cached) return cached
  const inflight = inflightScans.get(workspaceId)
  if (inflight) return inflight

  const t0 = Date.now()
  const promise = scanProjects(workspaceId, root)
    .then((projects) => {
      projectsCache.set(workspaceId, projects)
      inflightScans.delete(workspaceId)
      console.log(`[ipc] scanProjects(${workspaceId.slice(0, 8)}) ${projects.length} projects in ${Date.now() - t0}ms`)
      return projects
    })
    .catch((err) => {
      inflightScans.delete(workspaceId)
      throw err
    })
  inflightScans.set(workspaceId, promise)
  return promise
}

export function registerWorkspaceHandlers(): void {
  ipcMain.handle('workspace:list', async () => {
    const store = await getStore()
    return store.get('workspaces')
  })

  ipcMain.handle('workspace:add', async (event) => {
    // dialog.showOpenDialog는 입력값이 없으므로 zod 검증 불필요
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      properties: ['openDirectory'],
      title: '워크스페이스 폴더 선택',
    })

    if (result.canceled || result.filePaths.length === 0) {
      throw new Error('DIALOG_CANCELED')
    }

    const root = result.filePaths[0]
    const store = await getStore()
    const workspaces = store.get('workspaces')

    // 중복 등록 방지
    const existing = workspaces.find((w) => w.root === root)
    if (existing) return existing

    const workspace: Workspace = {
      id: randomUUID(),
      name: path.basename(root),
      root,
      addedAt: Date.now(),
      lastOpened: null,
    }

    const updated = [...workspaces, workspace]
    store.set('workspaces', updated)

    // 프로토콜 allowlist 갱신
    setProtocolWorkspaceRoots(getWorkspaceRoots(updated))

    // v0.1: chokidar 자동 watch는 disable (메인 스레드 점유로 freeze 유발).
    // workspace.add 후 watch는 v0.2의 명시적 새로고침 버튼에서 재도입.
    void event

    return workspace
  })

  ipcMain.handle('workspace:remove', async (_event, raw: unknown) => {
    const { id } = parseWorkspaceRemoveInput(raw)
    const store = await getStore()
    const workspaces = store.get('workspaces')

    const target = workspaces.find((w) => w.id === id)
    if (!target) return

    const updated = workspaces.filter((w) => w.id !== id)
    store.set('workspaces', updated)

    setProtocolWorkspaceRoots(getWorkspaceRoots(updated))
    // chokidar disable이라 removeWatchRoot 불필요
    invalidateProjectsCache()  // 전체 캐시 무효화 (단일 id 한정 시 stale 위험)
  })

  ipcMain.handle('workspace:scan', async (_event, raw: unknown) => {
    const { workspaceId } = parseScanInput(raw)
    const store = await getStore()
    const workspaces = store.get('workspaces')
    const workspace = workspaces.find((w) => w.id === workspaceId)
    if (!workspace) throw new Error('WORKSPACE_NOT_FOUND')

    return getOrScanProjects(workspaceId, workspace.root)
  })

  // 명시적 새로고침 — 캐시 무효화 후 재스캔. chokidar disable 상태에서 파일 변경 동기화 수단.
  ipcMain.handle('workspace:refresh', async (_event, raw: unknown) => {
    const { workspaceId } = parseScanInput(raw)
    invalidateProjectsCache(workspaceId)
    const store = await getStore()
    const workspaces = store.get('workspaces')
    const workspace = workspaces.find((w) => w.id === workspaceId)
    if (!workspace) throw new Error('WORKSPACE_NOT_FOUND')
    return getOrScanProjects(workspaceId, workspace.root)
  })

  ipcMain.handle('project:get-doc-count', async (_event, raw: unknown) => {
    const { projectId } = parseScanDocsInput(raw)
    const store = await getStore()
    const workspaces = store.get('workspaces')
    let projectRoot: string | null = null
    for (const ws of workspaces) {
      const projects = await getOrScanProjects(ws.id, ws.root)
      const found = projects.find((p) => p.id === projectId)
      if (found) {
        projectRoot = found.root
        break
      }
    }
    if (!projectRoot) return 0
    return countDocs(projectRoot)
  })

  ipcMain.handle('project:scan-docs', async (event, raw: unknown) => {
    const { projectId } = parseScanDocsInput(raw)
    const store = await getStore()
    const workspaces = store.get('workspaces')

    // 캐시된 scanProjects 결과를 활용해 projectRoot를 찾는다.
    // renderer 뷰가 여러 곳에서 호출해도 워크스페이스당 scanProjects는 한 번만 실제 실행됨.
    let projectRoot: string | null = null
    for (const ws of workspaces) {
      const projects = await getOrScanProjects(ws.id, ws.root)
      const found = projects.find((p) => p.id === projectId)
      if (found) {
        projectRoot = found.root
        break
      }
    }

    if (!projectRoot) throw new Error('PROJECT_NOT_FOUND')

    const t0 = Date.now()
    const allDocs = []
    for await (const chunk of scanDocs(projectId, projectRoot)) {
      event.sender.send('project:docs-chunk', chunk)
      allDocs.push(...chunk)
    }
    console.log(`[ipc] project:scan-docs(${projectId.slice(0, 8)}) ${allDocs.length} docs in ${Date.now() - t0}ms`)

    return allDocs
  })
}
