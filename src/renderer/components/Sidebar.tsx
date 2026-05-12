import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WorkspacePicker } from './WorkspacePicker'
import { ThemeToggle } from './ThemeToggle'
import { Settings } from './Settings'
import { ProductGuideModal } from './ProductGuideModal'
import { IconButton, toast } from './ui'
import { useTheme } from '../hooks/useTheme'
import type { UpdateCheckResult, Workspace, ViewMode } from '../../../src/preload/types'

interface SidebarProps {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  viewMode: ViewMode
  onWorkspaceSelect: (id: string) => void
  onWorkspaceAdd: () => void
  /** Follow-up FS2 — SSH workspace 추가 트리거. experimentalSsh 가 true 일 때만 호출됨. */
  onWorkspaceAddSsh?: () => void
  experimentalSsh?: boolean
  onWorkspaceRemove: (id: string) => Promise<void>
  onViewModeChange: (mode: ViewMode) => void
  /** 글로벌 새로고침 — 모든 뷰에서 활성. activeWorkspaceId 가 null 이면 비활성. */
  onRefresh: () => void
  /** 진행 중 표시 — IconButton disabled + 회전 애니메이션. */
  isRefreshing?: boolean
}

const RefreshIcon = ({ spinning }: { spinning?: boolean }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="currentColor"
    aria-hidden="true"
    style={{
      animation: spinning ? 'sidebar-refresh-spin 700ms linear infinite' : undefined,
    }}
  >
    <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
    <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" />
  </svg>
)

const GuideIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3.5 2.75h5.25A2.75 2.75 0 0 1 11.5 5.5v7.25H6.25A2.75 2.75 0 0 0 3.5 10V2.75Z" />
    <path d="M11.5 4.25h1A1.5 1.5 0 0 1 14 5.75v7H8.75" />
    <path d="M5.5 5.25h3" />
    <path d="M5.5 7.25h2" />
  </svg>
)

let spinStyleInjected = false
function ensureSpinStyle() {
  if (spinStyleInjected) return
  if (typeof document === 'undefined') return
  if (document.getElementById('sidebar-refresh-spin-style')) {
    spinStyleInjected = true
    return
  }
  const el = document.createElement('style')
  el.id = 'sidebar-refresh-spin-style'
  el.textContent = `
    @keyframes sidebar-refresh-spin {
      to { transform: rotate(360deg); }
    }
    @media (prefers-reduced-motion: reduce) {
      [data-sidebar-refresh-spin] { animation: none !important; }
    }
  `
  document.head.appendChild(el)
  spinStyleInjected = true
}

const VIEW_TAB_KEYS: { value: ViewMode; labelKey: string; titleKey: string }[] = [
  { value: 'all', labelKey: 'sidebar.tabs.all', titleKey: 'sidebar.tabs.allTitle' },
  { value: 'inbox', labelKey: 'sidebar.tabs.inbox', titleKey: 'sidebar.tabs.inboxTitle' },
  { value: 'project', labelKey: 'sidebar.tabs.project', titleKey: 'sidebar.tabs.projectTitle' },
]

