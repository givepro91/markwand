import { create } from 'zustand'
import type { Workspace, Project, Doc, ViewMode, SortOrder, ViewLayout } from '../../../src/preload/types'

interface AppState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  activeProjectId: string | null
  projects: Project[]
  projectsLoading: boolean
  projectsError: string | null
  // docCount 채움 진행률 (lazy worker가 갱신)
  docCountProgress: { done: number; total: number }
  // 명시적 새로고침 트리거 (사용자가 새로고침 버튼 클릭 시 증가)
  refreshKey: number
  docs: Doc[]
  viewMode: ViewMode
  sortOrder: SortOrder
  viewLayout: ViewLayout
  readDocs: Record<string, number>
  // F3: 인박스에서 특정 doc을 열도록 요청하는 일회성 신호 (메모리만, 영속화 X)
  pendingDocOpen: { projectId: string; path: string } | null
  // F4: 프로젝트별 마지막으로 본 문서 경로 (메모리만, 영속화 X)
  lastViewedDocs: Record<string, string>

  setWorkspaces: (workspaces: Workspace[]) => void
  addWorkspace: (workspace: Workspace) => void
  removeWorkspace: (id: string) => void
  setActiveWorkspaceId: (id: string | null) => void
  setActiveProjectId: (id: string | null) => void
  setProjects: (projects: Project[]) => void
  setProjectsLoading: (loading: boolean) => void
  setProjectsError: (error: string | null) => void
  setDocCountProgress: (progress: { done: number; total: number }) => void
  bumpRefreshKey: () => void
  setDocs: (docs: Doc[]) => void
  appendDocs: (docs: Doc[]) => void
  updateDoc: (path: string, updates: Partial<Doc>) => void
  removeDoc: (path: string) => void
  setViewMode: (mode: ViewMode) => void
  setSortOrder: (order: SortOrder) => void
  setViewLayout: (layout: ViewLayout) => void
  setReadDocs: (readDocs: Record<string, number>) => void
  markDocRead: (path: string) => void
  setPendingDocOpen: (pending: { projectId: string; path: string } | null) => void
  setLastViewedDoc: (projectId: string, path: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  workspaces: [],
  activeWorkspaceId: null,
  activeProjectId: null,
  projects: [],
  projectsLoading: false,
  projectsError: null,
  docCountProgress: { done: 0, total: 0 },
  refreshKey: 0,
  docs: [],
  viewMode: 'all',
  sortOrder: 'recent',
  viewLayout: 'grid',
  readDocs: {},
  pendingDocOpen: null,
  lastViewedDocs: {},

  setWorkspaces: (workspaces) => set({ workspaces }),
  addWorkspace: (workspace) =>
    set((state) => ({ workspaces: [...state.workspaces, workspace] })),
  removeWorkspace: (id) =>
    set((state) => ({ workspaces: state.workspaces.filter((w) => w.id !== id) })),
  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),
  setActiveProjectId: (id) => set({ activeProjectId: id }),
  setProjects: (projects) => set({ projects }),
  setProjectsLoading: (projectsLoading) => set({ projectsLoading }),
  setProjectsError: (projectsError) => set({ projectsError }),
  setDocCountProgress: (docCountProgress) => set({ docCountProgress }),
  bumpRefreshKey: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
  setDocs: (docs) => set({ docs }),
  appendDocs: (docs) =>
    set((state) => ({ docs: [...state.docs, ...docs] })),
  updateDoc: (path, updates) =>
    set((state) => ({
      docs: state.docs.map((d) => (d.path === path ? { ...d, ...updates } : d)),
    })),
  removeDoc: (path) =>
    set((state) => ({ docs: state.docs.filter((d) => d.path !== path) })),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSortOrder: (order) => set({ sortOrder: order }),
  setViewLayout: (viewLayout) => set({ viewLayout }),
  setReadDocs: (readDocs) => set({ readDocs }),
  markDocRead: (path) =>
    set((state) => ({ readDocs: { ...state.readDocs, [path]: Date.now() } })),
  setPendingDocOpen: (pending) => set({ pendingDocOpen: pending }),
  setLastViewedDoc: (projectId, path) =>
    set((state) => ({ lastViewedDocs: { ...state.lastViewedDocs, [projectId]: path } })),
}))
