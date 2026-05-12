/**
 * @vitest-environment jsdom
 *
 * Sidebar 글로벌 새로고침 + 버전 표시 자가 검증 (CLAUDE.md "Self-QA First").
 *
 * 사전 점검 (race / edge):
 * - activeWorkspaceId 가 null 일 때 onRefresh 가 disabled 되어 호출되지 않아야 한다 (스캔 무의미).
 * - isRefreshing 중 재클릭 방지 (중복 IPC 차단).
 * - 버전 텍스트는 build-time 주입된 __APP_VERSION__ 으로 노출되고 자동/수동 업데이트 확인을 수행.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderWithProviders, screen, userEvent, waitFor } from '../__test-utils__/render'
import { Sidebar } from './Sidebar'
import { toast } from './ui'

const UPDATE_AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

beforeEach(() => {
  // Sidebar 자식 컴포넌트(Settings 등) 가 mount 시 prefs.get 호출. 안전한 stub.
  ;(window as unknown as { api: unknown }).api = {
    prefs: {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
    },
    ssh: {
      purgeAll: vi.fn().mockResolvedValue(undefined),
    },
    updates: {
      check: vi.fn().mockResolvedValue({
        status: 'up-to-date',
        currentVersion: '0.4.0-beta.11',
        latestVersion: '0.4.0-beta.11',
        checkedAt: 0,
      }),
    },
    shell: {
      openExternal: vi.fn().mockResolvedValue(undefined),
    },
    theme: { set: vi.fn().mockResolvedValue(undefined) },
  }
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const baseProps = {
  workspaces: [],
  viewMode: 'all' as const,
  onWorkspaceSelect: vi.fn(),
  onWorkspaceAdd: vi.fn(),
  onWorkspaceRemove: vi.fn().mockResolvedValue(undefined),
  onViewModeChange: vi.fn(),
}

describe('Sidebar — 글로벌 새로고침 버튼', () => {
  it('워크스페이스 미선택(activeWorkspaceId=null)일 때 새로고침 버튼은 disabled', () => {
    const onRefresh = vi.fn()
    renderWithProviders(
      <Sidebar
        {...baseProps}
        activeWorkspaceId={null}
        onRefresh={onRefresh}
        isRefreshing={false}
      />
    )
    const btn = screen.getByRole('button', { name: 'sidebar.refresh' })
    expect(btn).toBeDisabled()
  })

  it('워크스페이스 활성 상태에서 클릭 시 onRefresh 호출', async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    renderWithProviders(
      <Sidebar
        {...baseProps}
        activeWorkspaceId="local:/abs/path"
        onRefresh={onRefresh}
        isRefreshing={false}
      />
    )
    await user.click(screen.getByRole('button', { name: 'sidebar.refresh' }))
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('isRefreshing 진행 중일 때 disabled + aria-label 이 진행 상태 키로 전환', async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    renderWithProviders(
      <Sidebar
        {...baseProps}
        activeWorkspaceId="local:/abs/path"
        onRefresh={onRefresh}
        isRefreshing={true}
      />
    )
    const btn = screen.getByRole('button', { name: 'sidebar.refreshing' })
    expect(btn).toBeDisabled()
    await user.click(btn).catch(() => {})
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('title 속성에 단축키 안내가 들어있다 (마우스 사용자 가시성)', () => {
    renderWithProviders(
      <Sidebar
        {...baseProps}
        activeWorkspaceId="local:/abs/path"
        onRefresh={vi.fn()}
      />
    )
    const btn = screen.getByRole('button', { name: 'sidebar.refresh' })
    // i18n mock 이 key identity 반환 — 키가 매핑되어 있으면 OK
    expect(btn).toHaveAttribute('title', 'sidebar.refreshTooltip')
  })
})

describe('Sidebar — 버전 표시', () => {
  it('build-time 주입된 __APP_VERSION__ 을 항상 노출 (사용자 버전 보고 수단)', () => {
    renderWithProviders(
      <Sidebar
        {...baseProps}
        activeWorkspaceId={null}
        onRefresh={vi.fn()}
      />
    )
    // vitest.config.ts 의 define 으로 package.json 의 version 이 주입됨.
    // 정확한 값을 hard-code 하지 않고 prefix 'v' 와 dot 포함 패턴으로 검증 — 베타 bump 시에도 회귀 안 남.
    const versionEl = screen.getByText(/^v\d+\.\d+\.\d+/)
    expect(versionEl).toBeInTheDocument()
  })

  it('버전 표시 클릭 시 업데이트 확인 IPC를 호출한다', async () => {
    const user = userEvent.setup()
    const api = (window as unknown as {
      api: { updates: { check: ReturnType<typeof vi.fn> } }
    }).api
    renderWithProviders(
      <Sidebar
        {...baseProps}
        activeWorkspaceId={null}
        onRefresh={vi.fn()}
      />
    )
    await waitFor(() => expect(api.updates.check).toHaveBeenCalledTimes(1))
    api.updates.check.mockClear()

    await user.click(screen.getByRole('button', { name: 'updates.checkAria' }))

    expect(api.updates.check).toHaveBeenCalledOnce()
  })

  it('앱 시작 시 자동 확인으로 새 버전이 있으면 헤더에 업데이트 배지를 표시한다', async () => {
    const api = (window as unknown as {
      api: { updates: { check: ReturnType<typeof vi.fn> } }
    }).api
    api.updates.check.mockResolvedValueOnce({
      status: 'update-available',
      currentVersion: '0.4.0-beta.11',
      latestVersion: '0.4.0-beta.12',
      releaseUrl: 'https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.12',
      checkedAt: 1,
    })
    renderWithProviders(
      <Sidebar
        {...baseProps}
        activeWorkspaceId={null}
        onRefresh={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'updates.availableAria' })).toBeInTheDocument()
    })
    expect(screen.getByText('updates.availableBadge')).toBeInTheDocument()
  })

  it('앱을 계속 켜둔 경우에도 주기적으로 업데이트를 다시 확인한다', async () => {
    vi.useFakeTimers()
    const api = (window as unknown as {
      api: { updates: { check: ReturnType<typeof vi.fn> } }
    }).api
    renderWithProviders(
      <Sidebar
        {...baseProps}
        activeWorkspaceId={null}
        onRefresh={vi.fn()}
      />
    )
    expect(api.updates.check).toHaveBeenCalledTimes(1)
    api.updates.check.mockClear()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_AUTO_CHECK_INTERVAL_MS)
    })

    expect(api.updates.check).toHaveBeenCalledTimes(1)
  })

  it('실행 중인 앱의 preload가 아직 구버전이면 TypeError 대신 재시작 안내를 띄운다', async () => {
    const user = userEvent.setup()
    const toastSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'toast-test-id')
    ;(window as unknown as { api: unknown }).api = {
      prefs: {
        get: vi.fn().mockResolvedValue(undefined),
        set: vi.fn().mockResolvedValue(undefined),
      },
      ssh: {
        purgeAll: vi.fn().mockResolvedValue(undefined),
      },
      shell: {
        openExternal: vi.fn().mockResolvedValue(undefined),
      },
      theme: { set: vi.fn().mockResolvedValue(undefined) },
    }
    renderWithProviders(
      <Sidebar
        {...baseProps}
        activeWorkspaceId={null}
        onRefresh={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'updates.checkAria' }))

    expect(toastSpy).toHaveBeenCalledWith('updates.preloadUnavailable')
  })

  it('새 릴리스가 있으면 버전 버튼이 업데이트 가능 상태로 바뀐다', async () => {
    const user = userEvent.setup()
    const api = (window as unknown as {
      api: { updates: { check: ReturnType<typeof vi.fn> } }
    }).api
    renderWithProviders(
      <Sidebar
        {...baseProps}
        activeWorkspaceId={null}
        onRefresh={vi.fn()}
      />
    )
    await waitFor(() => expect(api.updates.check).toHaveBeenCalledTimes(1))
    api.updates.check.mockClear()
    api.updates.check.mockResolvedValueOnce({
      status: 'update-available',
      currentVersion: '0.4.0-beta.11',
      latestVersion: '0.4.0-beta.12',
      releaseUrl: 'https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.12',
      downloadUrl: 'https://github.com/givepro91/markwand/releases/download/v0.4.0-beta.12/Markwand.zip',
      checkedAt: 1,
    })

    await user.click(screen.getByRole('button', { name: 'updates.checkAria' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'updates.availableAria' })).toBeInTheDocument()
    })

    api.updates.check.mockClear()
    await user.click(screen.getByRole('button', { name: 'updates.availableAria' }))

    expect(api.updates.check).not.toHaveBeenCalled()
    expect((window as unknown as { api: { shell: { openExternal: ReturnType<typeof vi.fn> } } }).api.shell.openExternal)
      .toHaveBeenCalledWith('https://github.com/givepro91/markwand/releases/download/v0.4.0-beta.12/Markwand.zip')
  })
})

describe('Sidebar — Markwand 가이드', () => {
  it('상단에 항상 보이는 가이드 버튼으로 제품 의도 설명 모달을 연다', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <Sidebar
        {...baseProps}
        activeWorkspaceId={null}
        onRefresh={vi.fn()}
      />
    )

    const guideButton = screen.getByRole('button', { name: 'productGuide.openAria' })
    expect(guideButton).toHaveAttribute('title', 'productGuide.openTitle')

    await user.click(guideButton)

    expect(screen.getByRole('dialog', { name: 'productGuide.title' })).toBeInTheDocument()
    expect(screen.getByText('productGuide.sections.wiki.title')).toBeInTheDocument()
    expect(screen.getByText('productGuide.sections.search.title')).toBeInTheDocument()
  })
})
