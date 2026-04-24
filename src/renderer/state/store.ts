import { create } from 'zustand'
import type {
  Workspace,
  Project,
  Doc,
  ViewMode,
  SortOrder,
  ViewLayout,
  DriftReport,
  TransportStatusEvent,
} from '../../../src/preload/types'
import { classifyAsset } from '../../lib/viewable'

// C7: 모듈 스코프 캐시 — Zustand 5 identity 보장.
// appendDocs/setDocs/updateDoc/removeDoc 각 액션에서 이 변수를 갱신한 뒤
// set({ docs: cachedFlat, ... }) 단일 호출로 구독자에게 notify한다.
let cachedFlat: Doc[] = []

function buildFlatAndIndex(map: Map<string, Doc[]>): {
  flat: Doc[]
  statuses: Set<string>
  sources: Set<string>
} {
  const flat: Doc[] = []
  const statuses = new Set<string>()
  const sources = new Set<string>()
  for (const bucket of map.values()) {
    for (const doc of bucket) {
      flat.push(doc)
      if (doc.frontmatter?.status) statuses.add(doc.frontmatter.status as string)
      if (doc.frontmatter?.source) sources.add(doc.frontmatter.source as string)
    }
  }
  return { flat, statuses, sources }
}

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
  // C7: projectId → Doc[] 버킷 맵. O(1) 조회용.
  docsByProject: Map<string, Doc[]>
  // C7: appendDocs 시 증분으로 관리하는 frontmatter 인덱스.
  frontmatterIndex: { statuses: Set<string>; sources: Set<string> }
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

  // Drift Verifier (v0.2) — docPath → 최신 리포트. 영속화 X, 세션 스코프.
  driftReports: Record<string, DriftReport>
  // docPath → 해당 문서에서 "무시" 처리된 참조 resolvedPath 배열. 세션 스코프.
  ignoredDriftRefs: Record<string, string[]>

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
  appendDocs: (newDocs: Doc[]) => void
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

  setDriftReport: (docPath: string, report: DriftReport) => void
  clearDriftReport: (docPath: string) => void
  pruneDriftReports: (availablePaths: Set<string>) => void
  toggleIgnoredRef: (docPath: string, resolvedPath: string) => void
  clearIgnoredRefs: (docPath: string) => void

  // M3 S2 — Transport 상태 (workspaceId 별). 값 없음 = 'idle'(UI 미표시).
  transportStatuses: Record<string, TransportStatusEvent>
  setTransportStatus: (event: TransportStatusEvent) => void
  clearTransportStatus: (workspaceId: string) => void
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
  docsByProject: new Map(),
  frontmatterIndex: { statuses: new Set(), sources: new Set() },
  viewMode: 'all',
  sortOrder: 'recent',
  viewLayout: 'grid',
  readDocs: {},
  pendingDocOpen: null,
  lastViewedDocs: {},
  commandPaletteOpen: false,
  metaFilter: { tags: [], statuses: [], sources: [], updatedRange: 'all' },
  setMetaFilter: (metaFilter) => set({ metaFilter }),

  transportStatuses: {},
  setTransportStatus: (event) =>
    set((s) => ({ transportStatuses: { ...s.transportStatuses, [event.workspaceId]: event } })),
  clearTransportStatus: (workspaceId) =>
    set((s) => {
      if (!(workspaceId in s.transportStatuses)) return s
      const next = { ...s.transportStatuses }
      delete next[workspaceId]
      return { transportStatuses: next }
    }),

  selectedDocPaths: new Set<string>(),
  composerCollapsed: false,
  composerAutoClear: false,
  composerOnboardingSeen: false,
  cmdkHintSeen: false,
  trackReadDocs: true,
  driftReports: {},
  ignoredDriftRefs: {},

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
  setDocs: (docs) => {
    // Map 재빌드 + frontmatterIndex 재빌드 + cachedFlat 재할당
    const map = new Map<string, Doc[]>()
    for (const doc of docs) {
      const bucket = map.get(doc.projectId)
      if (bucket) bucket.push(doc)
      else map.set(doc.projectId, [doc])
    }
    const { flat, statuses, sources } = buildFlatAndIndex(map)
    cachedFlat = flat
    set({
      docs: cachedFlat,
      docsByProject: map,
      frontmatterIndex: { statuses, sources },
    })
  },
  appendDocs: (newDocs) =>
    set((state) => {
      // C7: Map 버킷에 append — O(chunk) 아닌 O(N) 재할당 제거
      const map = state.docsByProject
      for (const doc of newDocs) {
        const bucket = map.get(doc.projectId)
        if (bucket) bucket.push(doc)
        else map.set(doc.projectId, [doc])
        // frontmatterIndex 증분 add (감소는 removeDoc에서 재빌드)
        if (doc.frontmatter?.status) state.frontmatterIndex.statuses.add(doc.frontmatter.status as string)
        if (doc.frontmatter?.source) state.frontmatterIndex.sources.add(doc.frontmatter.source as string)
      }
      cachedFlat = Array.from(map.values()).flat()
      return {
        docs: cachedFlat,
        docsByProject: new Map(map),
        frontmatterIndex: {
          statuses: new Set(state.frontmatterIndex.statuses),
          sources: new Set(state.frontmatterIndex.sources),
        },
      }
    }),
  updateDoc: (path, updates) =>
    set((state) => {
      // 해당 projectId 버킷에서 path 일치 doc 교체
      const targetProjectId = state.docs.find((d) => d.path === path)?.projectId
      if (!targetProjectId) return {}
      const map = new Map(state.docsByProject)
      const bucket = map.get(targetProjectId)
      if (!bucket) return {}
      map.set(
        targetProjectId,
        bucket.map((d) => (d.path === path ? { ...d, ...updates } : d))
      )
      cachedFlat = Array.from(map.values()).flat()
      return {
        docs: cachedFlat,
        docsByProject: map,
      }
    }),
  removeDoc: (path) =>
    set((state) => {
      const targetProjectId = state.docs.find((d) => d.path === path)?.projectId
      if (!targetProjectId) return {}
      const map = new Map(state.docsByProject)
      const bucket = map.get(targetProjectId)
      if (!bucket) return {}
      const newBucket = bucket.filter((d) => d.path !== path)
      if (newBucket.length === 0) map.delete(targetProjectId)
      else map.set(targetProjectId, newBucket)
      cachedFlat = Array.from(map.values()).flat()
      // frontmatterIndex 보수적 재빌드 (removeDoc은 정확한 감소 불가 → 전체 재스캔)
      const { statuses, sources } = buildFlatAndIndex(map)
      return {
        docs: cachedFlat,
        docsByProject: map,
        frontmatterIndex: { statuses, sources },
      }
    }),
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
    // "사라진 파일" + "이미지 등 non-md 자산"을 모두 제거.
    // 이미지는 Composer 대상이 아니므로(v0.3.1-C) 선택 집합에 남아있으면 Copy @ref 에
    // 포함되어 Claude 토큰 낭비. 과거 md 파일이 이미지로 rename된 경우에도 정리 가능.
    let removed = 0
    set((s) => {
      const next = new Set<string>()
      for (const p of s.selectedDocPaths) {
        if (available.has(p) && classifyAsset(p) === 'md') next.add(p)
        else removed++
      }
      return removed === 0 ? {} : { selectedDocPaths: next }
    })
    return removed
  },

  setDriftReport: (docPath, report) =>
    set((s) => ({ driftReports: { ...s.driftReports, [docPath]: report } })),
  clearDriftReport: (docPath) =>
    set((s) => {
      if (!(docPath in s.driftReports)) return {}
      const next = { ...s.driftReports }
      delete next[docPath]
      return { driftReports: next }
    }),
  pruneDriftReports: (available) =>
    set((s) => {
      const next: Record<string, DriftReport> = {}
      let changed = false
      for (const [p, r] of Object.entries(s.driftReports)) {
        if (available.has(p)) next[p] = r
        else changed = true
      }
      return changed ? { driftReports: next } : {}
    }),
  toggleIgnoredRef: (docPath, resolvedPath) =>
    set((s) => {
      const current = s.ignoredDriftRefs[docPath] ?? []
      const has = current.includes(resolvedPath)
      const next = has ? current.filter((p) => p !== resolvedPath) : [...current, resolvedPath]
      return { ignoredDriftRefs: { ...s.ignoredDriftRefs, [docPath]: next } }
    }),
  clearIgnoredRefs: (docPath) =>
    set((s) => {
      if (!(docPath in s.ignoredDriftRefs)) return {}
      const next = { ...s.ignoredDriftRefs }
      delete next[docPath]
      return { ignoredDriftRefs: next }
    }),
}))
