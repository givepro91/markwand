/**
 * @vitest-environment jsdom
 *
 * Self-QA: after opening a document, users need a visible in-content way back
 * to the Project Wiki. The tiny icon-only toggle is not enough discoverability.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installApiMock } from '../__test-utils__/apiMock'
import { fireEvent, renderWithProviders, screen, userEvent, waitFor } from '../__test-utils__/render'
import type { Doc, Project, Workspace } from '../../preload/types'
import { useAppStore } from '../state/store'
import { getDocumentRailWidth, getDocumentStickyOffset, getTocActionState, ProjectActionButton, ProjectDocReturnBar, ProjectFindControls, ProjectView } from './ProjectView'

const workspace: Workspace = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Local',
  root: '/project',
  mode: 'single',
  transport: { type: 'local' },
  addedAt: 0,
  lastOpened: null,
}

const project: Project = {
  id: 'abcdef12',
  workspaceId: workspace.id,
  name: 'Project',
  root: '/project',
  markers: [],
  docCount: 1,
  lastModified: 1,
}

beforeEach(() => {
  installApiMock()
  useAppStore.getState().setDocs([])
  useAppStore.setState({
    workspaces: [],
    projects: [],
    activeWorkspaceId: null,
    activeProjectId: null,
    pendingDocOpen: null,
    lastViewedDocs: {},
    readDocs: {},
    driftReports: {},
    ignoredDriftRefs: {},
    metaFilter: { tags: [], statuses: [], sources: [], updatedRange: 'all' },
    refreshKey: 0,
  })
})

describe('ProjectDocReturnBar', () => {
  it('calls the return handler from a visible Back to Wiki action', async () => {
    const onReturnToWiki = vi.fn()
    renderWithProviders(
      <ProjectDocReturnBar docName="README.md" onReturnToWiki={onReturnToWiki} />
    )

    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.getByText('README.md').closest('[data-project-doc-return-bar]')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'projectWiki.returnToWikiAria' }))

    expect(onReturnToWiki).toHaveBeenCalledOnce()
  })

  it('keeps document actions in a compact sticky bar so they take less reading space', () => {
    renderWithProviders(
      <ProjectDocReturnBar
        docName="README.md"
        onReturnToWiki={vi.fn()}
        actions={<button type="button">목차</button>}
      />
    )

    const returnBar = screen.getByText('README.md').closest('[data-project-doc-return-bar]')
    const actions = returnBar?.querySelector('[data-project-doc-actions]')
    expect(returnBar).toContainElement(screen.getByRole('button', { name: '목차' }))
    expect(returnBar).toHaveStyle({
      position: 'sticky',
      top: '0',
      margin: '0 0 var(--sp-4)',
      padding: 'var(--sp-2) var(--sp-8)',
    })
    expect(actions).toHaveStyle({ minWidth: '0', maxWidth: '100%', flex: '1 1 520px' })
  })

  it('keeps expanded document search inside the compact reading bar', () => {
    renderWithProviders(
      <ProjectDocReturnBar
        docName="README.md"
        onReturnToWiki={vi.fn()}
        actions={
          <ProjectFindControls
            value=""
            result={null}
            onChange={vi.fn()}
            onPrev={vi.fn()}
            onNext={vi.fn()}
            onClose={vi.fn()}
          />
        }
      />
    )

    const returnBar = screen.getByText('README.md').closest('[data-project-doc-return-bar]')
    expect(returnBar).toContainElement(screen.getByRole('search', { name: 'projectView.findInDoc' }))
    expect(screen.getByPlaceholderText('projectView.searchPlaceholder')).toBeInTheDocument()
  })

  it('uses readable labels for document action buttons instead of icon-only controls', async () => {
    const onClick = vi.fn()
    renderWithProviders(
      <ProjectActionButton icon={<span aria-hidden="true">⌕</span>} label="검색" ariaLabel="문서 내 검색" onClick={onClick} />
    )

    const button = screen.getByRole('button', { name: '문서 내 검색' })
    expect(button).toHaveTextContent('검색')
    expect(button).toHaveAttribute('title', '문서 내 검색')
    await userEvent.setup().click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('reserves the compact sticky reading bar height when jumping from the TOC', () => {
    const container = document.createElement('div')
    const returnBar = document.createElement('div')
    returnBar.setAttribute('data-project-doc-return-bar', '')
    returnBar.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 42,
      right: 420,
      width: 420,
      height: 42,
      toJSON: () => ({}),
    }))
    container.appendChild(returnBar)

    expect(getDocumentStickyOffset(container)).toBe(54)
  })

  it('keeps the table-of-contents rail compact at 1440px reading widths', () => {
    expect(getDocumentRailWidth('toc')).toBe('clamp(220px, 18vw, 280px)')
    expect(getDocumentRailWidth('issues')).toBe('clamp(300px, 24vw, 360px)')
  })

  it('marks the TOC action active only when the TOC rail is actually visible', () => {
    expect(getTocActionState({ showTocRail: false, hasDriftTool: true })).toEqual({
      showToc: true,
      showDocumentTools: true,
      activeDocumentTool: 'toc',
      documentToolsMode: 'toc',
    })

    expect(getTocActionState({ showTocRail: true, hasDriftTool: true, documentToolsMode: 'all' })).toEqual({
      showToc: false,
      showDocumentTools: true,
      activeDocumentTool: 'issues',
      documentToolsMode: 'all',
    })

    expect(getTocActionState({ showTocRail: true, hasDriftTool: false })).toEqual({
      showToc: false,
      showDocumentTools: false,
      activeDocumentTool: 'toc',
      documentToolsMode: 'toc',
    })

    expect(getTocActionState({ showTocRail: true, hasDriftTool: true, documentToolsMode: 'toc' })).toEqual({
      showToc: false,
      showDocumentTools: false,
      activeDocumentTool: 'toc',
      documentToolsMode: 'toc',
    })
  })

  it('offers current file location reveal and copies raw markdown source, not only rendered body', async () => {
    const doc: Doc = {
      path: '/project/docs/spec.md',
      projectId: project.id,
      name: 'spec.md',
      mtime: 1,
    }
    const rawContent = '---\ntitle: Spec\n---\n\n# Spec\n\nBody.'
    const api = installApiMock()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    api.project.scanDocs.mockResolvedValue([doc])
    api.fs.readDoc.mockResolvedValue({
      content: '# Spec\n\nBody.',
      rawContent,
      mtime: 1,
    })
    api.shell.revealInFinder.mockResolvedValue(undefined)

    useAppStore.setState({
      workspaces: [workspace],
      projects: [project],
      activeWorkspaceId: workspace.id,
      activeProjectId: project.id,
    })
    useAppStore.getState().setDocs([doc])

    renderWithProviders(
      <ProjectView
        projectId={project.id}
        projectRoot={project.root}
        projectName={project.name}
        initialDocPath={doc.path}
      />
    )

    await waitFor(() => expect(api.fs.readDoc).toHaveBeenCalledWith(doc.path))

    expect(screen.queryByRole('menuitem', { name: 'projectView.copyMarkdownSourceAria' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'projectView.copyMenuAria' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'projectView.copyMarkdownSourceAria' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(rawContent))

    fireEvent.click(screen.getByRole('button', { name: 'projectView.copyMenuAria' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'projectView.copyTitleAria' }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('spec.md'))

    fireEvent.click(screen.getByRole('button', { name: 'projectView.copyMenuAria' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'projectView.copyPathAria' }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('/project/docs/spec.md'))

    fireEvent.click(screen.getByRole('button', { name: 'projectView.revealCurrentAria' }))
    expect(api.shell.revealInFinder).toHaveBeenCalledWith(doc.path)

    const scrollContainer = document.querySelector('[data-project-scroll-container]')
    expect(scrollContainer).toHaveStyle({ minWidth: '0', padding: '0' })
    expect(document.querySelector('[data-project-document-body]')).toHaveStyle({
      padding: '0 var(--sp-8) var(--sp-6)',
    })

    await waitFor(() => expect(screen.getByRole('button', { name: 'projectOpen.openCurrentFileWith' })).toBeEnabled())
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'projectOpen.openCurrentFileWith' }))
    expect(api.projectOpeners.open).toHaveBeenCalledWith('/project/docs/spec.md', 'finder')
  })

  it('keeps file creation and mutation controls hidden until the editor workflow is ready', async () => {
    const doc: Doc = {
      path: '/project/docs/spec.md',
      projectId: project.id,
      name: 'spec.md',
      mtime: 1,
    }
    const api = installApiMock()
    api.project.scanDocs.mockResolvedValue([doc])
    api.fs.readDoc.mockResolvedValue({
      content: '# Spec\n',
      rawContent: '# Spec\n',
      mtime: 1,
    })
    const promptSpy = vi.spyOn(window, 'prompt').mockImplementation(() => {
      throw new Error('prompt() is not supported')
    })
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => {
      throw new Error('confirm() is not supported')
    })

    useAppStore.setState({
      workspaces: [workspace],
      projects: [project],
      activeWorkspaceId: workspace.id,
      activeProjectId: project.id,
    })
    useAppStore.getState().setDocs([doc])

    renderWithProviders(
      <ProjectView
        projectId={project.id}
        projectRoot={project.root}
        projectName={project.name}
        initialDocPath={doc.path}
      />
    )

    await waitFor(() => expect(api.fs.readDoc).toHaveBeenCalledWith(doc.path))
    expect(screen.queryByRole('toolbar', { name: 'fileTree.actionsAria' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'fileTree.newMarkdownAria' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'fileTree.newFolderAria' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'fileTree.renameAria' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'fileTree.trashAria' })).not.toBeInTheDocument()
    expect(api.fs.createMarkdown).not.toHaveBeenCalled()
    expect(api.fs.createFolder).not.toHaveBeenCalled()
    expect(api.fs.rename).not.toHaveBeenCalled()
    expect(api.fs.trash).not.toHaveBeenCalled()
    expect(promptSpy).not.toHaveBeenCalled()
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('keeps image documents in a fixed viewer layout so wheel zoom cannot scroll the document chrome away', async () => {
    const doc: Doc = {
      path: '/project/images/share.png',
      projectId: project.id,
      name: 'share.png',
      mtime: 1,
      size: 137600,
    }
    const api = installApiMock()
    api.project.scanDocs.mockResolvedValue([doc])

    useAppStore.setState({
      workspaces: [workspace],
      projects: [{ ...project, docCount: 1 }],
      activeWorkspaceId: workspace.id,
      activeProjectId: project.id,
    })
    useAppStore.getState().setDocs([doc])

    renderWithProviders(
      <ProjectView
        projectId={project.id}
        projectRoot={project.root}
        projectName={project.name}
        initialDocPath={doc.path}
      />
    )

    expect(await screen.findByRole('img', { name: 'share.png' })).toBeInTheDocument()
    const scrollContainer = document.querySelector('[data-project-scroll-container]')
    expect(scrollContainer).toHaveStyle({
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      padding: '0',
    })

    const toolbar = screen.getByRole('toolbar', { name: 'imageViewer.toolbarAria' })
    expect(toolbar).toContainElement(screen.getByRole('note', { name: 'imageViewer.shortcutsAria' }))
  })

  it('keeps experimental reference issues hidden from the default document toolbar', async () => {
    const doc: Doc = {
      path: '/project/NOVA-STATE.md',
      projectId: project.id,
      name: 'NOVA-STATE.md',
      mtime: 1,
    }
    const api = installApiMock()
    api.project.scanDocs.mockResolvedValue([doc])
    api.fs.readDoc.mockResolvedValue({
      content: '# Nova State\n\nscreens/Today.tsx',
      rawContent: '# Nova State\n\nscreens/Today.tsx',
      mtime: 1,
    })

    useAppStore.setState({
      workspaces: [workspace],
      projects: [project],
      activeWorkspaceId: workspace.id,
      activeProjectId: project.id,
      driftReports: {
        [doc.path]: {
          docPath: doc.path,
          docMtime: 1,
          projectRoot: project.root,
          references: Array.from({ length: 30 }, (_, index) => ({
            raw: `screens/Screen${index}.tsx`,
            resolvedPath: `/project/screens/Screen${index}.tsx`,
            status: 'missing' as const,
            kind: 'plain' as const,
            line: index + 1,
            col: 1,
          })),
          counts: { ok: 0, missing: 30, stale: 0 },
          verifiedAt: 1,
        },
      },
    })
    useAppStore.getState().setDocs([doc])

    renderWithProviders(
      <ProjectView
        projectId={project.id}
        projectRoot={project.root}
        projectName={project.name}
        initialDocPath={doc.path}
      />
    )

    await waitFor(() => expect(api.fs.readDoc).toHaveBeenCalledWith(doc.path))

    expect(screen.queryByRole('button', { name: 'projectView.documentTools' })).not.toBeInTheDocument()
    expect(document.querySelector('aside[aria-label="projectView.documentTools"]')).not.toBeInTheDocument()
  })

  it('offers a file-tree refresh button that forces a fresh project doc scan', async () => {
    const doc: Doc = {
      path: '/project/README.md',
      projectId: project.id,
      name: 'README.md',
      mtime: 1,
    }
    const api = installApiMock()
    api.project.scanDocs.mockResolvedValue([doc])

    useAppStore.setState({
      workspaces: [workspace],
      projects: [project],
      activeWorkspaceId: workspace.id,
      activeProjectId: project.id,
    })
    useAppStore.getState().setDocs([doc])

    renderWithProviders(
      <ProjectView
        projectId={project.id}
        projectRoot={project.root}
        projectName={project.name}
      />
    )

    await waitFor(() => expect(api.project.scanDocs).toHaveBeenCalledWith(project.id, undefined))
    api.project.scanDocs.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'fileTree.refreshAria' }))

    await waitFor(() => expect(api.project.scanDocs).toHaveBeenCalledWith(project.id, { force: true }))
  })
})
