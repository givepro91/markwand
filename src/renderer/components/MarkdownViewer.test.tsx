/**
 * @vitest-environment jsdom
 *
 * Self-QA: Drift source-line jumping depends on rendered markdown nodes keeping
 * their original markdown line range.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installApiMock } from '../__test-utils__/apiMock'
import { fireEvent, renderWithProviders, screen, waitFor } from '../__test-utils__/render'
import { MarkdownViewer } from './MarkdownViewer'

const mermaidMock = vi.hoisted(() => ({
  renderMermaid: vi.fn(),
  onMermaidThemeChange: vi.fn(() => () => {}),
}))

vi.mock('../lib/mermaid', () => mermaidMock)

beforeEach(() => {
  installApiMock()
  mermaidMock.renderMermaid.mockReset()
  mermaidMock.renderMermaid.mockResolvedValue({ ok: true, svg: '<svg data-testid="mermaid-svg"></svg>' })
  mermaidMock.onMermaidThemeChange.mockClear()
})

function installIntersectingObserver() {
  class ImmediateIntersectionObserver implements IntersectionObserver {
    readonly root = null
    readonly rootMargin = ''
    readonly thresholds = [0.1]

    constructor(private readonly callback: IntersectionObserverCallback) {}

    disconnect() {}
    observe(target: Element) {
      this.callback(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        this
      )
    }
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
    unobserve() {}
  }

  window.IntersectionObserver = ImmediateIntersectionObserver
  globalThis.IntersectionObserver = ImmediateIntersectionObserver
}

describe('MarkdownViewer', () => {
  it.each([
    ['NOTE', 'Note', 'markdown-alert--note', 'ⓘ'],
    ['TIP', 'Tip', 'markdown-alert--tip', '✦'],
    ['IMPORTANT', 'Important', 'markdown-alert--important', '!'],
    ['WARNING', 'Warning', 'markdown-alert--warning', '⚠'],
    ['CAUTION', 'Caution', 'markdown-alert--caution', '⛔'],
  ])('renders GFM %s alerts as callouts without exposing the marker', (marker, label, className, icon) => {
    renderWithProviders(
      <MarkdownViewer
        content={`> [!${marker}]\n> 본문`}
        basePath="/project/docs/state.md"
        onDocNavigate={() => {}}
      />,
    )

    const alert = screen.getByText(label).closest('[role="note"]')
    expect(alert).toHaveClass('markdown-alert', className)
    expect(alert).toHaveAttribute('data-alert-type', marker.toLowerCase())
    expect(alert).toHaveTextContent(icon)
    expect(alert).toHaveTextContent('본문')
    expect(alert).not.toHaveTextContent(`[!${marker}]`)
  })

  it('keeps alert body markdown rendered after blank quote lines', () => {
    renderWithProviders(
      <MarkdownViewer
        content={'> [!IMPORTANT]\n> 다음 행동 (택1)\n>\n> - (a) 옵션 1\n> - (b) 옵션 2'}
        basePath="/project/docs/state.md"
        onDocNavigate={() => {}}
      />,
    )

    const alert = screen.getByText('Important').closest('[role="note"]')
    expect(alert).toHaveClass('markdown-alert--important')
    expect(screen.getByText('(a) 옵션 1')).toBeInTheDocument()
    expect(screen.getByText('(b) 옵션 2')).toBeInTheDocument()
  })

  it('keeps inline code inside alert bodies', () => {
    renderWithProviders(
      <MarkdownViewer
        content={'> [!WARNING]\n> `scripts/release.sh` 실행 전 백업 필수'}
        basePath="/project/docs/state.md"
        onDocNavigate={() => {}}
      />,
    )

    const code = screen.getByText('scripts/release.sh')
    expect(code.tagName).toBe('CODE')
    expect(code.closest('[role="note"]')).toHaveClass('markdown-alert--warning')
  })

  it('falls back to a normal blockquote for non-alert quotes', () => {
    renderWithProviders(
      <MarkdownViewer
        content="> 일반 인용 텍스트"
        basePath="/project/docs/state.md"
        onDocNavigate={() => {}}
      />,
    )

    const quote = screen.getByText('일반 인용 텍스트').closest('blockquote')
    expect(quote).not.toHaveClass('markdown-alert')
  })

  it('falls back when alert markers are lowercase or not alone on the first quote line', () => {
    renderWithProviders(
      <MarkdownViewer
        content={'> [!note]\n> lowercase\n\n> [!NOTE] same line'}
        basePath="/project/docs/state.md"
        onDocNavigate={() => {}}
      />,
    )

    const lowercase = screen.getByText(/\[!note\]/).closest('blockquote')
    const sameLine = screen.getByText(/\[!NOTE\] same line/).closest('blockquote')
    expect(lowercase).not.toHaveClass('markdown-alert')
    expect(sameLine).not.toHaveClass('markdown-alert')
  })

  it('preserves source line ranges on alert callouts for Drift jump', () => {
    renderWithProviders(
      <MarkdownViewer
        content={'> [!TIP]\n>\n> 빈 줄 뒤 본문'}
        basePath="/project/docs/state.md"
        onDocNavigate={() => {}}
      />,
    )

    const alert = screen.getByText('Tip').closest('[role="note"]')
    expect(alert).toHaveAttribute('data-source-start', '1')
    expect(alert).toHaveAttribute('data-source-end', '3')
  })

  it('renders GFM task lists as read-only checkboxes', () => {
    const { container } = renderWithProviders(
      <MarkdownViewer
        content={'- [x] 완료한 작업\n- [ ] 남은 작업'}
        basePath="/project/docs/state.md"
        onDocNavigate={() => {}}
      />,
    )

    const checkboxes = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
    expect(checkboxes).toHaveLength(2)
    expect(checkboxes[0]).toBeChecked()
    expect(checkboxes[1]).not.toBeChecked()
    expect(checkboxes.every((checkbox) => checkbox.disabled)).toBe(true)
    expect(screen.getByText('완료한 작업').closest('li')).toHaveClass('task-list-item')
  })

  it('renders GFM footnotes with a distinct footnote section', () => {
    const { container } = renderWithProviders(
      <MarkdownViewer
        content={'결정 근거입니다.[^1]\n\n[^1]: 긴 상태 문서에서는 근거를 본문 밖으로 빼면 훑기 쉽습니다.'}
        basePath="/project/docs/state.md"
        onDocNavigate={() => {}}
      />,
    )

    expect(container.querySelector('[data-footnotes="true"], .footnotes')).toBeInTheDocument()
    expect(screen.getByText('Footnotes')).toBeInTheDocument()
    expect(screen.getByText(/긴 상태 문서에서는 근거/)).toBeInTheDocument()
  })

  it('renders safe details blocks with markdown body content', () => {
    renderWithProviders(
      <MarkdownViewer
        content={[
          '<details open>',
          '<summary>📦 <strong>Archive</strong></summary>',
          '',
          '- 접힌 본문도 **마크다운** 처리',
          '',
          '</details>',
        ].join('\n')}
        basePath="/project/docs/state.md"
        onDocNavigate={() => {}}
      />,
    )

    const details = screen.getByText('📦 Archive').closest('details')
    expect(details).toHaveClass('markdown-safe-details')
    expect(details).toHaveAttribute('open')
    expect(details).toHaveAttribute('data-source-start', '1')
    expect(details).toHaveAttribute('data-source-end', '6')
    expect(screen.getByText(/접힌 본문도/)).toBeInTheDocument()
    expect(screen.getByText('마크다운').tagName).toBe('STRONG')
  })

  it('strips unsupported summary markup from safe details headers', () => {
    renderWithProviders(
      <MarkdownViewer
        content={'<details>\n<summary><img src=x onerror=alert(1)>Safe</summary>\n본문\n</details>'}
        basePath="/project/docs/state.md"
        onDocNavigate={() => {}}
      />,
    )

    const details = screen.getByText('Safe').closest('details')
    expect(details).toHaveClass('markdown-safe-details')
    expect(details?.querySelector('img')).not.toBeInTheDocument()
  })

  it('does not turn details markup inside fenced code into a collapsible block', () => {
    renderWithProviders(
      <MarkdownViewer
        content={[
          '```html',
          '<details open>',
          '<summary>Code sample</summary>',
          '본문',
          '</details>',
          '```',
        ].join('\n')}
        basePath="/project/docs/state.md"
        onDocNavigate={() => {}}
      />,
    )

    expect(document.querySelector('.markdown-safe-details')).not.toBeInTheDocument()
    expect(screen.getByText(/<details open>/).tagName).toBe('CODE')
  })

  it('does not turn details markup inside tilde fenced code into a collapsible block', () => {
    renderWithProviders(
      <MarkdownViewer
        content={[
          '~~~html',
          '<details>',
          '<summary>Code sample</summary>',
          '</details>',
          '~~~',
        ].join('\n')}
        basePath="/project/docs/state.md"
        onDocNavigate={() => {}}
      />,
    )

    expect(document.querySelector('.markdown-safe-details')).not.toBeInTheDocument()
    expect(screen.getByText(/<summary>Code sample<\/summary>/).tagName).toBe('CODE')
  })

  it('shows mermaid render failures with the source preserved', async () => {
    installIntersectingObserver()
    mermaidMock.renderMermaid.mockResolvedValue({ ok: false, message: 'Parse error on line 2' })

    renderWithProviders(
      <MarkdownViewer
        content={'```mermaid\ngraph TD\n  A -->\n```'}
        basePath="/project/docs/state.md"
        onDocNavigate={() => {}}
      />,
    )

    const error = await screen.findByRole('alert')
    expect(error).toHaveClass('mermaid-block--error')
    expect(error).toHaveTextContent('Mermaid diagram failed')
    expect(error).toHaveTextContent('Parse error on line 2')
    expect(screen.getByText('Source')).toBeInTheDocument()
    expect(screen.getByText(/graph TD/)).toBeInTheDocument()
  })

  it('shows unexpected mermaid loader failures instead of leaving a blank placeholder', async () => {
    installIntersectingObserver()
    mermaidMock.renderMermaid.mockRejectedValue(new Error('Failed to load mermaid'))

    renderWithProviders(
      <MarkdownViewer
        content={'```mermaid\ngraph TD\n  A --> B\n```'}
        basePath="/project/docs/state.md"
        onDocNavigate={() => {}}
      />,
    )

    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent('Failed to load mermaid')
    expect(screen.getByText(/A --> B/)).toBeInTheDocument()
  })

  it('scrolls same-document hash links to their heading target', async () => {
    const scrollIntoView = vi.fn()
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = scrollIntoView

    try {
      renderWithProviders(
        <MarkdownViewer
          content={'# Target Heading\n\n[Jump](#target-heading)'}
          basePath="/project/docs/state.md"
          onDocNavigate={() => {}}
        />,
      )

      fireEvent.click(screen.getByText('Jump'))

      const heading = screen.getByRole('heading', { name: 'Target Heading' })
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
      expect(heading).toHaveAttribute('data-drift-jump-target', 'true')

      await waitFor(() => {
        expect(heading).toHaveAttribute('data-drift-jump-target', 'true')
      })
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView
    }
  })

  it('ignores malformed same-document hash links without throwing', () => {
    renderWithProviders(
      <MarkdownViewer
        content={'[Broken hash](#broken%zz)'}
        basePath="/project/docs/state.md"
        onDocNavigate={() => {}}
      />,
    )

    expect(() => fireEvent.click(screen.getByText('Broken hash'))).not.toThrow()
  })

  it('renders source line ranges on block nodes used by Drift jump', () => {
    renderWithProviders(
      <MarkdownViewer
        content={'# Title\n\nFirst paragraph.\n\nSecond paragraph with @/same.md.'}
        basePath="/project/docs/design.md"
        onDocNavigate={() => {}}
      />,
    )

    const target = screen.getByText('Second paragraph with @/same.md.')
    expect(target).toHaveAttribute('data-source-start', '5')
    expect(target).toHaveAttribute('data-source-end', '5')
  })

  it('renders source line ranges for table cells used by Drift jump', () => {
    renderWithProviders(
      <MarkdownViewer
        content={'| File | Note |\n|---|---|\n| `config/ownership.local.yaml` | missing |'}
        basePath="/project/docs/design.md"
        onDocNavigate={() => {}}
      />,
    )

    const target = screen.getByText('config/ownership.local.yaml').closest('td')
    expect(target).toHaveAttribute('data-source-start', '3')
    expect(target).toHaveAttribute('data-source-end', '3')
    expect(target?.closest('.markdown-table-scroll')).toHaveAttribute('data-source-start', '1')
    expect(target?.closest('.markdown-table-scroll')).toHaveAttribute('data-source-end', '3')
  })
})
