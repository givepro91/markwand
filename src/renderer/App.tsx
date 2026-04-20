import { useEffect, useCallback, useState, lazy, Suspense } from 'react'
import { Sidebar } from './components/Sidebar'
import { EmptyState, StatusMessage, ToastHost, toast } from './components/ui'
import { ComposerTray } from './components/ComposerTray'
import { ComposerOnboarding } from './components/ComposerOnboarding'
import { CommandPalette } from './components/CommandPalette'
import { useWorkspace } from './hooks/useWorkspace'
import { useViewMode } from './hooks/useViewMode'
import { useAppStore } from './state/store'
import type { Doc, Project } from '../../src/preload/types'

// 뷰는 lazy 로드 — startup에서 shiki/react-arborist/mermaid를 미리 로드하지 않는다.
const AllProjectsView = lazy(() =>
  import('./views/AllProjectsView').then((m) => ({ default: m.AllProjectsView }))
)
const InboxView = lazy(() =>
  import('./views/InboxView').then((m) => ({ default: m.InboxView }))
)
const ProjectView = lazy(() =>
  import('./views/ProjectView').then((m) => ({ default: m.ProjectView }))
)

const ViewFallback = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
    <StatusMessage variant="loading">로딩 중…</StatusMessage>
  </div>
)

export default function App() {
  const { workspaces, activeWorkspaceId, addWorkspace, removeWorkspace, setActiveWorkspaceId } =
    useWorkspace()
  const { viewMode, setViewMode } = useViewMode()
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId)
  const projects = useAppStore((s) => s.projects)

  // Composer — 전역 선택 상태 + 설정 prefs
  const docs = useAppStore((s) => s.docs)
  const pruneStaleDocSelection = useAppStore((s) => s.pruneStaleDocSelection)
  const composerOnboardingSeen = useAppStore((s) => s.composerOnboardingSeen)
  const setComposerOnboardingSeen = useAppStore((s) => s.setComposerOnboardingSeen)
  // P1.5 — 마지막 선택 복원 상태 플래그. 복원은 첫 워크스페이스 스캔 직후 1회만.
  const [pendingRestore, setPendingRestore] = useState<string[] | null>(null)

  // viewMode 초기값 복원 + 온보딩 + 마지막 선택 로드
  useEffect(() => {
    window.api.prefs.get('viewMode').then((stored) => {
      if (stored === 'all' || stored === 'inbox' || stored === 'project') {
        useAppStore.getState().setViewMode(stored)
      }
    })
    window.api.prefs.get('composerOnboardingSeen').then((stored) => {
      if (stored === true) {
        useAppStore.getState().setComposerOnboardingSeen(true)
      }
    })
    window.api.prefs.get('composerAutoClear').then((stored) => {
      if (stored === true) {
        useAppStore.getState().setComposerAutoClear(true)
      }
    })
    // P1.5 — 마지막 선택 스냅샷 로드. 실제 복원은 첫 docs 스캔 직후에 stale 필터링 후 실행.
    window.api.prefs.get('lastSelectedDocPaths').then((stored) => {
      if (Array.isArray(stored) && stored.every((v) => typeof v === 'string')) {
        setPendingRestore(stored as string[])
      }
    })
  }, [])

  // Composer — docs가 바뀌면 stale 경로 제거.
  // deps는 docs만 — pruneStaleDocSelection이 바뀌지 않는 store 액션이고,
  // selectedDocPaths를 deps에 넣으면 pruning → state 변화 → effect 재실행의 의존 싸이클 유발.
  useEffect(() => {
    if (useAppStore.getState().selectedDocPaths.size === 0) return
    if (docs.length === 0) return
    const available = new Set<string>(docs.map((d) => d.path))
    const removed = pruneStaleDocSelection(available)
    if (removed > 0) {
      toast.info(`${removed}개 문서가 더 이상 존재하지 않아 선택에서 제거되었습니다`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs])

  // P1.5 — docs가 처음 로드되는 시점에 lastSelectedDocPaths를 stale 필터 후 복원 (1회).
  useEffect(() => {
    if (pendingRestore === null) return
    if (docs.length === 0) return
    const available = new Set<string>(docs.map((d) => d.path))
    const surviving = pendingRestore.filter((p) => available.has(p))
    setPendingRestore(null)
    if (surviving.length === 0) return
    useAppStore.getState().replaceDocSelection(surviving)
    const removed = pendingRestore.length - surviving.length
    const msg =
      removed > 0
        ? `마지막 선택 ${surviving.length}개 복원됨 (${removed}개 누락)`
        : `마지막 선택 ${surviving.length}개 복원됨`
    toast.info(msg, {
      action: {
        label: 'Clear',
        onClick: () => useAppStore.getState().clearDocSelection(),
      },
      durationMs: 6000,
    })
  }, [docs, pendingRestore])

  // 선택이 바뀔 때마다 prefs에 저장(앱 종료 전에 유실 방지). debounce 500ms.
  const selectedDocPaths = useAppStore((s) => s.selectedDocPaths)
  useEffect(() => {
    const arr = Array.from(selectedDocPaths)
    const t = setTimeout(() => {
      void window.api.prefs.set('lastSelectedDocPaths', arr)
    }, 500)
    return () => clearTimeout(t)
  }, [selectedDocPaths])

  const handleDismissOnboarding = useCallback(() => {
    setComposerOnboardingSeen(true)
    void window.api.prefs.set('composerOnboardingSeen', true)
  }, [setComposerOnboardingSeen])

  const refreshKey = useAppStore((s) => s.refreshKey)

  // 활성 워크스페이스 또는 refreshKey 변경 시 스캔. refreshKey는 사용자 새로고침 버튼이 트리거.
  useEffect(() => {
    if (!activeWorkspaceId) return
    let cancelled = false
    const store = useAppStore.getState()
    store.setProjectsLoading(true)
    store.setProjectsError(null)
    store.setDocCountProgress({ done: 0, total: 0 })
    // 새로고침 키 변경 시는 캐시 무효화된 refresh 호출. 첫 진입은 cache hit OK.
    const scanCall = refreshKey > 0
      ? window.api.workspace.refresh(activeWorkspaceId)
      : window.api.workspace.scan(activeWorkspaceId)
    scanCall
      .then(async (scanned) => {
        if (cancelled) return
        useAppStore.getState().setProjects(scanned)
        useAppStore.getState().setProjectsLoading(false)
        useAppStore.getState().setDocCountProgress({ done: 0, total: scanned.length })

        // docCount는 throttled로 채운다 (동시성 3, 매 호출 사이 16ms idle로 메인 스레드 양보).
        const CONCURRENCY = 3
        const queue = [...scanned.map((p) => p.id)]
        let done = 0
        async function worker() {
          while (queue.length > 0 && !cancelled) {
            const id = queue.shift()!
            try {
              const n = await window.api.project.getDocCount(id)
              if (cancelled) return
              useAppStore.setState((s) => ({
                projects: s.projects.map((p) => (p.id === id ? { ...p, docCount: n } : p)),
                docCountProgress: { done: done + 1, total: s.docCountProgress.total },
              }))
              done += 1
            } catch {
              done += 1
              // 실패한 프로젝트도 docCount를 0으로 확정 — "분석 중" stuck 방지
              useAppStore.setState((s) => ({
                projects: s.projects.map((p) => (p.id === id ? { ...p, docCount: 0 } : p)),
                docCountProgress: { done, total: s.docCountProgress.total },
              }))
            }
            // 다음 IPC 전 메인 스레드 양보
            await new Promise((r) => setTimeout(r, 16))
          }
        }
        await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
      })
      .catch((err) => {
        if (cancelled) return
        useAppStore.getState().setProjectsError(
          err instanceof Error ? err.message : String(err)
        )
        useAppStore.getState().setProjectsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeWorkspaceId, refreshKey])

  const handleOpenProject = useCallback(
    (project: Project) => {
      setActiveProjectId(project.id)
      setViewMode('project')
    },
    [setActiveProjectId, setViewMode]
  )

  const setPendingDocOpen = useAppStore((s) => s.setPendingDocOpen)

  const handleOpenDocFromInbox = useCallback(
    (doc: Doc, projectId: string) => {
      setPendingDocOpen({ projectId, path: doc.path })
      setActiveProjectId(projectId)
      setViewMode('project')
    },
    [setPendingDocOpen, setActiveProjectId, setViewMode]
  )

  const handleWorkspaceSelect = useCallback(
    async (id: string) => {
      setActiveWorkspaceId(id)
      await window.api.prefs.set('activeWorkspaceId', id)
      // 워크스페이스 전환 시 project 뷰가 아니면 all로 이동
      if (viewMode === 'project') setViewMode('all')
    },
    [setActiveWorkspaceId, viewMode, setViewMode]
  )

  // 워크스페이스 추가 직후엔 always 'all' 뷰로 전환 — 진행률 카드 그리드를 보여주기 위해.
  const handleAddWorkspace = useCallback(async () => {
    const ws = await addWorkspace()
    if (ws) setViewMode('all')
    return ws
  }, [addWorkspace, setViewMode])

  const projectsLoading = useAppStore((s) => s.projectsLoading)
  const docCountProgress = useAppStore((s) => s.docCountProgress)
  const isDocCounting = docCountProgress.total > 0 && docCountProgress.done < docCountProgress.total
  // 풀스크린 오버레이 — 워크스페이스 분석부터 docCount 진행률 100% 도달까지 유지.
  // 진행률(%)을 사용자가 명확히 볼 수 있도록 docCount 단계도 포함.
  const showInitialOverlay = !!activeWorkspaceId && (projectsLoading || isDocCounting)
  const docPct = docCountProgress.total > 0
    ? Math.round((docCountProgress.done / docCountProgress.total) * 100)
    : 0

  const activeProject = activeProjectId
    ? projects.find((p) => p.id === activeProjectId) ?? null
    : null

  const showOnboarding = !composerOnboardingSeen && workspaces.length > 0

  // 워크스페이스가 없을 때 메인 영역에 1차 CTA
  if (workspaces.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--text)' }}>
        <Sidebar
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          viewMode={viewMode}
          onWorkspaceSelect={handleWorkspaceSelect}
          onWorkspaceAdd={handleAddWorkspace}
          onWorkspaceRemove={removeWorkspace}
          onViewModeChange={setViewMode}
        />
        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <EmptyState
            icon="🗂️"
            title="워크스페이스를 추가하세요"
            description="마크다운 문서가 있는 폴더를 워크스페이스로 등록하면 프로젝트와 문서를 탐색할 수 있습니다."
            cta={{ label: '+ 워크스페이스 추가', onClick: handleAddWorkspace, variant: 'primary' }}
            size="lg"
          />
        </main>
        <CommandPalette />
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--text)' }}>
      {showInitialOverlay && (
        <div className="app-loading-overlay" role="status" aria-live="polite">
          <span className="ui-spinner lg" aria-hidden="true" />
          <div className="app-loading-overlay__title">
            {projectsLoading
              ? '워크스페이스 분석 중…'
              : `프로젝트 ${docCountProgress.total}개 분석 중 · ${docPct}%`}
          </div>
          <div className="app-loading-overlay__detail">
            {projectsLoading
              ? '폴더를 스캔하고 프로젝트(.git, package.json 등 마커)를 찾고 있습니다.'
              : `각 프로젝트의 문서 수를 계산 중입니다. (${docCountProgress.done}/${docCountProgress.total})`}
          </div>
          {isDocCounting && (
            <div className="app-loading-overlay__progress" aria-label={`${docPct}% 완료`}>
              <div
                className="app-loading-overlay__progress-bar"
                style={{ width: `${docPct}%` }}
              />
            </div>
          )}
        </div>
      )}
      <Sidebar
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        viewMode={viewMode}
        onWorkspaceSelect={handleWorkspaceSelect}
        onWorkspaceAdd={handleAddWorkspace}
        onWorkspaceRemove={removeWorkspace}
        onViewModeChange={setViewMode}
      />

      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {showOnboarding && <ComposerOnboarding onDismiss={handleDismissOnboarding} />}
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <Suspense fallback={<ViewFallback />}>
            {viewMode === 'all' && (
              <AllProjectsView
                workspaceId={activeWorkspaceId}
                onOpenProject={handleOpenProject}
              />
            )}
            {viewMode === 'inbox' && (
              <InboxView
                workspaceId={activeWorkspaceId}
                onOpenDoc={handleOpenDocFromInbox}
              />
            )}
            {viewMode === 'project' && activeProject && (
              <ProjectView
                key={activeProject.id}
                projectId={activeProject.id}
                projectRoot={activeProject.root}
                projectName={activeProject.name}
              />
            )}
          </Suspense>
          {viewMode === 'project' && !activeProject && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <EmptyState
                icon="📂"
                title="프로젝트를 선택하세요"
                description="프로젝트 목록에서 원하는 프로젝트를 클릭하면 여기서 문서를 탐색할 수 있습니다."
                cta={{
                  label: '전체 프로젝트 보기',
                  onClick: () => setViewMode('all'),
                  variant: 'primary',
                }}
              />
            </div>
          )}
        </div>
        <ComposerTray />
      </main>
      <ToastHost />
      <CommandPalette />
    </div>
  )
}
