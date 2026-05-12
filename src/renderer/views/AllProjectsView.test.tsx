/**
 * @vitest-environment jsdom
 *
 * Self-QA: the first-project path should not leave a new user staring at a
 * plain project card with no obvious next step. The single-project workspace
 * gets a direct Project Wiki entry point, while larger workspaces keep the
 * normal list/grid browsing behavior.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installApiMock } from '../__test-utils__/apiMock'
import { fireEvent, renderWithProviders, screen } from '../__test-utils__/render'
import { useAppStore } from '../state/store'
import type { Project } from '../../preload/types'
import { AllProjectsView } from './AllProjectsView'

const workspaceId = '11111111-1111-4111-8111-111111111111'

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'abcdef12',
    workspaceId,
    name: 'markwand',
    root: '/workspace/markwand',
    markers: [],
    docCount: 12,
    lastModified: Date.parse('2026-05-12T00:00:00Z'),
    ...overrides,
  }
}

beforeEach(() => {
  installApiMock()
  useAppStore.getState().setDocs([])
  useAppStore.setState({
    projects: [],
    projectsLoading: false,
    projectsError: null,
    docCountProgress: { done: 0, total: 0 },
    sortOrder: 'recent',
    viewLayout: 'grid',
    docs: [],
    docsByProject: new Map(),
    frontmatterIndex: { statuses: new Set(), sources: new Set() },
    metaFilter: { tags: [], statuses: [], sources: [], updatedRange: 'all' },
  })
})

describe('AllProjectsView — first project aha path', () => {
  it('shows a direct Project Wiki entry point when the workspace has one project', () => {
    const project = makeProject()
    const onOpenProject = vi.fn()
    useAppStore.setState({ projects: [project] })

    renderWithProviders(
      <AllProjectsView workspaceId={workspaceId} onOpenProject={onOpenProject} />
    )

    expect(screen.getByLabelText('allProjects.aha.aria')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'allProjects.aha.openAria' }))

    expect(onOpenProject).toHaveBeenCalledWith(project)
  })

  it('keeps multi-project workspaces focused on browsing instead of showing the first-project prompt', () => {
    useAppStore.setState({
      projects: [
        makeProject({ id: 'p1', name: 'alpha', lastModified: 10 }),
        makeProject({ id: 'p2', name: 'beta', root: '/workspace/beta', lastModified: 20 }),
      ],
    })

    renderWithProviders(
      <AllProjectsView workspaceId={workspaceId} onOpenProject={vi.fn()} />
    )

    expect(screen.queryByLabelText('allProjects.aha.aria')).not.toBeInTheDocument()
  })
})
