/**
 * @vitest-environment jsdom
 *
 * Self-QA: Drift jump actions carry the verified source line so ProjectView can
 * jump to the exact occurrence even when the same path text appears elsewhere.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DriftReport } from '../../preload/types'
import { installApiMock } from '../__test-utils__/apiMock'
import { fireEvent, renderWithProviders, screen } from '../__test-utils__/render'
import { useAppStore } from '../state/store'
import { DriftPanel } from './DriftPanel'

const docPath = '/project/docs/design.md'
const projectRoot = '/project'

function report(): DriftReport {
  return {
    docPath,
    docMtime: 1,
    projectRoot,
    references: [{
      raw: '@/docs/designs/scripts/db.py',
      resolvedPath: '/project/docs/designs/scripts/db.py',
      reportMissing: true,
      kind: 'at',
      line: 170,
      col: 12,
      status: 'missing',
    }],
    counts: { ok: 0, missing: 1, stale: 0 },
    verifiedAt: 1,
  }
}

function duplicatePathReport(): DriftReport {
  const base = report()
  return {
    ...base,
    references: [
      { ...base.references[0], line: 170, col: 12 },
      { ...base.references[0], line: 327, col: 12 },
      { ...base.references[0], line: 337, col: 12 },
      { ...base.references[0], line: 771, col: 12 },
    ],
    counts: { ok: 0, missing: 4, stale: 0 },
  }
}

beforeEach(() => {
  installApiMock()
  useAppStore.setState({
    driftReports: { [docPath]: report() },
    ignoredDriftRefs: {},
  })
})

describe('DriftPanel', () => {
  it('passes raw text and source line to the jump handler', () => {
    const onJumpToRef = vi.fn()
    renderWithProviders(
      <DriftPanel docPath={docPath} projectRoot={projectRoot} onJumpToRef={onJumpToRef} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'drift.ariaToggle' }))
    fireEvent.click(screen.getByRole('button', { name: 'drift.jumpLabel' }))

    expect(onJumpToRef).toHaveBeenCalledWith({
      raw: '@/docs/designs/scripts/db.py',
      line: 170,
      col: 12,
    })
  })

  it('keeps side panel expanded so reference actions remain reachable while reading', () => {
    renderWithProviders(
      <DriftPanel docPath={docPath} projectRoot={projectRoot} variant="side" onJumpToRef={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: 'drift.ariaToggle' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'drift.jumpLabel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'drift.ignore' })).toBeInTheDocument()
  })

  it('ignores only the clicked occurrence when the same path appears multiple times', () => {
    useAppStore.setState({
      driftReports: { [docPath]: duplicatePathReport() },
      ignoredDriftRefs: {},
    })

    renderWithProviders(
      <DriftPanel docPath={docPath} projectRoot={projectRoot} variant="side" onJumpToRef={vi.fn()} />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'drift.ignore' })[1])

    const ignored = useAppStore.getState().ignoredDriftRefs[docPath]
    expect(ignored).toHaveLength(1)
    expect(ignored[0]).toContain('\u001f327\u001f12\u001fat\u001f')
    expect(screen.getAllByRole('button', { name: 'drift.ignore' })).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'drift.unignore' })).toBeInTheDocument()
  })
})
