import { useEffect, useCallback, useState, useRef, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { loadLanguageFromPrefs } from './i18n'
import { Sidebar } from './components/Sidebar'
import { EmptyState, StatusMessage, ToastHost, toast } from './components/ui'
import { ComposerTray } from './components/ComposerTray'
import { ComposerOnboarding } from './components/ComposerOnboarding'
import { CommandPalette } from './components/CommandPalette'
import { ErrorBoundary } from './components/ErrorBoundary'
import { SshHostKeyPrompt } from './components/SshHostKeyPrompt'
import { SshWorkspaceAddModal } from './components/SshWorkspaceAddModal'
import { FirstRunOnboarding } from './components/FirstRunOnboarding'
import { useWorkspace } from './hooks/useWorkspace'
import { useViewMode } from './hooks/useViewMode'
import { useDrift } from './hooks/useDrift'
import { useTransportStatusSubscription } from './hooks/useTransportStatus'
import { useAppStore } from './state/store'
import { classifyAsset } from '../lib/viewable'
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

function ViewFallback() {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <StatusMessage variant="loading">{t('common.loading')}</StatusMessage>
    </div>
  )
}

export default function App() {
  const { t } = useTranslation()
  // M3 S3 — SSH transport 상태 이벤트 구독 (flag off 여도 구독 비용 미미, 이벤트가 없음)
  useTransportStatusSubscription()

  // i18n — prefs 에 저장된 언어 override 를 1회 로드
  useEffect(() => {
    void loadLanguageFromPrefs()
  }, [])

  const { workspaces, activeWorkspaceId, addWorkspace, addSshWorkspace, removeWorkspace, setActiveWorkspaceId } =
    useWorkspace()
  // Follow-up FS2 — experimentalFeatures.sshTransport flag + SSH 추가 모달 상태.
  const [experimentalSsh, setExperimentalSsh] = useState(false)
  const [sshModalOpen, setSshModalOpen] = useState(false)
  useEffect(() => {
    window.api.prefs
      .get('experimentalFeatures.sshTransport')
      .then((v) => setExperimentalSsh(v === true))
      .catch(() => undefined)
  }, [])
  const { viewMode, setViewMode } = useViewMode()
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId)
  const projects = useAppStore((s) => s.projects)

  // Composer — 전역 선택 상태 + 설정 prefs
  const docs = useAppStore((s) => s.docs)
  const pruneStaleDocSelection = useAppStore((s) => s.pruneStaleDocSelection)

  // Drift Verifier — 모든 로드된 docs 를 백그라운드에서 검증 (projects 루트 조회 필요)
  useDrift(docs, projects)
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
    window.api.prefs.get('hints.cmdk.seen').then((stored) => {
      if (stored === true) {
        useAppStore.getState().setCmdkHintSeen(true)
      }
    })
    window.api.prefs.get('composerAutoClear').then((stored) => {
      if (stored === true) {
        useAppStore.getState().setComposerAutoClear(true)
      }
    })
    // load atomically to avoid race between trackReadDocs and readDocs
    Promise.all([
      window.api.prefs.get('trackReadDocs'),
      window.api.prefs.get('readDocs'),
    ]).then(([trackStored, readDocsStored]) => {
      const trackReadDocs = trackStored === false ? false : undefined
      const readDocs =
        readDocsStored && typeof readDocsStored === 'object' && !Array.isArray(readDocsStored)
          ? (readDocsStored as Record<string, number>)
          : undefined
      if (trackReadDocs !== undefined && readDocs !== undefined) {
        useAppStore.setState({ trackReadDocs, readDocs })
      } else if (trackReadDocs !== undefined) {
        useAppStore.getState().setTrackReadDocs(trackReadDocs)
      } else if (readDocs !== undefined) {
        useAppStore.getState().setReadDocs(readDocs)
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
      toast.info(t('app.staleSelectionRemoved', { count: removed }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs])

  // P1.5 — docs가 처음 로드되는 시점에 lastSelectedDocPaths를 stale 필터 후 복원 (1회).
  // v0.3.1: 이전 세션에 이미지가 선택돼 있었어도 복원에서 제외 — Composer 대상은 md 전용.
  useEffect(() => {
    if (pendingRestore === null) return
    if (docs.length === 0) return
    const available = new Set<string>(docs.map((d) => d.path))
    const surviving = pendingRestore.filter(
      (p) => available.has(p) && classifyAsset(p) === 'md'
    )
    setPendingRestore(null)
    if (surviving.length === 0) return
    useAppStore.getState().replaceDocSelection(surviving)
    const removed = pendingRestore.length - surviving.length
    const msg =
      removed > 0
        ? t('app.lastSelectionRestoredPartial', { count: surviving.length, missing: removed })
        : t('app.lastSelectionRestored', { count: surviving.length })
    toast.info(msg, {
      action: {
        label: t('app.lastSelectionClear'),
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

  const cmdkHintSeen = useAppStore((s) => s.cmdkHintSeen)
  const setCmdkHintSeen = useAppStore((s) => s.setCmdkHintSeen)

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

  // S2 — 프로젝트 레벨 디렉토리 변화(로컬 watcher)를 받아 자동으로 목록 재스캔 트리거.
  // main 에서 이미 500ms debounce 수렴한 이벤트. 추가로 renderer 측 2s 쓰로틀은
  // 사용자가 연속으로 여러 폴더를 조작할 때(복수 git clone 등) 무한 rescan 방어.
  // SSH 워크스페이스는 SshPoller 주기로 별도 동작 — 본 핸들러는 모든 워크스페이스에 안전.
  const bumpRefreshKey = useAppStore((s) => s.bumpRefreshKey)
  useEffect(() => {
    const api = window.api?.fs?.onProjectChange
    if (!api) return
    let throttleTimer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = api(() => {
      if (throttleTimer) return
      throttleTimer = setTimeout(() => {
        throttleTimer = null
        bumpRefreshKey()
      }, 2000)
    })
    return () => {
      if (throttleTimer) clearTimeout(throttleTimer)
      unsubscribe()
    }
  }, [bumpRefreshKey])

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

  // v0.4 C3 — 첫 워크스페이스 추가 직후 1회 onboarding 오버레이. prefs 로 영속.
  const [showFirstRunOnboarding, setShowFirstRunOnboarding] = useState(false)

  const maybeTriggerOnboarding = useCallback(async () => {
    const shown = await window.api.prefs.get('onboardingShown').catch(() => undefined)
    if (shown === true) return
    setShowFirstRunOnboarding(true)
    window.api.prefs.set('onboardingShown', true).catch(() => undefined)
  }, [])

  // 워크스페이스 추가 직후엔 always 'all' 뷰로 전환 — 진행률 카드 그리드를 보여주기 위해.
  const handleAddWorkspace = useCallback(async () => {
    const ws = await addWorkspace()
    if (ws) {
      setViewMode('all')
      void maybeTriggerOnboarding()
    }
    return ws
  }, [addWorkspace, setViewMode, maybeTriggerOnboarding])

  // Follow-up FS2 — SSH 추가 모달 트리거.
  const handleAddSshWorkspace = useCallback(() => {
    setSshModalOpen(true)
  }, [])

  const handleSshSubmit = useCallback(
    async (input: Parameters<typeof addSshWorkspace>[0]) => {
      const ws = await addSshWorkspace(input)
      if (ws) {
        setViewMode('all')
        void maybeTriggerOnboarding()
      }
    },
    [addSshWorkspace, setViewMode, maybeTriggerOnboarding],
  )

  const projectsLoading = useAppStore((s) => s.projectsLoading)
  const docCountProgress = useAppStore((s) => s.docCountProgress)

  // 인덱싱 완료 감지 → ⌘K 힌트 토스트 1회 노출
  const wasIndexingRef = useRef(false)
  useEffect(() => {
    const counting = docCountProgress.total > 0 && docCountProgress.done < docCountProgress.total
    if (counting) {
      wasIndexingRef.current = true
      return
    }
    if (wasIndexingRef.current && docCountProgress.total > 0) {
      wasIndexingRef.current = false
      if (!cmdkHintSeen) {
        toast.info(t('app.cmdkHint'), { durationMs: 7000 })
        setCmdkHintSeen(true)
        void window.api.prefs.set('hints.cmdk.seen', true)
      }
    }
  }, [docCountProgress, cmdkHintSeen, setCmdkHintSeen])
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
          onWorkspaceAddSsh={handleAddSshWorkspace}
          experimentalSsh={experimentalSsh}
          onWorkspaceRemove={removeWorkspace}
          onViewModeChange={setViewMode}
        />
        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <EmptyState
            icon="🗂️"
            title={t('empty.title')}
            description={t('empty.description')}
            cta={{ label: t('empty.cta'), onClick: handleAddWorkspace, variant: 'primary' }}
            size="lg"
          />
        </main>
        <CommandPalette />
        {/* Empty-state 에서도 SSH 첫 접속 시 TOFU 모달이 필요 — 폴더 탐색/워크스페이스 추가 단계에서 host key prompt 수신. */}
        <SshHostKeyPrompt />
        <SshWorkspaceAddModal
          open={sshModalOpen}
          onClose={() => setSshModalOpen(false)}
          onSubmit={handleSshSubmit}
        />
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--text)' }}>
      {/* M3 S2 후반부 — TOFU 모달. queue 비었을 때 null 반환이라 상시 mount 안전. */}
      <SshHostKeyPrompt />
      {/* Follow-up FS2 — SSH workspace 추가 폼. flag on + experimental 체크 시에만 트리거. */}
      <SshWorkspaceAddModal
        open={sshModalOpen}
        onClose={() => setSshModalOpen(false)}
        onSubmit={handleSshSubmit}
      />
      {showInitialOverlay && (
        <div className="app-loading-overlay" role="status" aria-live="polite">
          <span className="ui-spinner lg" aria-hidden="true" />
          <div className="app-loading-overlay__title">
            {projectsLoading
              ? t('loading.workspaceAnalyzing')
              : t('loading.projectAnalyzing', { total: docCountProgress.total, pct: docPct })}
          </div>
          <div className="app-loading-overlay__detail">
            {projectsLoading
              ? t('loading.workspaceDetail')
              : t('loading.projectDetail', { done: docCountProgress.done, total: docCountProgress.total })}
          </div>
          {isDocCounting && (
            <div className="app-loading-overlay__progress" aria-label={t('loading.progressAria', { pct: docPct })}>
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
        onWorkspaceAddSsh={handleAddSshWorkspace}
        experimentalSsh={experimentalSsh}
        onWorkspaceRemove={removeWorkspace}
        onViewModeChange={setViewMode}
      />

      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {showOnboarding && <ComposerOnboarding onDismiss={handleDismissOnboarding} />}
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <ErrorBoundary resetKey={`${viewMode}:${activeProject?.id ?? ''}`}>
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
          </ErrorBoundary>
          {viewMode === 'project' && !activeProject && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <EmptyState
                icon="📂"
                title={t('projectView.selectProject')}
                description={t('allProjects.selectWorkspaceDesc')}
                cta={{
                  label: t('projectView.allProjectsCta'),
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
      {showFirstRunOnboarding && (
        <FirstRunOnboarding onClose={() => setShowFirstRunOnboarding(false)} />
      )}
    </div>
  )
}
