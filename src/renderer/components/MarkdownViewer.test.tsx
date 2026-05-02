/**
 * @vitest-environment jsdom
 *
 * Self-QA: Drift source-line jumping depends on rendered markdown nodes keeping
 * their original markdown line range.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { installApiMock } from '../__test-utils__/apiMock'
import { renderWithProviders, screen } from '../__test-utils__/render'
import { MarkdownViewer } from './MarkdownViewer'

beforeEach(() => {
  installApiMock()
})

describe('MarkdownViewer', () => {
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
  })
})