const UPDATE_AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export function Sidebar({
  workspaces,
  activeWorkspaceId,
  viewMode,
  onWorkspaceSelect,
  onWorkspaceAdd,
  onWorkspaceAddSsh,
  experimentalSsh,
  onWorkspaceRemove,
  onViewModeChange,
  onRefresh,
  isRefreshing = false,
}: SidebarProps) {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const [guideOpen, setGuideOpen] = useState(false)
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState<{
    version: string
    releaseUrl?: string
    downloadUrl?: string
    releaseName?: string
  } | null>(null)
  ensureSpinStyle()
  const refreshDisabled = !activeWorkspaceId || isRefreshing
  const updateAvailableVersion = updateAvailable?.version ?? null
  const updateLabel = updateChecking
    ? t('updates.checking')
    : updateAvailableVersion
      ? t('updates.availableAria', { version: updateAvailableVersion })
      : t('updates.checkAria', { version: __APP_VERSION__ })
  const updateTitle = updateAvailableVersion
    ? t('updates.availableTitle', { version: updateAvailableVersion })
    : updateLabel

  const applyUpdateResult = (result: UpdateCheckResult, notify: boolean) => {
    if (result.status === 'update-available') {
      const version = result.latestVersion ?? result.releaseName ?? ''
      const targetUrl = result.downloadUrl ?? result.releaseUrl
      setUpdateAvailable(version ? {
        version,
        releaseUrl: result.releaseUrl,
        downloadUrl: result.downloadUrl,
        releaseName: result.releaseName,
      } : null)
      if (notify) {
        toast.info(t('updates.available', { version }), {
          durationMs: 8000,
          action: targetUrl
            ? {
                label: result.downloadUrl ? t('updates.openDownload') : t('updates.openRelease'),
                onClick: () => {
                  void window.api.shell.openExternal(targetUrl)
                },
              }
            : undefined,
        })
      }
      return
    }

    if (result.status === 'up-to-date') {
      setUpdateAvailable(null)
      if (notify) toast.success(t('updates.upToDate', { version: result.currentVersion }))
      return
    }

    if (notify) {
      toast.error(t('updates.checkFailed', {
        reason: result.reason ?? t('updates.unknownError'),
      }))
    }
  }

  useEffect(() => {
    let active = true
    const runAutoCheck = () => {
      const checkUpdates = window.api.updates?.check
      if (!checkUpdates) return
      void checkUpdates()
        .then((result) => {
          if (!active) return
          applyUpdateResult(result, false)
        })
        .catch(() => {})
    }

    runAutoCheck()
    const interval = window.setInterval(runAutoCheck, UPDATE_AUTO_CHECK_INTERVAL_MS)

    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  const handleCheckForUpdates = async () => {
    if (updateChecking) return
    const checkUpdates = window.api.updates?.check
    if (!checkUpdates) {
      toast.error(t('updates.preloadUnavailable'))
      return
    }
    setUpdateChecking(true)
    try {
      const result = await checkUpdates()
      applyUpdateResult(result, true)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      toast.error(t('updates.checkFailed', { reason }))
    } finally {
      setUpdateChecking(false)
    }
  }

  const handleUpdateButtonClick = () => {
    const targetUrl = updateAvailable?.downloadUrl ?? updateAvailable?.releaseUrl
    if (updateAvailable && targetUrl) {
      void window.api.shell.openExternal(targetUrl)
      return
    }
    void handleCheckForUpdates()
  }

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-3)',
        padding: 'var(--sp-3) var(--sp-4)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-glass)',
        backdropFilter: 'blur(18px)',
        boxShadow: 'var(--shadow-sm)',
        flexShrink: 0,
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <WorkspacePicker
          workspaces={workspaces}
          activeId={activeWorkspaceId}
          onSelect={onWorkspaceSelect}
          onAdd={onWorkspaceAdd}
          onAddSsh={onWorkspaceAddSsh}
          experimentalSsh={experimentalSsh}
          onRemove={onWorkspaceRemove}
        />
      </div>

      <div
        role="tablist"
        aria-label={t('sidebar.viewMode')}
        style={{
          display: 'flex',
          gap: 'var(--sp-1)',
          background: 'color-mix(in srgb, var(--bg-hover) 72%, transparent)',
          border: '1px solid var(--border-muted)',
          borderRadius: 'var(--r-pill)',
          padding: '3px',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        {VIEW_TAB_KEYS.map((tab) => {
          const isActive = viewMode === tab.value
          return (
            <button
              key={tab.value}
              role="tab"
              aria-selected={isActive}
              title={t(tab.titleKey)}
              onClick={() => onViewModeChange(tab.value)}
              style={{
                padding: 'var(--sp-1) var(--sp-3)',
                border: 'none',
                borderRadius: 'var(--r-pill)',
                fontSize: 'var(--fs-sm)',
                background: isActive ? 'linear-gradient(135deg, var(--accent), var(--accent-hover))' : 'transparent',
                color: isActive ? 'var(--accent-contrast)' : 'var(--text-muted)',
                boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                fontWeight: isActive ? 'var(--fw-medium)' : 'var(--fw-normal)',
                transition: 'background var(--duration-fast) var(--ease-standard)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t(tab.labelKey)}
            </button>
          )
        })}
      </div>

      <div
        style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <IconButton
          aria-label={t('productGuide.openAria')}
          title={t('productGuide.openTitle')}
          size="sm"
          variant={guideOpen ? 'primary' : 'ghost'}
          aria-pressed={guideOpen}
          onClick={() => setGuideOpen(true)}
        >
          <GuideIcon />
        </IconButton>
        <IconButton
          aria-label={isRefreshing ? t('sidebar.refreshing') : t('sidebar.refresh')}
          title={t('sidebar.refreshTooltip')}
          size="sm"
          variant="ghost"
          onClick={onRefresh}
          disabled={refreshDisabled}
        >
          <RefreshIcon spinning={isRefreshing} />
        </IconButton>
        <button
          type="button"
          aria-label={updateLabel}
          title={updateTitle}
          onClick={handleUpdateButtonClick}
          disabled={updateChecking}
          style={{
            border: updateAvailableVersion
              ? '1px solid color-mix(in srgb, var(--accent) 35%, transparent)'
              : '1px solid transparent',
            borderRadius: 'var(--r-pill)',
            background: updateAvailableVersion
              ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
              : 'transparent',
            fontSize: 'var(--fs-xs)',
            color: updateAvailableVersion ? 'var(--accent)' : 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums',
            fontFamily: 'inherit',
            fontWeight: updateAvailableVersion ? 'var(--fw-medium)' : 'var(--fw-normal)',
            padding: '2px 6px',
            userSelect: 'text',
            whiteSpace: 'nowrap',
            cursor: updateChecking ? 'wait' : 'pointer',
            opacity: updateChecking ? 0.72 : 1,
          }}
        >
          {updateChecking
            ? t('updates.checkingShort')
            : updateAvailableVersion
              ? t('updates.availableBadge')
              : `v${__APP_VERSION__}`}
        </button>
        <ThemeToggle value={theme} onChange={setTheme} />
        <Settings />
      </div>
      {guideOpen && <ProductGuideModal onClose={() => setGuideOpen(false)} />}
    </header>
  )
}
