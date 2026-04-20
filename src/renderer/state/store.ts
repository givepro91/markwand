import { create } from 'zustand'
import type { Workspace, Project, Doc, ViewMode, SortOrder, ViewLayout } from '../../../src/preload/types'

export type UpdatedRange = 'today' | '7d' | '30d' | 'all'

export interface MetaFilter {
  tags: string[]
  statuses: string[]
  sources: string[]
  updatedRange: UpdatedRange
}

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
  // ⌘K 커맨드 팔레트 열림 상태
  commandPaletteOpen: boolean
  // F4: 프로젝트별 마지막으로 본 문서 경로 (메모리만, 영속화 X)
  lastViewedDocs: Record<string, string>

  // FilterBar — frontmatter 기반 메타 필터
  metaFilter: MetaFilter
  setMetaFilter: (filter: MetaFilter) => void

  // Composer (v0.2) — 전역 다중 선택 상태. 크로스 프로젝트가 기능의 차별점.
  selectedDocPaths: Set<string>
  composerCollapsed: boolean
  composerAutoClear: boolean // prefs 동기화. true면 Send 성공 시 자동 Clear.
  composerOnboardingSeen: boolean // prefs 동기화. 첫 실행 말풍선 노출 여부.
  cmdkHintSeen: boolean // prefs 동기화. 인덱싱 완료 후 ⌘K 힌트 토스트 1회 노출 여부.
  trackReadDocs: boolean // prefs 동기화. false면 읽음 이력 비활성.

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
  openCommandPalette: () => void
  closeCommandPalette: () => void
  // 커맨드 팔레트에서 문서 선택 시: 해당 프로젝트 뷰로 이동 + 팔레트 닫기
  openDoc: (projectId: string, path: string) => void

  // Composer 액션 — Set은 반드시 new Set(...)으로 불변 교체(Zustand shallow equality)
  toggleDocSelection: (absPath: string) => void
  clearDocSelection: () => void
  replaceDocSelection: (paths: string[]) => void
  setComposerCollapsed: (collapsed: boolean) => void
  setComposerAutoClear: (autoClear: boolean) => void
  setComposerOnboardingSeen: (seen: boolean) => void
  setCmdkHintSeen: (seen: boolean) => void
  setTrackReadDocs: (v: boolean) => void
  pruneStaleDocSelection: (availablePaths: Set<string>) => number
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
  commandPaletteOpen: false,
  metaFilter: { tags: [], statuses: [], sources: [], updatedRange: 'all' },
  setMetaFilter: (metaFilter) => set({ metaFilter }),

  selectedDocPaths: new Set<string>(),
  composerCollapsed: false,
  composerAutoClear: false,
  composerOnboardingSeen: false,
  cmdkHintSeen: false,
  trackReadDocs: true,

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
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  openDoc: (projectId, path) =>
    set({
      pendingDocOpen: { projectId, path },
      activeProjectId: projectId,
      viewMode: 'project' as ViewMode,
      commandPaletteOpen: false,
    }),

  // Composer 액션 — Set 불변 교체 패턴 강제 (shallow equality로 리렌더 보장)
  toggleDocSelection: (absPath) =>
    set((s) => {
      const next = new Set(s.selectedDocPaths)
      if (next.has(absPath)) next.delete(absPath)
      else next.add(absPath)
      return { selectedDocPaths: next }
    }),
  clearDocSelection: () => set({ selectedDocPaths: new Set<string>() }),
  replaceDocSelection: (paths) => set({ selectedDocPaths: new Set<string>(paths) }),
  setComposerCollapsed: (composerCollapsed) => set({ composerCollapsed }),
  setComposerAutoClear: (composerAutoClear) => set({ composerAutoClear }),
  setComposerOnboardingSeen: (composerOnboardingSeen) => set({ composerOnboardingSeen }),
  setCmdkHintSeen: (cmdkHintSeen) => set({ cmdkHintSeen }),
  setTrackReadDocs: (trackReadDocs) => set({ trackReadDocs }),
  pruneStaleDocSelection: (available) => {
    let removed = 0
    set((s) => {
      const next = new Set<string>()
      for (const p of s.selectedDocPaths) {
        if (available.has(p)) next.add(p)
        else removed++
      }
      return removed === 0 ? {} : { selectedDocPaths: next }
    })
    return removed
  },
}))
