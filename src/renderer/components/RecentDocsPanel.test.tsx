/**
 * @vitest-environment jsdom
 *
 * 자가 검증: 최근 문서 패널의 "+N개 더" 가 실제로 클릭 가능하고 onSeeMore 를 호출하는지.
 * 사용자 dogfood 에서 발견된 "+140개 더가 보이는데 확인할 수 없어 아쉽다" 회귀 차단.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithProviders, screen, userEvent } from '../__test-utils__/render'
import { RecentDocsPanel } from './RecentDocsPanel'
import type { Doc } from '../../preload/types'

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = {
    prefs: {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
    },
  }
})

function makeDocs(count: number): Doc[] {
  const now = Date.now()
  return Array.from({ length: count }, (_, i) => ({
    path: `/abs/proj/doc-${i}.md`,
    projectId: 'p1',
    name: `doc-${i}.md`,
    mtime: now - i * 1000,
  }))
}

// hydration: collapsed/activeTab prefs 응답 후에야 렌더하므로
// renderWithProviders 호출 후 상태 안착될 때까지 findBy* 로 기다린다.
async function waitForPanel(): Promise<void> {
  await screen.findByText(/projectView\.recentDocs\.title/)
}

describe('RecentDocsPanel — "+N개 더" 클릭 가능 (인박스 라우팅)', () => {
  it('overflow > 0 + onSeeMore 제공 시 button 으로 렌더 + 클릭 호출', async () => {
    const onSeeMore = vi.fn()
    const docs = makeDocs(15) // MAX_ITEMS=10 → overflow=5
    renderWithProviders(
      <RecentDocsPanel
        docs={docs}
        selectedPath={null}
        onSelect={vi.fn()}
        onSeeMore={onSeeMore}
      />
    )
    await waitForPanel()
    // i18n mock 이 key identity 반환 — moreCountAria 가 그대로 aria-label.
    const btn = await screen.findByRole('button', { name: /moreCountAria/ })
    expect(btn).toBeInTheDocument()
    await userEvent.setup().click(btn)
    expect(onSeeMore).toHaveBeenCalledOnce()
  })

  it('onSeeMore 미지정 시 정적 텍스트로 fallback (하위 호환)', async () => {
    const docs = makeDocs(15)
    renderWithProviders(
      <RecentDocsPanel
        docs={docs}
        selectedPath={null}
        onSelect={vi.fn()}
      />
    )
    await waitForPanel()
    const btnList = screen.queryAllByRole('button', { name: /moreCountAria/ })
    expect(btnList).toHaveLength(0)
    // 정적 텍스트 fallback 은 moreCount 키 식별자가 그대로 보임.
    expect(screen.getByText(/projectView\.recentDocs\.moreCount/)).toBeInTheDocument()
  })

  it('overflow === 0 (10개 이하) 이면 더보기 영역 자체 미렌더', async () => {
    const onSeeMore = vi.fn()
    const docs = makeDocs(5)
    renderWithProviders(
      <RecentDocsPanel
        docs={docs}
        selectedPath={null}
        onSelect={vi.fn()}
        onSeeMore={onSeeMore}
      />
    )
    await waitForPanel()
    const btnList = screen.queryAllByRole('button', { name: /moreCountAria/ })
    expect(btnList).toHaveLength(0)
  })
})
