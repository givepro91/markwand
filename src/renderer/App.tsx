import { useEffect, useCallback, useState, useRef, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { loadLanguageFromPrefs } from './i18n'
import { Sidebar } from './components/Sidebar'
import { Button, EmptyState, StatusMessage, ToastHost, toast } from './components/ui'
import { humanizeError } from './lib/humanizeError'
import { ComposerTray } from './components/ComposerTray'
import { ComposerOnboarding } from './components/ComposerOnboarding'
import { CommandPalette } from './components/CommandPalette'
import { ErrorBoundary } from './components/ErrorBoundary'
import { SshHostKeyPrompt } from './components/SshHostKeyPrompt'
import { SshWorkspaceAddModal } from './components/SshWorkspaceAddModal'
import { FirstRunOnboarding } from './components/FirstRunOnboarding'
import { useWorkspace } from './hooks/useWorkspace'
import { useViewMode } from './hooks/useViewMode'
import { useTransportStatusSubscription } from './hooks/useTransportStatus'
import { useGlobalHotkey } from './hooks/useGlobalHotkey'
import { shouldShowInitialOverlay } from './lib/loadingOverlay'
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

  // FS-RT-2 — activeProjectId 변경 시 자동 prefs persist. 다음 부팅 / hot-reload 에서
  // 복원되어 ProjectView mount 가 보존된다.
  // null 클리어도 같이 저장 — 사용자가 "프로젝트 목록"으로 명시 빠져나간 의도 보존.
  //
  // race 가드: 부팅 직후 첫 render 시점은 store activeProjectId === null 이므로
  // 그대로 persist 하면 prefs.get 으로 복원 시점 이전에 null 로 덮어써진다 (inject 값 유실).
  // restoredRef 가 true 가 된 후(=boot restore 완료) 부터만 persist.
  const projectPersistArmedRef = useRef(false)
  useEffect(() => {
    if (!projectPersistArmedRef.current) return
    void window.api.prefs.set('activeProjectId', activeProjectId).catch(() => undefined)
  }, [activeProjectId])

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
    // FS-RT-2 — activeProjectId 복원. 미복원 시 viewMode='project' 인데 activeProjectId=null
    // 인 모순 상태가 되어 ProjectView 자체가 mount 안 되고 watcher 'add' 가 트리에 못 들어옴.
    // 복원 완료 시 projectPersistArmedRef = true → 이후 변경부터 prefs.set 동작.
    window.api.prefs.get('activeProjectId').then((stored) => {
      if (typeof stored === 'string' && stored.length > 0) {
        useAppStore.getState().setActiveProjectId(stored)
      }
    }).catch(() => undefined).finally(() => {
      projectPersistArmedRef.current = true
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
  // H7: docs chunk마다 effect 재실행 방지 — 500ms debounce로 마지막 chunk 안정 후 1회 실행.
  // deps는 docs만 — pruneStaleDocSelection이 바뀌지 않는 store 액션이고,
  // selectedDocPaths를 deps에 넣으면 pruning → state 변화 → effect 재실행의 의존 싸이클 유발.
  useEffect(() => {
    const id = setTimeout(() => {
      if (useAppStore.getState().selectedDocPaths.size === 0) return
      if (docs.length === 0) return
      const available = new Set<string>(docs.map((d) => d.path))
      const removed = pruneStaleDocSelection(available)
      if (removed > 0) {
        toast.info(t('app.staleSelectionRemoved', { count: removed }))
      }
    }, 500)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs])

  // P1.5 — docs가 처음 로드되는 시점에 lastSelectedDocPaths를 stale 필터 후 복원 (1회).
  // H7: 500ms debounce — 마지막 chunk 안정 후 1회 실행.
  // v0.3.1: 이전 세션에 이미지가 선택돼 있었어도 복원에서 제외 — Composer 대상은 md 전용.
  useEffect(() => {
    if (pendingRestore === null) return
    const id = setTimeout(() => {
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
    }, 500)
    return () => clearTimeout(id)
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
    // 렌더러 안전망 — main 측 readyTimeout 20s 가 삼켜지는 엣지(pool/SFTP stuck) 대비.
    // SSH 만 적용: 로컬 스캔은 chokidar 초기 walk 와 경쟁해 합법적으로 분 단위로 걸릴 수 있음
    // (실측: swk 128s). 로컬은 "오래 걸림" 이지 "hang" 이 아니므로 타임아웃 불요 — 대신
    // Sidebar 로 언제든 탈출 가능(오버레이가 main 내부로 옮겨져 항상 조작 가능).
    const isSshWorkspace = activeWorkspaceId.startsWith('ssh:')
    const SCAN_TIMEOUT_MS = 30_000
    let timeoutId: ReturnType<typeof setTimeout> | null = isSshWorkspace
      ? setTimeout(() => {
          if (cancelled) return
          timeoutId = null
          useAppStore.getState().setProjectsError('SCAN_TIMEOUT')
          useAppStore.getState().setProjectsLoading(false)
        }, SCAN_TIMEOUT_MS)
      : null
    const clearScanTimeout = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }
    scanCall
      .then(async (scanned) => {
        clearScanTimeout()
        if (cancelled) return
        useAppStore.getState().setProjects(scanned)
        useAppStore.getState().setProjectsLoading(false)
        // 타임아웃 뒤 뒤늦게 성공한 경우 에러 오버레이 자동 해제.
        useAppStore.getState().setProjectsError(null)
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
        clearScanTimeout()
        if (cancelled) return
        // 타임아웃이 먼저 발동해 projectsError 가 세팅된 경우(여기가 늦게 도착) 덮어쓰지 않음.
        if (useAppStore.getState().projectsError) return
        useAppStore.getState().setProjectsError(
          err instanceof Error ? err.message : String(err)
        )
        useAppStore.getState().setProjectsLoading(false)
      })
    return () => {
      cancelled = true
      clearScanTimeout()
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

  // RecentDocsPanel 의 "+N개 더" → InboxView 로 이동.
  // 인박스가 모든 최근 docs+images 를 그룹화해서 보여주므로 별도 풀 리스트 화면 불필요.
  const handleSeeMoreRecent = useCallback(() => {
    setViewMode('inbox')
  }, [setViewMode])

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
      // store 의 setActiveWorkspaceId 가 id 변경 시 projects 를 자동으로 비운다.
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
  const projectsError = useAppStore((s) => s.projectsError)
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
  // 메인 영역 한정 오버레이 — 첫 진입 + 워크스페이스 전환에서만 등장.
  // 명시 새로고침(이미 projects 데이터를 보고 있는 상태) 에는 띄우지 않음 — 깜빡임 방지.
  // 진행 신호는 Sidebar 새로고침 버튼 회전 + AllProjectsView 헤더 inline 진행률로 대체.
  // 풀스크린이 아니므로 Sidebar 는 오버레이 아래에서 상시 조작 가능(다른 워크스페이스 전환 탈출구).
  const showInitialOverlay = shouldShowInitialOverlay({
    activeWorkspaceId,
    projectsCount: projects.length,
    projectsLoading,
    isDocCounting,
  })
  // 스캔 에러 / 타임아웃 오버레이 — 재설치·업그레이드로 persist 된 워크스페이스가
  // 현재 환경에서 동작 안 하는 경우 사용자에게 재시도/제거 출구 제공.
  const showScanErrorOverlay = !!activeWorkspaceId && !projectsLoading && !!projectsError
  const docPct = docCountProgress.total > 0
    ? Math.round((docCountProgress.done / docCountProgress.total) * 100)
    : 0

  const handleRetryScan = useCallback(() => {
    useAppStore.getState().setProjectsError(null)
    useAppStore.getState().bumpRefreshKey()
  }, [])

  // 글로벌 새로고침 — Sidebar 버튼 + ⌘R 단축키 공통 진입점.
  // 워크스페이스 미선택 시는 스캔 트리거 의미 없음 — 버튼은 disabled, hotkey 는 no-op.
  const handleGlobalRefresh = useCallback(() => {
    if (!activeWorkspaceId) return
    useAppStore.getState().setProjectsError(null)
    useAppStore.getState().bumpRefreshKey()
  }, [activeWorkspaceId])
  // ⌘R — Mail/Slack/Activity Monitor 등 macOS 표준 새로고침 단축키.
  // useGlobalHotkey 가 preventDefault 하므로 Electron default 메뉴의 reload 가로채는 효과.
  useGlobalHotkey('r', handleGlobalRefresh, { meta: true })

  const isGlobalRefreshing = !!activeWorkspaceId && (projectsLoading || isDocCounting)

  const handleRemoveActiveWorkspace = useCallback(async () => {
    if (!activeWorkspaceId) return
    await removeWorkspace(activeWorkspaceId)
    useAppStore.getState().setProjectsError(null)
  }, [activeWorkspaceId, removeWorkspace])

  const activeProject = activeProjectId
    ? projects.find((p) => p.id === activeProjectId) ?? null
    : null

  const showOnboarding = !composerOnboardingSeen && workspaces.length > 0

  // 워크스페이스가 없을 때 메인 영역에 1차 CTA
  if (workspaces.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'transparent', color: 'var(--text)' }}>
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
          onRefresh={handleGlobalRefresh}
          isRefreshing={isGlobalRefreshing}
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'transparent', color: 'var(--text)' }}>
      {/* M3 S2 후반부 — TOFU 모달. queue 비었을 때 null 반환이라 상시 mount 안전. */}
      <SshHostKeyPrompt />
      {/* Follow-up FS2 — SSH workspace 추가 폼. flag on + experimental 체크 시에만 트리거. */}
      <SshWorkspaceAddModal
        open={sshModalOpen}
        onClose={() => setSshModalOpen(false)}
        onSubmit={handleSshSubmit}
      />
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
        onRefresh={handleGlobalRefresh}
        isRefreshing={isGlobalRefreshing}
      />

      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
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
        {showScanErrorOverlay && (
          <div className="app-loading-overlay" role="alert" aria-live="assertive">
            <div className="app-loading-overlay__icon" aria-hidden="true">⚠️</div>
            <div className="app-loading-overlay__title">
              {projectsError === 'SCAN_TIMEOUT'
                ? t('loading.timeoutTitle')
                : t('loading.errorTitle')}
            </div>
            <div className="app-loading-overlay__detail">
              {projectsError === 'SCAN_TIMEOUT'
                ? t('loading.timeoutDetail')
                : humanizeError(t, projectsError ?? '')}
            </div>
            <div className="app-loading-overlay__actions">
              <Button variant="primary" onClick={handleRetryScan}>
                {t('loading.retry')}
              </Button>
              <Button variant="ghost" onClick={handleRemoveActiveWorkspace}>
                {t('loading.removeWorkspace')}
              </Button>
            </div>
            <div className="app-loading-overlay__hint">{t('loading.switchHint')}</div>
          </div>
        )}
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
                  onSeeMoreRecent={handleSeeMoreRecent}
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
