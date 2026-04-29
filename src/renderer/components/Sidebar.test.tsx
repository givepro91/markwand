/**
 * @vitest-environment jsdom
 *
 * Sidebar 글로벌 새로고침 + 버전 표시 자가 검증 (CLAUDE.md "Self-QA First").
 *
 * 사전 점검 (race / edge):
 * - activeWorkspaceId 가 null 일 때 onRefresh 가 disabled 되어 호출되지 않아야 한다 (스캔 무의미).
 * - isRefreshing 중 재클릭 방지 (중복 IPC 차단).
 * - 버전 텍스트는 build-time 주입된 __APP_VERSION__ 으로 항상 노출 (사용자 버전 보고 수단).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithProviders, screen, userEvent } from '../__test-utils__/render'
import { Sidebar } from './Sidebar'

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
    theme: { set: vi.fn().mockResolvedValue(undefined) },
  }
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
})
