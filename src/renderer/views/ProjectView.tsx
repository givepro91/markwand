import { useState, useCallback, useEffect, useRef, useMemo, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { FileTree } from '../components/FileTree'
import { MarkdownViewer } from '../components/MarkdownViewer'
import { ImageViewer } from '../components/ImageViewer'
import { AiHandoffButton } from '../components/AiHandoffButton'
import { ProjectOpenMenu } from '../components/ProjectOpenMenu'
import { FilterBar } from '../components/FilterBar'
import { TableOfContents } from '../components/TableOfContents'
import { DriftPanel, type DriftJumpTarget } from '../components/DriftPanel'
import { ProjectWikiPanel } from '../components/ProjectWikiPanel'
import { I18nErrorBoundary } from '../components/ErrorBoundary'
import { RecentDocsPanel } from '../components/RecentDocsPanel'
import { Button, EmptyState, IconButton, toast } from '../components/ui'
import { useDocs } from '../hooks/useDocs'
import { useGitPulse } from '../hooks/useGitPulse'
import { useProjectWikiBrief } from '../hooks/useProjectWikiBrief'
import { useReloadOnRefresh } from '../hooks/useReloadOnRefresh'
import { useAppStore } from '../state/store'
import { createFindController, type FindController } from '../lib/findInContainer'
import { scrollMarkdownSourceLineIntoView } from '../lib/markdownSourceLine'
import { buildProjectWikiSummary } from '../lib/projectWiki'
import { classifyAsset } from '../../lib/viewable'
import { applyMetaFilter } from '../utils/docFilters'
import { humanizeError } from '../lib/humanizeError'
import type { Doc, FsEntryResult } from '../../../src/preload/types'
import type { Heading } from '../components/TableOfContents'

interface ProjectViewProps {
  projectId: string
  projectRoot: string
  projectName: string
  initialDocPath?: string
  /** RecentDocsPanel 의 "+N개 더" 클릭 시 호출. App 이 setViewMode('inbox') 처리. */
  onSeeMoreRecent?: () => void
}

type DocumentToolsMode = 'all' | 'toc'

type FileActionKind = 'new-markdown' | 'new-folder' | 'rename' | 'trash'

type FileActionDialogState =
  | {
      kind: 'new-markdown' | 'new-folder'
      value: string
      dirPath: string
    }
  | {
      kind: 'rename'
      value: string
      doc: Doc
    }
  | {
      kind: 'trash'
      value: string
      doc: Doc
    }

// File creation/editing needs a real in-app editor flow before it earns UI space.
// Keep the implementation behind this local gate until that larger workflow is designed.
const SHOW_FILE_MUTATION_ACTIONS = false

const TocIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d="M2 2.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11A.5.5 0 0 1 2 2.5zm0 4a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11A.5.5 0 0 1 2 6.5zm0 4a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6A.5.5 0 0 1 2 10.5z"/>
  </svg>
)

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.099zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
  </svg>
)

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

const WikiIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M2.5 2A1.5 1.5 0 0 0 1 3.5v9A1.5 1.5 0 0 0 2.5 14H7a1 1 0 0 1 1 1 .5.5 0 0 0 1 0 1 1 0 0 1 1-1h3.5A1.5 1.5 0 0 0 15 12.5v-9A1.5 1.5 0 0 0 13.5 2H10a2 2 0 0 0-1.5.68A2 2 0 0 0 7 2H2.5Zm0 1H7a1 1 0 0 1 1 1v9.13A2 2 0 0 0 7 13H2.5a.5.5 0 0 1-.5-.5v-9A.5.5 0 0 1 2.5 3ZM9 13.13V4a1 1 0 0 1 1-1h3.5a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5H10a2 2 0 0 0-1 .13Z" />
  </svg>
)

const FolderIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M1.75 3A1.75 1.75 0 0 1 3.5 1.25h2.18c.47 0 .92.19 1.25.52L8.16 3h4.34A1.75 1.75 0 0 1 14.25 4.75v6.75a1.75 1.75 0 0 1-1.75 1.75h-9A1.75 1.75 0 0 1 1.75 11.5v-8.5Zm1.75-.75a.75.75 0 0 0-.75.75v8.5c0 .41.34.75.75.75h9c.41 0 .75-.34.75-.75V4.75a.75.75 0 0 0-.75-.75H7.75L6.22 2.47a.75.75 0 0 0-.54-.22H3.5Z" />
  </svg>
)

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M4.5 1.75A1.75 1.75 0 0 1 6.25 0h5.5A1.75 1.75 0 0 1 13.5 1.75v8A1.75 1.75 0 0 1 11.75 11.5h-5.5A1.75 1.75 0 0 1 4.5 9.75v-8Zm1.75-.75a.75.75 0 0 0-.75.75v8c0 .41.34.75.75.75h5.5c.41 0 .75-.34.75-.75v-8a.75.75 0 0 0-.75-.75h-5.5ZM2.5 4.25c0-.41.34-.75.75-.75H4v-1h-.75A1.75 1.75 0 0 0 1.5 4.25v8A1.75 1.75 0 0 0 3.25 14h5.5a1.75 1.75 0 0 0 1.75-1.75v-.75h-1v.75c0 .41-.34.75-.75.75h-5.5a.75.75 0 0 1-.75-.75v-8Z" />
  </svg>
)

const NewDocIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 1.75h5.5L13 5.25v8.25a.75.75 0 0 1-.75.75H4a.75.75 0 0 1-.75-.75v-11A.75.75 0 0 1 4 1.75Z" />
    <path d="M9.5 1.75V5.25H13" />
    <path d="M8 7.25v4" />
    <path d="M6 9.25h4" />
  </svg>
)

const NewFolderIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1.75 4.25A1.25 1.25 0 0 1 3 3h2.4l1.4 1.5H13a1.25 1.25 0 0 1 1.25 1.25V12A1.25 1.25 0 0 1 13 13.25H3A1.25 1.25 0 0 1 1.75 12V4.25Z" />
    <path d="M8 7.25v3.5" />
    <path d="M6.25 9h3.5" />
  </svg>
)

const RenameIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.75 11.75 2 14l2.25-.75 7.2-7.2-1.5-1.5-7.2 7.2Z" />
    <path d="m10 4.5 1.2-1.2a1.06 1.06 0 0 1 1.5 1.5l-1.2 1.2" />
    <path d="M7.25 14h6" />
  </svg>
)

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.5 4h11" />
    <path d="M6.25 4V2.75h3.5V4" />
    <path d="M4 4l.5 9.25a1 1 0 0 0 1 .95h5a1 1 0 0 0 1-.95L12 4" />
    <path d="M6.75 7v4" />
    <path d="M9.25 7v4" />
  </svg>
)

function dirnameOfPath(absPath: string, fallback: string): string {
  const idx = absPath.lastIndexOf('/')
  if (idx <= 0) return fallback
  return absPath.slice(0, idx)
}

function fsEntryToDoc(entry: FsEntryResult, projectId: string): Doc {
  const doc: Doc = {
    path: entry.path,
    projectId,
    name: entry.name,
    mtime: entry.mtime ?? Date.now(),
  }
  if (entry.size !== undefined) doc.size = entry.size
  if (entry.frontmatter !== undefined) doc.frontmatter = entry.frontmatter
  return doc
}

export function ProjectDocReturnBar({
  docName,
  onReturnToWiki,
  actions,
}: {
  docName: string
  onReturnToWiki: () => void
  actions?: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <div
      data-project-doc-return-bar=""
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 'var(--z-sticky)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 'var(--sp-2)',
        boxSizing: 'border-box',
        margin: '0 0 var(--sp-4)',
        padding: 'var(--sp-2) var(--sp-8)',
        border: '1px solid var(--border)',
        borderLeft: 0,
        borderRight: 0,
        borderRadius: 0,
        background: 'var(--bg-elev)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ minWidth: 0, maxWidth: '100%', flex: '1 1 160px', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 'var(--fw-medium)' }}>
          {t('projectWiki.currentDoc')}
        </span>
        <strong
          style={{
            color: 'var(--text)',
            fontSize: 'var(--fs-sm)',
            fontWeight: 'var(--fw-semibold)',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {docName}
        </strong>
      </div>
      <div
        data-project-doc-actions=""
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          flexWrap: 'nowrap',
          gap: '6px',
          flex: '0 1 auto',
          minWidth: 0,
          maxWidth: '100%',
        }}
      >
        {actions}
        <Button
          variant="ghost"
          size="sm"
          onClick={onReturnToWiki}
          aria-label={t('projectWiki.returnToWikiAria')}
        >
          {t('projectWiki.returnToWiki')}
        </Button>
      </div>
    </div>
  )
}

export function ProjectFindControls({
  value,
  result,
  inputRef,
  onChange,
  onPrev,
  onNext,
  onClose,
}: {
  value: string
  result: { active: number; total: number } | null
  inputRef?: Ref<HTMLInputElement>
  onChange: (value: string) => void
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const hasQuery = value.trim().length > 0

  return (
    <div
      role="search"
      aria-label={t('projectView.findInDoc')}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-1)',
        minHeight: '32px',
        padding: '3px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-pill)',
        background: 'var(--bg)',
        boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--bg-elev) 80%, transparent)',
      }}
    >
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.shiftKey ? onPrev() : onNext()
          }
          if (e.key === 'Escape') onClose()
        }}
        placeholder={t('projectView.searchPlaceholder')}
        aria-label={t('projectView.findInDoc')}
        style={{
          width: 'clamp(180px, 20vw, 320px)',
          background: 'transparent',
          border: 'none',
          color: 'var(--text)',
          fontSize: 'var(--fs-sm)',
          padding: '4px 8px',
          outline: 'none',
          fontFamily: 'inherit',
        }}
      />
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap', paddingInline: '4px' }}
      >
        {result ? (result.total > 0 ? `${result.active} / ${result.total}` : t('projectView.findNoResults')) : t('projectView.findReady')}
      </span>
      <IconButton aria-label={t('projectView.findPrev')} size="sm" onClick={onPrev} disabled={!hasQuery}>
        <ChevronLeftIcon />
      </IconButton>
      <IconButton aria-label={t('projectView.findNext')} size="sm" onClick={onNext} disabled={!hasQuery}>
        <ChevronRightIcon />
      </IconButton>
      <IconButton aria-label={t('projectView.findClose')} size="sm" onClick={onClose}>
        ✕
      </IconButton>
    </div>
  )
}

export function ProjectActionButton({
  icon,
  label,
  ariaLabel,
  active = false,
  onClick,
}: {
  icon: ReactNode
  label: string
  ariaLabel?: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      aria-pressed={active}
      title={ariaLabel ?? label}
      onClick={onClick}
      style={{
        minHeight: '32px',
        minWidth: '32px',
        maxWidth: '100%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        padding: '0 10px',
        border: '1px solid',
        borderColor: active ? 'transparent' : 'var(--border)',
        borderRadius: 'var(--r-pill)',
        background: active ? 'linear-gradient(135deg, var(--accent), var(--accent-hover))' : 'var(--surface-glass)',
        color: active ? 'var(--accent-contrast)' : 'var(--text)',
        boxShadow: active ? '0 8px 20px color-mix(in srgb, var(--accent) 18%, transparent)' : 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 'var(--fs-sm)',
        fontWeight: 'var(--fw-semibold)',
        whiteSpace: 'nowrap',
        transition: `background var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard)`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)'
        if (!active) e.currentTarget.style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        if (!active) e.currentTarget.style.background = 'var(--surface-glass)'
      }}
    >
      {icon}
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </button>
  )
}

function DocumentCopyMenu({
  includeMarkdownSource,
  onCopyMarkdownSource,
  onCopyTitle,
  onCopyPath,
}: {
  includeMarkdownSource: boolean
  onCopyMarkdownSource: () => void | Promise<void>
  onCopyTitle: () => void | Promise<void>
  onCopyPath: () => void | Promise<void>
}) {
  const { t } = useTranslation()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null)

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    const width = 220
    const viewportWidth = window.innerWidth || 1024
    setMenuPosition({
      top: rect.bottom + 8,
      left: Math.min(Math.max(12, rect.right - width), Math.max(12, viewportWidth - width - 12)),
      width,
    })
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    updateMenuPosition()
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('resize', updateMenuPosition)
    document.addEventListener('scroll', updateMenuPosition, true)
    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      document.removeEventListener('scroll', updateMenuPosition, true)
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen, updateMenuPosition])

  const runMenuAction = useCallback((action: () => void | Promise<void>) => {
    setMenuOpen(false)
    void action()
  }, [])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={t('projectView.copyMenuAria')}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title={t('projectView.copyMenuAria')}
        onClick={() => {
          updateMenuPosition()
          setMenuOpen((prev) => !prev)
        }}
        style={{
          minHeight: '32px',
          minWidth: '32px',
          maxWidth: '100%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          padding: '0 10px',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-pill)',
          background: 'var(--surface-glass)',
          color: 'var(--text)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 'var(--fs-sm)',
          fontWeight: 'var(--fw-semibold)',
          whiteSpace: 'nowrap',
        }}
      >
        <CopyIcon />
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('projectView.copyMenu')}</span>
      </button>
      {menuOpen && menuPosition && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={t('projectView.copyMenuAria')}
          style={{
            position: 'fixed',
            top: menuPosition.top,
            left: menuPosition.left,
            width: menuPosition.width,
            padding: 'var(--sp-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            background: 'var(--surface-glass)',
            backdropFilter: 'blur(18px)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 'var(--z-modal)',
          }}
        >
          {includeMarkdownSource && (
            <button
              type="button"
              role="menuitem"
              aria-label={t('projectView.copyMarkdownSourceAria')}
              onClick={() => runMenuAction(onCopyMarkdownSource)}
              style={copyMenuItemStyle}
            >
              {t('projectView.copyMarkdownSource')}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            aria-label={t('projectView.copyTitleAria')}
            onClick={() => runMenuAction(onCopyTitle)}
            style={copyMenuItemStyle}
          >
            {t('projectView.copyTitle')}
          </button>
          <button
            type="button"
            role="menuitem"
            aria-label={t('projectView.copyPathAria')}
            onClick={() => runMenuAction(onCopyPath)}
            style={copyMenuItemStyle}
          >
            {t('projectView.copyPath')}
          </button>
        </div>,
        document.body
      )}
    </>
  )
}

const copyMenuItemStyle = {
  width: '100%',
  minHeight: '34px',
  display: 'flex',
  alignItems: 'center',
  padding: '0 var(--sp-3)',
  border: 0,
  borderRadius: 'var(--r-md)',
  background: 'transparent',
  color: 'var(--text)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 'var(--fs-sm)',
  fontWeight: 'var(--fw-medium)',
  textAlign: 'left' as const,
}

function FileActionDialog({
  state,
  busy,
  onChange,
  onClose,
  onSubmit,
}: {
  state: FileActionDialogState
  busy: boolean
  onChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
}) {
  const { t } = useTranslation()
  const isTrash = state.kind === 'trash'
  const titleKey: Record<FileActionKind, string> = {
    'new-markdown': 'fileTree.newMarkdownDialogTitle',
    'new-folder': 'fileTree.newFolderDialogTitle',
    rename: 'fileTree.renameDialogTitle',
    trash: 'fileTree.trashDialogTitle',
  }
  const confirmKey: Record<FileActionKind, string> = {
    'new-markdown': 'fileTree.newMarkdownConfirm',
    'new-folder': 'fileTree.newFolderConfirm',
    rename: 'fileTree.renameConfirm',
    trash: 'fileTree.trashConfirmButton',
  }
  const description = isTrash
    ? t('fileTree.trashDialogDesc', { name: state.doc.name })
    : state.kind === 'rename'
      ? t('fileTree.renameDialogDesc', { name: state.doc.name })
      : t('fileTree.createDialogDesc', { dir: state.dirPath })

  return createPortal(
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--sp-4)',
        background: 'color-mix(in srgb, var(--bg) 52%, transparent)',
        backdropFilter: 'blur(8px)',
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={t(titleKey[state.kind])}
        onSubmit={(e) => {
          e.preventDefault()
          if (!isTrash && state.value.trim().length === 0) return
          onSubmit()
        }}
        style={{
          width: 'min(420px, 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-4)',
          padding: 'var(--sp-5)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)',
          background: 'var(--bg-elev)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
          <strong style={{ fontSize: 'var(--fs-lg)', color: 'var(--text)' }}>
            {t(titleKey[state.kind])}
          </strong>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', lineHeight: 'var(--lh-relaxed)' }}>
            {description}
          </span>
        </div>
        {!isTrash && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 'var(--fw-medium)' }}>
              {t('fileTree.fileNameLabel')}
            </span>
            <input
              autoFocus
              value={state.value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  onClose()
                }
              }}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                background: 'var(--bg)',
                color: 'var(--text)',
                padding: 'var(--sp-2) var(--sp-3)',
                fontFamily: 'inherit',
                fontSize: 'var(--fs-sm)',
                outline: 'none',
              }}
            />
          </label>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant={isTrash ? 'danger' : 'primary'}
            size="sm"
            disabled={busy || (!isTrash && state.value.trim().length === 0)}
          >
            {busy ? t('common.loading') : t(confirmKey[state.kind])}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

export function getDocumentStickyOffset(container: HTMLElement): number {
  const returnBar = container.querySelector<HTMLElement>('[data-project-doc-return-bar]')
  if (!returnBar) return 16
  return Math.ceil(returnBar.getBoundingClientRect().height + 12)
}

export function getDocumentRailWidth(tool: 'issues' | 'toc'): string {
  return tool === 'toc' ? 'clamp(220px, 18vw, 280px)' : 'clamp(300px, 24vw, 360px)'
}

export function getTocActionState({
  showTocRail,
  hasDriftTool,
  documentToolsMode = 'toc',
}: {
  showTocRail: boolean
  hasDriftTool: boolean
  documentToolsMode?: DocumentToolsMode
}): {
  showToc: boolean
  showDocumentTools: boolean
  activeDocumentTool: 'issues' | 'toc'
  documentToolsMode: DocumentToolsMode
} {
  if (!showTocRail) {
    return { showToc: true, showDocumentTools: true, activeDocumentTool: 'toc', documentToolsMode: 'toc' }
  }
  if (documentToolsMode === 'all' && hasDriftTool) {
    return { showToc: false, showDocumentTools: true, activeDocumentTool: 'issues', documentToolsMode: 'all' }
  }
  return {
    showToc: false,
    showDocumentTools: false,
    activeDocumentTool: 'toc',
    documentToolsMode: 'toc',
  }
}

const ChevronLeftIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
  </svg>
)

const ChevronRightIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
  </svg>
)

function scrollContainerTo(container: HTMLElement | null, top: number): void {
  if (!container) return
  if (typeof container.scrollTo === 'function') {
    container.scrollTo({ top })
    return
  }
  container.scrollTop = top
}

export function ProjectView({ projectId, projectRoot, projectName, initialDocPath, onSeeMoreRecent }: ProjectViewProps) {
  const { t } = useTranslation()
  const { docs, scanDocs, isScanning } = useDocs(projectId)
  const gitPulse = useGitPulse(projectRoot)
  const metaFilter = useAppStore((s) => s.metaFilter)
  // FS9-B — 현재 프로젝트가 속한 workspace id. SSH 이면 MarkdownViewer 가 이미지 IPC 경유.
  const currentWorkspaceId = useAppStore((s) => {
    const p = s.projects.find((x) => x.id === projectId)
    return p?.workspaceId ?? null
  })
  const isSshProject = useAppStore((s) => {
    const project = s.projects.find((x) => x.id === projectId)
    const workspace = project ? s.workspaces.find((x) => x.id === project.workspaceId) : null
    return workspace?.transport?.type === 'ssh'
  })

  const isFilterActive =
    metaFilter.tags.length > 0 ||
    metaFilter.statuses.length > 0 ||
    metaFilter.sources.length > 0 ||
    metaFilter.updatedRange !== 'all'

  const filteredDocs = useMemo(
    () => (isFilterActive ? applyMetaFilter(docs, metaFilter) : docs),
    [docs, metaFilter, isFilterActive]
  )
  const initialViewSessionRef = useRef(useAppStore.getState().projectViewSessions[projectId])
  const viewSession = initialViewSessionRef.current
  const setProjectViewSession = useAppStore((s) => s.setProjectViewSession)

  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null)
  const [docContent, setDocContent] = useState<string>('')
  const [docSource, setDocSource] = useState<string>('')
  const [targetDir, setTargetDir] = useState(projectRoot)
  const [knownEmptyFolders, setKnownEmptyFolders] = useState<string[]>([])
  const [fileDialog, setFileDialog] = useState<FileActionDialogState | null>(null)
  const [fileActionBusy, setFileActionBusy] = useState(false)
  const [initialExpanded, setInitialExpanded] = useState<string[]>([])
  const [headings, setHeadings] = useState<Heading[]>([])
  const [showToc, setShowToc] = useState(false)
  const [showFind, setShowFind] = useState(false)
  const [showDocumentTools, setShowDocumentTools] = useState(true)
  const [activeDocumentTool, setActiveDocumentTool] = useState<'issues' | 'toc'>('issues')
  const [documentToolsMode, setDocumentToolsMode] = useState<DocumentToolsMode>('all')
  const [findQuery, setFindQuery] = useState('')
  const [findResult, setFindResult] = useState<{ active: number; total: number } | null>(null)
  const [showWiki, setShowWiki] = useState(() => viewSession?.showWiki ?? true)
  const findInputRef = useRef<HTMLInputElement | null>(null)
  const findDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const findControllerRef = useRef<FindController | null>(null)
  const docLoadSeqRef = useRef(0)
  const pendingScrollRestoreRef = useRef<number | null>(null)
  // F2: 마크다운 스크롤 컨테이너 ref — TOC scrollIntoView 타깃
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  // store 액션 (F3/F4)
  const pendingDocOpen = useAppStore((s) => s.pendingDocOpen)
  const setPendingDocOpen = useAppStore((s) => s.setPendingDocOpen)
  const lastViewedDocs = useAppStore((s) => s.lastViewedDocs)
  const setLastViewedDoc = useAppStore((s) => s.setLastViewedDoc)
  const readDocs = useAppStore((s) => s.readDocs)

  const docsByPath = useMemo(() => new Map(docs.map((doc) => [doc.path, doc])), [docs])
  const wikiSummary = useMemo(
    () => buildProjectWikiSummary(docs, {}, readDocs),
    [docs, readDocs]
  )
  const { brief: wikiBrief, loading: wikiBriefLoading } = useProjectWikiBrief(projectName, wikiSummary, docsByPath)
  const selectedAssetKind = selectedDoc ? classifyAsset(selectedDoc.path) : null
  const selectedIsMarkdown = selectedAssetKind === 'md'
  const selectedIsImage = selectedAssetKind === 'image'
  const imageDocumentMode = Boolean(!showWiki && selectedIsImage)
  const hasDriftTool = false
  const hasTocTool = Boolean(!showWiki && selectedIsMarkdown && showToc && headings.length > 0)
  const canShowDriftTool = documentToolsMode === 'all' && hasDriftTool
  const activeRightTool = activeDocumentTool === 'toc' && hasTocTool ? 'toc' : canShowDriftTool ? 'issues' : 'toc'
  const showRightRail = showDocumentTools && (canShowDriftTool || hasTocTool)
  const showDriftRail = showRightRail && activeRightTool === 'issues' && canShowDriftTool
  const showTocRail = showRightRail && activeRightTool === 'toc' && hasTocTool
  const scheduleScrollRestore = useCallback((scrollTop: number) => {
    pendingScrollRestoreRef.current = scrollTop
    requestAnimationFrame(() => {
      const next = pendingScrollRestoreRef.current
      if (next === null) return
      pendingScrollRestoreRef.current = null
      scrollContainerTo(scrollContainerRef.current, next)
    })
  }, [])
  const handleReturnToWiki = useCallback(() => {
    setShowWiki(true)
    setProjectViewSession(projectId, { showWiki: true, scrollTop: 0 })
    requestAnimationFrame(() => {
      scrollContainerTo(scrollContainerRef.current, 0)
    })
  }, [projectId, setProjectViewSession])
  const handleRefreshFileTree = useCallback(() => {
    if (!projectId) return
    scanDocs(projectId, { force: true })
  }, [projectId, scanDocs])

  useEffect(() => {
    setTargetDir(projectRoot)
    setKnownEmptyFolders([])
  }, [projectRoot])

  useEffect(() => {
    if (!selectedDoc || !selectedIsMarkdown) return
    setDocumentToolsMode('toc')
    setActiveDocumentTool('toc')
  }, [selectedDoc?.path, selectedIsMarkdown])

  useEffect(() => {
    if (activeDocumentTool === 'toc' && !hasTocTool && canShowDriftTool) setActiveDocumentTool('issues')
    if (activeDocumentTool === 'issues' && !canShowDriftTool && hasTocTool) setActiveDocumentTool('toc')
  }, [activeDocumentTool, canShowDriftTool, hasTocTool])

  // treeExpanded 복원
  useEffect(() => {
    window.api.prefs.get('treeExpanded').then((stored) => {
      const map = (stored as Record<string, string[]> | null) ?? {}
      setInitialExpanded(map[projectId] ?? [])
    })
  }, [projectId])

  // 사이드바 폭 (리사이즈 가능). 180~600 clamp, 기본 260.
  // 긴 파일명(날짜 prefix + 제목)이 잘리지 않도록 사용자가 드래그해 조절.
  const [sidebarWidth, setSidebarWidth] = useState(260)
  // 키보드 리사이즈 prefs 저장 debounce ref (pointerDown 의 prefs.set 경로와 동일하게 처리)
  const kbResizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resizeStateRef = useRef<{ startX: number; startWidth: number; latest: number } | null>(null)
  const rafRef = useRef<number | null>(null)
  // 언마운트 플래그 — 드래그 중 프로젝트 전환(ProjectView key remount)으로 인한
  // 좀비 listener 가 setSidebarWidth 를 호출하지 못하게 한다.
  // StrictMode dev 재마운트(mount→cleanup→mount)에서는 cleanup 이 플래그를 true 로 남기므로
  // 재마운트 시 effect 가 false 로 리셋해 정상 동작하게 한다.
  const unmountedRef = useRef(false)
  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
    }
  }, [])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    let rafId: number | null = null
    const saveScroll = () => {
      rafId = null
      setProjectViewSession(projectId, { scrollTop: container.scrollTop })
    }
    const onScroll = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(saveScroll)
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', onScroll)
      if (rafId !== null) cancelAnimationFrame(rafId)
      if (useAppStore.getState().openProjectTabs.includes(projectId)) {
        setProjectViewSession(projectId, { scrollTop: container.scrollTop })
      }
    }
  }, [projectId, setProjectViewSession])

  // prefs 복원. 이미 드래그 중이면 응답 무시 — IPC race 로 드래그 중인 폭이 튀어오르지 않게.
  useEffect(() => {
    window.api.prefs.get('sidebarWidth').then((v) => {
      if (unmountedRef.current || resizeStateRef.current) return
      if (typeof v === 'number' && v >= 180 && v <= 600) setSidebarWidth(v)
    })
  }, [])

  // 드래그 핸들 — pointerdown 으로 시작, setPointerCapture + window pointermove/up 으로 추적.
  // setPointerCapture: 커서가 핸들 DOM 밖으로 벗어나도 이벤트가 계속 이 엘리먼트로 전달됨 →
  // 빠른 드래그 + 핸들 이탈 시 pointerup 을 놓치는 엣지 버그 방지.
  // rAF 로 setState throttle 해 60fps 이상 업데이트에서도 렌더 루프 안정.
  // pointercancel(ESC·OS 포커스 전환 등) 이면 시작 폭으로 원복 + 영속 안 함 (네이티브 앱 관례).
  const handleSidebarResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const target = e.currentTarget
    const pointerId = e.pointerId
    try {
      target.setPointerCapture(pointerId)
    } catch {
      // setPointerCapture 실패는 UX 치명 아님 — window listener 로도 기본 동작.
    }
    resizeStateRef.current = { startX: e.clientX, startWidth: sidebarWidth, latest: sidebarWidth }
    const onMove = (ev: PointerEvent) => {
      if (unmountedRef.current) return
      const s = resizeStateRef.current
      if (!s) return
      const next = Math.max(180, Math.min(600, s.startWidth + (ev.clientX - s.startX)))
      s.latest = next
      if (rafRef.current != null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        if (unmountedRef.current) return
        // s.latest 를 참조해 rAF 사이 누적된 move 의 마지막 값을 반영 (클로저 stale 방지).
        const ss = resizeStateRef.current
        if (ss) setSidebarWidth(ss.latest)
      })
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      try {
        target.releasePointerCapture(pointerId)
      } catch {
        // 이미 해제된 경우 무시.
      }
    }
    const onEnd = (ev: PointerEvent) => {
      cleanup()
      const s = resizeStateRef.current
      resizeStateRef.current = null
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (unmountedRef.current || !s) return
      // 드래그 중 선택된 텍스트가 있으면 해제 (splitter 근처 텍스트 선택 아티팩트 방지).
      window.getSelection()?.removeAllRanges()
      if (ev.type === 'pointercancel') {
        // 의도적 중단 — 시작 폭으로 복원, prefs 영속 생략.
        setSidebarWidth(s.startWidth)
        return
      }
      if (s.latest !== s.startWidth) {
        setSidebarWidth(s.latest)
        window.api.prefs.set('sidebarWidth', s.latest).catch(() => {
          // prefs 영속 실패는 UX 치명 아님 — 다음 세션에서 기본값 260 으로 복귀.
        })
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
  }, [sidebarWidth])

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      if (kbResizeDebounceRef.current != null) clearTimeout(kbResizeDebounceRef.current)
    }
  }, [])

  // 키보드 사이드바 리사이즈 핸들러 (WCAG 2.1.1 / 2.5.7)
  // Evaluator S2 M-2: Arrow 키는 `stopPropagation` 으로 separator 에 소비 격리
  // (상위 RecentDocsPanel 탭 전환 등 Arrow 기반 핸들러와 충돌 방지).
  const handleSidebarResizeKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    let delta = 0
    if (e.key === 'ArrowLeft')  delta = e.shiftKey ? -50 : -10
    else if (e.key === 'ArrowRight') delta = e.shiftKey ? 50 : 10
    else if (e.key === 'Home') {
      e.preventDefault()
      e.stopPropagation()
      const next = 180
      setSidebarWidth(next)
      if (kbResizeDebounceRef.current) clearTimeout(kbResizeDebounceRef.current)
      kbResizeDebounceRef.current = setTimeout(() => {
        window.api.prefs.set('sidebarWidth', next).catch(() => {})
      }, 200)
      return
    } else if (e.key === 'End') {
      e.preventDefault()
      e.stopPropagation()
      const next = 600
      setSidebarWidth(next)
      if (kbResizeDebounceRef.current) clearTimeout(kbResizeDebounceRef.current)
      kbResizeDebounceRef.current = setTimeout(() => {
        window.api.prefs.set('sidebarWidth', next).catch(() => {})
      }, 200)
      return
    } else {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    setSidebarWidth((prev) => {
      const next = Math.max(180, Math.min(600, prev + delta))
      if (kbResizeDebounceRef.current) clearTimeout(kbResizeDebounceRef.current)
      kbResizeDebounceRef.current = setTimeout(() => {
        window.api.prefs.set('sidebarWidth', next).catch(() => {})
      }, 200)
      return next
    })
  }, [])

  const loadDoc = useCallback(async (doc: Doc, opts?: { restoreScrollTop?: number }) => {
    const loadSeq = ++docLoadSeqRef.current
    const scrollTop = opts?.restoreScrollTop ?? 0
    setSelectedDoc(doc)
    setShowWiki(false)
    setTargetDir(dirnameOfPath(doc.path, projectRoot))
    setHeadings([])
    setProjectViewSession(projectId, {
      selectedDocPath: doc.path,
      showWiki: false,
      scrollTop,
    })
    // F4: 마지막 본 문서 갱신
    setLastViewedDoc(projectId, doc.path)

    // 이미지는 readDoc(utf-8)을 호출하지 않는다 — app://로 <img>가 직접 로드한다.
    // docContent는 MarkdownViewer 전용이므로 빈 문자열로 초기화.
    if (classifyAsset(doc.path) === 'image') {
      setDocContent('')
      setDocSource('')
      scheduleScrollRestore(scrollTop)
      return
    }

    setDocContent('')
    setDocSource('')
    try {
      const result = await window.api.fs.readDoc(doc.path)
      if (unmountedRef.current || loadSeq !== docLoadSeqRef.current) return
      setDocContent(result.content)
      setDocSource(result.rawContent ?? result.content)
      scheduleScrollRestore(scrollTop)
    } catch (err) {
      if (unmountedRef.current || loadSeq !== docLoadSeqRef.current) return
      console.error('문서 읽기 실패:', err)
      const msg = err instanceof Error ? err.message : String(err)
      setDocContent(humanizeError(t, msg))
      setDocSource('')
      scheduleScrollRestore(scrollTop)
    }
  }, [projectId, projectRoot, scheduleScrollRestore, setLastViewedDoc, setProjectViewSession, t])

  // F3: pendingDocOpen 처리 — docs 로드 후 한 번만 실행
  useEffect(() => {
    if (!pendingDocOpen || pendingDocOpen.projectId !== projectId || docs.length === 0) return
    const doc = docs.find((d) => d.path === pendingDocOpen.path)
    if (doc) {
      loadDoc(doc)
      setPendingDocOpen(null)
    }
  }, [pendingDocOpen, projectId, docs, loadDoc, setPendingDocOpen])

  // F4: mount 시 lastViewedDoc 복원 (pendingDocOpen이 없을 때만)
  useEffect(() => {
    if (docs.length === 0) return
    // pendingDocOpen이 이 프로젝트 대상이면 pendingDocOpen이 우선
    if (pendingDocOpen?.projectId === projectId) return
    if (viewSession?.showWiki === true) return
    const savedPath = viewSession?.selectedDocPath ?? lastViewedDocs[projectId]
    if (!savedPath) return
    // 이미 선택된 문서가 있으면 복원 불필요
    if (selectedDoc) return
    const doc = docs.find((d) => d.path === savedPath)
    if (doc) {
      const restoreScrollTop =
        savedPath === viewSession?.selectedDocPath ? viewSession?.scrollTop ?? 0 : 0
      loadDoc(doc, { restoreScrollTop })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, projectId])

  // initialDocPath가 있으면 해당 문서 자동 선택 (prop 경로, 하위 호환)
  useEffect(() => {
    if (!initialDocPath || docs.length === 0) return
    const doc = docs.find((d) => d.path === initialDocPath)
    if (doc) loadDoc(doc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDocPath, docs])

  // 명시 새로고침(⌘R / Sidebar 버튼) 시 현재 열린 문서 content 도 디스크에서 다시 읽는다.
  // useDocs 가 docs 목록은 이미 refreshKey 에 반응하지만, ProjectView 의 docContent
  // state 는 selectedDoc 클릭 시점에만 set 되므로 별도 reload 가 필요.
  useReloadOnRefresh(() => {
    if (selectedDoc) void loadDoc(selectedDoc)
  })

  // 커스텀 find controller — 스크롤 컨테이너 DOM 안에서 TreeWalker + CSS Highlight API로 검색.
  // docContent가 바뀌면 MarkdownViewer가 새 DOM을 렌더하므로 controller도 재생성한다.
  // onChange 콜백으로 ProjectView의 findResult state에 진행 상황을 반영.
  // 문서 전환 시 기존 쿼리가 살아있으면 자동 재검색 (VSCode/Finder 유사 UX).
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const searchRoot = container.querySelector<HTMLElement>('.markdown-viewer') ?? container
    // 문서 전환 직전에 살아있는 debounce 타이머를 제거해 새 controller에 이전 debounce가 섞이지 않게 한다.
    if (findDebounceRef.current) {
      clearTimeout(findDebounceRef.current)
      findDebounceRef.current = null
    }
    const controller = createFindController(searchRoot, container)
    findControllerRef.current = controller
    const off = controller.onChange((s) => {
      setFindResult({ active: s.active, total: s.total })
    })
    let retimer: ReturnType<typeof setTimeout> | null = null
    if (findQuery.trim()) {
      // React commit 직후 실행되지만 mermaid/코드 블록이 추가 렌더될 수 있어 한 틱 여유
      retimer = setTimeout(() => controller.update(findQuery), 50)
    }
    return () => {
      if (retimer) clearTimeout(retimer)
      off()
      controller.destroy()
      findControllerRef.current = null
    }
    // findQuery 변경은 handleFindChange가 별도로 controller.update를 호출하므로 여기선 의존성 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docContent])

  // 검색 toolbar 열릴 때 input focus
  useEffect(() => {
    if (showFind) {
      const id = setTimeout(() => findInputRef.current?.focus(), 0)
      return () => clearTimeout(id)
    }
  }, [showFind])

  useEffect(() => {
    if (!showWiki) return
    setShowFind(false)
    setFindQuery('')
    setFindResult(null)
    findControllerRef.current?.clear()
  }, [showWiki])

  // 이미지 문서 선택 시 find/TOC state를 정리해 토글 불일치를 막는다.
  useEffect(() => {
    if (selectedDoc && classifyAsset(selectedDoc.path) === 'image') {
      setShowFind(false)
      setFindQuery('')
      setFindResult(null)
      findControllerRef.current?.clear()
      setHeadings([])
    }
  }, [selectedDoc])

  // cmd+F 단축키로 검색 열기 — md 문서일 때만. 이미지 뷰에서는 검색 대상 텍스트 없음.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        if (selectedDoc && classifyAsset(selectedDoc.path) !== 'md') return
        e.preventDefault()
        setShowFind((prev) => !prev)
      }
      if (e.key === 'Escape' && showFind) {
        setShowFind(false)
        setFindQuery('')
        setFindResult(null)
        findControllerRef.current?.clear()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showFind, selectedDoc])

  const handleDocNavigate = useCallback(async (absPath: string) => {
    const loadSeq = ++docLoadSeqRef.current
    // MarkdownViewer의 내부 링크 내비게이션은 `.md` 만 이 콜백을 호출하도록 설계돼 있으나,
    // 방어적으로 이미지 경로가 들어오면 readDoc 스킵하고 뷰어 전환만 수행.
    if (classifyAsset(absPath) === 'image') {
      const fakeDoc: Doc = {
        path: absPath,
        projectId,
        name: absPath.split('/').pop() ?? absPath,
        mtime: Date.now(),
      }
      setSelectedDoc(fakeDoc)
      setShowWiki(false)
      setDocContent('')
      setDocSource('')
      setLastViewedDoc(projectId, absPath)
      setProjectViewSession(projectId, {
        selectedDocPath: absPath,
        showWiki: false,
        scrollTop: 0,
      })
      scheduleScrollRestore(0)
      return
    }
    setDocContent('')
    setDocSource('')
    try {
      const result = await window.api.fs.readDoc(absPath)
      if (unmountedRef.current || loadSeq !== docLoadSeqRef.current) return
      const fakeDoc: Doc = {
        path: absPath,
        projectId,
        name: absPath.split('/').pop() ?? absPath,
        mtime: result.mtime,
        frontmatter: result.frontmatter,
      }
      setSelectedDoc(fakeDoc)
      setShowWiki(false)
      setDocContent(result.content)
      setDocSource(result.rawContent ?? result.content)
      setLastViewedDoc(projectId, absPath)
      setProjectViewSession(projectId, {
        selectedDocPath: absPath,
        showWiki: false,
        scrollTop: 0,
      })
      scheduleScrollRestore(0)
    } catch (err) {
      if (unmountedRef.current || loadSeq !== docLoadSeqRef.current) return
      console.error('내부 링크 이동 실패:', err)
    }
  }, [projectId, scheduleScrollRestore, setLastViewedDoc, setProjectViewSession])

  const handleExpandChange = useCallback(async (expanded: string[]) => {
    const stored = await window.api.prefs.get('treeExpanded')
    const map = (stored as Record<string, string[]> | null) ?? {}
    await window.api.prefs.set('treeExpanded', { ...map, [projectId]: expanded })
  }, [projectId])

  const handleFindChange = useCallback((value: string) => {
    setFindQuery(value)
    if (findDebounceRef.current) clearTimeout(findDebounceRef.current)
    if (!value.trim()) {
      setFindResult(null)
      findControllerRef.current?.clear()
      return
    }
    // 타이핑 중 매 keystroke마다 전체 문서 walk는 수 ms라 충분히 빠르나,
    // 한국어 IME 조합(ㅂ→배→배포) 중간 결과로 하이라이트가 깜박이지 않도록 짧은 debounce 유지.
    findDebounceRef.current = setTimeout(() => {
      findControllerRef.current?.update(value)
    }, 120)
  }, [])

  useEffect(() => {
    return () => {
      if (findDebounceRef.current) clearTimeout(findDebounceRef.current)
    }
  }, [])

  const handleFindNext = useCallback(() => {
    findControllerRef.current?.next()
  }, [])

  const handleFindPrev = useCallback(() => {
    findControllerRef.current?.prev()
  }, [])

  const handleCloseFind = useCallback(() => {
    setShowFind(false)
    setFindQuery('')
    setFindResult(null)
    findControllerRef.current?.clear()
  }, [])

  const handleRevealCurrentDoc = useCallback(async () => {
    if (!selectedDoc) return
    try {
      await window.api.shell.revealInFinder(selectedDoc.path)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      toast.error(t('projectView.revealCurrentError', { reason }))
    }
  }, [selectedDoc, t])

  const handleCopyMarkdownSource = useCallback(async () => {
    const source = docSource || docContent
    try {
      await navigator.clipboard.writeText(source)
      toast.success(t('projectView.copyMarkdownSourceSuccess'))
    } catch {
      toast.error(t('projectView.copyMarkdownSourceError'))
    }
  }, [docContent, docSource, t])

  const handleCopyDocTitle = useCallback(async () => {
    if (!selectedDoc) return
    try {
      await navigator.clipboard.writeText(selectedDoc.name)
      toast.success(t('projectView.copyTitleSuccess'))
    } catch {
      toast.error(t('projectView.copyTitleError'))
    }
  }, [selectedDoc, t])

  const handleCopyDocPath = useCallback(async () => {
    if (!selectedDoc) return
    try {
      await navigator.clipboard.writeText(selectedDoc.path)
      toast.success(t('projectView.copyPathSuccess'))
    } catch {
      toast.error(t('projectView.copyPathError'))
    }
  }, [selectedDoc, t])

  const mutationErrorReason = useCallback((err: unknown) => (
    err instanceof Error ? err.message : String(err)
  ), [])

  const closeFileDialog = useCallback(() => {
    if (fileActionBusy) return
    setFileDialog(null)
  }, [fileActionBusy])

  const handleFileDialogChange = useCallback((value: string) => {
    setFileDialog((prev) => (prev ? { ...prev, value } : prev))
  }, [])

  const handleOpenCreateMarkdown = useCallback(() => {
    if (isSshProject) return
    setFileDialog({ kind: 'new-markdown', value: 'untitled.md', dirPath: targetDir })
  }, [isSshProject, targetDir])

  const handleOpenCreateFolder = useCallback(() => {
    if (isSshProject) return
    setFileDialog({ kind: 'new-folder', value: 'docs', dirPath: targetDir })
  }, [isSshProject, targetDir])

  const handleOpenRenameSelected = useCallback(() => {
    if (!selectedDoc || isSshProject) return
    setFileDialog({ kind: 'rename', value: selectedDoc.name, doc: selectedDoc })
  }, [isSshProject, selectedDoc])

  const handleOpenTrashSelected = useCallback(() => {
    if (!selectedDoc || isSshProject) return
    setFileDialog({ kind: 'trash', value: selectedDoc.name, doc: selectedDoc })
  }, [isSshProject, selectedDoc])

  const handleSubmitFileAction = useCallback(async () => {
    if (!fileDialog || fileActionBusy) return
    const value = fileDialog.value.trim()
    if (fileDialog.kind !== 'trash' && !value) return
    setFileActionBusy(true)
    try {
      if (fileDialog.kind === 'new-markdown') {
        const createMarkdown = window.api.fs.createMarkdown
        if (!createMarkdown) {
          toast.error(t('fileTree.actionsUnavailable'))
          return
        }
        const result = await createMarkdown({ projectRoot, dirPath: fileDialog.dirPath, name: value })
        const nextDoc = fsEntryToDoc(result, projectId)
        scanDocs(projectId, { force: true })
        await loadDoc(nextDoc)
        setFileDialog(null)
        toast.success(t('fileTree.newMarkdownSuccess', { name: result.name }))
        return
      }

      if (fileDialog.kind === 'new-folder') {
        const createFolder = window.api.fs.createFolder
        if (!createFolder) {
          toast.error(t('fileTree.actionsUnavailable'))
          return
        }
        const result = await createFolder({ projectRoot, dirPath: fileDialog.dirPath, name: value })
        setKnownEmptyFolders((prev) => (
          prev.includes(result.path) ? prev : [...prev, result.path]
        ))
        setTargetDir(result.path)
        scanDocs(projectId, { force: true })
        setFileDialog(null)
        toast.success(t('fileTree.newFolderSuccess', { name: result.name }))
        return
      }

      if (fileDialog.kind === 'rename') {
        const rename = window.api.fs.rename
        if (!rename) {
          toast.error(t('fileTree.actionsUnavailable'))
          return
        }
        const result = await rename({ projectRoot, path: fileDialog.doc.path, newName: value })
        const nextDoc = fsEntryToDoc(result, projectId)
        scanDocs(projectId, { force: true })
        await loadDoc(nextDoc)
        setFileDialog(null)
        toast.success(t('fileTree.renameSuccess', { name: result.name }))
        return
      }

      if (fileDialog.kind === 'trash') {
        const trash = window.api.fs.trash
        if (!trash) {
          toast.error(t('fileTree.actionsUnavailable'))
          return
        }
        await trash({ projectRoot, path: fileDialog.doc.path })
        setSelectedDoc(null)
        setDocContent('')
        setDocSource('')
        setShowWiki(true)
        scanDocs(projectId, { force: true })
        setFileDialog(null)
        toast.success(t('fileTree.trashSuccess', { name: fileDialog.doc.name }))
      }
    } catch (err) {
      const reason = mutationErrorReason(err)
      if (fileDialog.kind === 'new-markdown') {
        toast.error(t('fileTree.newMarkdownError', { reason }))
      } else if (fileDialog.kind === 'new-folder') {
        toast.error(t('fileTree.newFolderError', { reason }))
      } else if (fileDialog.kind === 'rename') {
        toast.error(t('fileTree.renameError', { reason }))
      } else {
        toast.error(t('fileTree.trashError', { reason }))
      }
    } finally {
      setFileActionBusy(false)
    }
  }, [fileActionBusy, fileDialog, loadDoc, mutationErrorReason, projectId, projectRoot, scanDocs, t])

  /*
   * Electron renderer does not support native window.prompt()/confirm().
   * File operations must go through the in-app dialog above.
   */
  const handleCreateMarkdown = handleOpenCreateMarkdown
  const handleCreateFolder = handleOpenCreateFolder
  const handleRenameSelected = handleOpenRenameSelected
  const handleTrashSelected = handleOpenTrashSelected

  // DriftPanel 각 ref 에서 "위치로 이동" 누르면 검색 UI를 열지 않고 해당 소스 라인으로 바로 스크롤한다.
  const handleJumpToRef = useCallback((target: DriftJumpTarget) => {
    // 검색바가 열려 있던 상태라면 입력값은 동기화해 두고, 닫혀 있으면 조용히 하이라이트만 갱신한다.
    if (showFind) setFindQuery(target.raw)
    const tryUpdate = () => {
      const c = findControllerRef.current
      if (c) {
        c.update(target.raw)
      }
    }
    const tryScrollToSourceLine = () => {
      const root = scrollContainerRef.current?.querySelector<HTMLElement>('.markdown-viewer')
      if (root) {
        scrollMarkdownSourceLineIntoView(root, target)
      }
    }
    tryUpdate()
    tryScrollToSourceLine()
    requestAnimationFrame(() => {
      tryUpdate()
      tryScrollToSourceLine()
    })
  }, [showFind])

  // F2: TOC heading 클릭 → scroll 컨테이너 내부에서 스크롤
  // 1순위 id 매칭, 실패 시 heading 텍스트 기반 매칭으로 fallback (custom component 실행 실패/
  // rehype-sanitize 변조/id 미부착 등 모든 엣지에 대응).
  const handleTocClick = useCallback((id: string) => {
    const container = scrollContainerRef.current
    if (!container) return
    const escaped = CSS.escape(id)
    const prefixed = CSS.escape(`user-content-${id}`)
    let el: HTMLElement | null =
      container.querySelector<HTMLElement>(`#${escaped}`) ??
      container.querySelector<HTMLElement>(`#${prefixed}`) ??
      Array.from(container.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'))
        .find((h) => h.id === id || h.id === `user-content-${id}`) ?? null

    // id 매칭 실패 시 텍스트 기반 fallback — headings state에서 id의 원본 text를 찾고
    // DOM heading들을 순회해 textContent와 비교한다.
    if (!el) {
      const target = headings.find((h) => h.id === id)
      if (target) {
        const normalized = target.text.trim().toLowerCase()
        el = Array.from(container.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'))
          .find((h) => (h.textContent ?? '').trim().toLowerCase() === normalized) ?? null
      }
    }

    if (!el) {
      console.warn('[TOC] heading not found for id:', id,
        '— DOM headings:',
        Array.from(container.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'))
          .map((h) => ({ tag: h.tagName, id: h.id, text: (h.textContent ?? '').slice(0, 40) }))
      )
      return
    }
    const containerTop = container.getBoundingClientRect().top
    const elTop = el.getBoundingClientRect().top
    const offset = elTop - containerTop + container.scrollTop - getDocumentStickyOffset(container)
    container.scrollTo({ top: offset, behavior: 'smooth' })
  }, [headings])

  const documentActions = !showWiki && selectedDoc ? (
    <>
      {!isSshProject && (
        <>
          <ProjectActionButton
            icon={<FolderIcon />}
            label={t('projectView.revealCurrent')}
            ariaLabel={t('projectView.revealCurrentAria')}
            active={false}
            onClick={handleRevealCurrentDoc}
          />
          <ProjectOpenMenu projectRoot={selectedDoc.path} variant="compact" />
        </>
      )}
      <DocumentCopyMenu
        includeMarkdownSource={selectedIsMarkdown}
        onCopyMarkdownSource={handleCopyMarkdownSource}
        onCopyTitle={handleCopyDocTitle}
        onCopyPath={handleCopyDocPath}
      />
      {selectedIsMarkdown && (
        <>
          {showFind ? (
            <ProjectFindControls
              value={findQuery}
              result={findResult}
              inputRef={findInputRef}
              onChange={handleFindChange}
              onPrev={handleFindPrev}
              onNext={handleFindNext}
              onClose={handleCloseFind}
            />
          ) : (
            <ProjectActionButton
              icon={<SearchIcon />}
              label={t('projectView.findShort')}
              ariaLabel={t('projectView.findInDoc')}
              active={false}
              onClick={() => setShowFind(true)}
            />
          )}
          <ProjectActionButton
            icon={<TocIcon />}
            label={t('projectView.tocTab')}
            ariaLabel={showTocRail ? t('projectView.tocClose') : t('projectView.tocOpen')}
            active={showTocRail}
            onClick={() => {
              const next = getTocActionState({ showTocRail, hasDriftTool, documentToolsMode })
              setShowToc(next.showToc)
              setShowDocumentTools(next.showDocumentTools)
              setActiveDocumentTool(next.activeDocumentTool)
              setDocumentToolsMode(next.documentToolsMode)
            }}
          />
        </>
      )}
    </>
  ) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* FilterBar */}
      <FilterBar docs={docs} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* F1: 좌측 파일 트리 — flex column + minHeight:0 체인 완전 보장 */}
        <div
          style={{
            width: `${sidebarWidth}px`,
            flexShrink: 0,
            borderRight: '1px solid var(--border)',
            background: 'var(--bg-elev)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minHeight: 0,
          }}
        >
          <div
            style={{
              padding: 'var(--sp-3) var(--sp-3) var(--sp-2)',
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--sp-2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', minWidth: 0 }}>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 'var(--fs-xs)',
                  fontWeight: 'var(--fw-semibold)',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {projectName}
              </span>
              <IconButton
                aria-label={t('fileTree.refreshAria')}
                title={t('fileTree.refreshTitle')}
                size="sm"
                variant="ghost"
                onClick={handleRefreshFileTree}
                disabled={isScanning}
              >
                <RefreshIcon spinning={isScanning} />
              </IconButton>
            </div>
            <AiHandoffButton projectName={projectName} summary={wikiSummary} brief={wikiBrief} />
            <ProjectOpenMenu
              projectRoot={projectRoot}
              disabled={isSshProject}
              disabledReason={t('projectOpen.sshDisabled')}
            />
            {SHOW_FILE_MUTATION_ACTIONS && (
              <div
                role="toolbar"
                aria-label={t('fileTree.actionsAria')}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: 'var(--sp-1)',
                }}
              >
                <IconButton
                  aria-label={t('fileTree.newMarkdownAria')}
                  title={isSshProject ? t('fileTree.localOnlyTitle') : t('fileTree.newMarkdownTitle', { dir: targetDir })}
                  size="sm"
                  variant="ghost"
                  onClick={handleCreateMarkdown}
                  disabled={isSshProject}
                >
                  <NewDocIcon />
                </IconButton>
                <IconButton
                  aria-label={t('fileTree.newFolderAria')}
                  title={isSshProject ? t('fileTree.localOnlyTitle') : t('fileTree.newFolderTitle', { dir: targetDir })}
                  size="sm"
                  variant="ghost"
                  onClick={handleCreateFolder}
                  disabled={isSshProject}
                >
                  <NewFolderIcon />
                </IconButton>
                <IconButton
                  aria-label={t('fileTree.renameAria')}
                  title={!selectedDoc ? t('fileTree.selectFileFirst') : t('fileTree.renameTitle')}
                  size="sm"
                  variant="ghost"
                  onClick={handleRenameSelected}
                  disabled={isSshProject || !selectedDoc}
                >
                  <RenameIcon />
                </IconButton>
                <IconButton
                  aria-label={t('fileTree.trashAria')}
                  title={!selectedDoc ? t('fileTree.selectFileFirst') : t('fileTree.trashTitle')}
                  size="sm"
                  variant="ghost"
                  onClick={handleTrashSelected}
                  disabled={isSshProject || !selectedDoc}
                >
                  <TrashIcon />
                </IconButton>
              </div>
            )}
          </div>
          {/* 최근 7일 문서 — FileTree 위 별도 섹션. 시각 구분(다른 배경 + 굵은 borderBottom).
              빈 상태(7일 내 수정 0건)일 땐 컴포넌트 자체가 null 반환해 헷갈림 방지.
              docs source 는 raw `docs` 사용 — FilterBar 날짜 필터(today/7d)가 활성이면
              filteredDocs 를 넘길 경우 패널 제목("최근 7일")과 실제 내용이 불일치한다. */}
          <RecentDocsPanel
            docs={docs}
            selectedPath={selectedDoc?.path ?? null}
            onSelect={loadDoc}
            onSeeMore={onSeeMoreRecent}
          />
          {/* F1: flex:1 + minHeight:0 — FileTree가 남은 공간 전체 사용 */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* FS9-B — 원격 스캔 중 빈 트리가 "버그처럼 보이는" 문제 해소. 로딩 중 & 아직 청크 미도착 시에만 표시. */}
            {isScanning && filteredDocs.length === 0 ? (
              <div
                role="status"
                aria-live="polite"
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--sp-2)',
                  color: 'var(--text-muted)',
                  fontSize: 'var(--fs-sm)',
                  padding: 'var(--sp-4)',
                  textAlign: 'center',
                }}
              >
                <span className="ui-spinner" aria-hidden="true" />
                <span>{t('loading.filesLoading')}</span>
                <span style={{ fontSize: 'var(--fs-xs)' }}>{t('loading.filesLoadingRemote')}</span>
              </div>
            ) : (
              <FileTree
                key={projectId}
                projectId={projectId}
                rootPath={projectRoot}
                docs={filteredDocs}
                extraFolders={knownEmptyFolders}
                onSelect={loadDoc}
                onFolderFocus={setTargetDir}
                initialExpanded={initialExpanded}
                onExpandChange={handleExpandChange}
              />
            )}
          </div>
        </div>

        {/* 사이드바 리사이즈 핸들 — 드래그로 좌측 트리 폭 조절. 180~600px clamp.
            hit-box 는 6px, 시각 표시는 hover 시 2px accent 선. flexShrink:0 필수. */}
        <div
          className="sidebar-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label={t('projectView.sidebarResize')}
          aria-valuenow={sidebarWidth}
          aria-valuemin={180}
          aria-valuemax={600}
          tabIndex={0}
          onPointerDown={handleSidebarResizeStart}
          onKeyDown={handleSidebarResizeKeyDown}
          style={{
            width: '6px',
            flexShrink: 0,
            cursor: 'col-resize',
            background: 'transparent',
            position: 'relative',
            userSelect: 'none',
            touchAction: 'none',
          }}
        >
          <div
            className="sidebar-resize-indicator"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: '2px',
              width: '2px',
              background: 'transparent',
              transition: 'background 0.15s ease',
              pointerEvents: 'none',
            }}
          />
        </div>

        {/* F2: 중앙 마크다운 뷰어 — ref 부착 */}
        <div
          data-project-scroll-container=""
          ref={scrollContainerRef}
          style={{
            flex: 1,
            minWidth: 0,
            overflow: imageDocumentMode ? 'hidden' : 'auto',
            display: imageDocumentMode ? 'flex' : undefined,
            flexDirection: imageDocumentMode ? 'column' : undefined,
            padding: selectedDoc && !showWiki ? 0 : 'var(--sp-6) var(--sp-8)',
            position: 'relative',
            background:
              'radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 8%, transparent) 0, transparent 32%), var(--bg)',
          }}
        >
          {/* 우상단 아이콘 버튼 그룹 — 문서 모드에서는 읽기 바 내부에 넣어 본문과 겹치지 않게 한다. */}
          {showWiki && selectedDoc && (
            <div
              style={{
                position: 'sticky',
                top: 0,
                display: 'flex',
                justifyContent: 'flex-end',
                pointerEvents: 'none',
                marginBottom: 'var(--sp-2)',
                zIndex: 'var(--z-sticky)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--sp-1)',
                  padding: '3px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-pill)',
                  background: 'var(--surface-glass)',
                  backdropFilter: 'blur(14px)',
                  boxShadow: 'var(--shadow-sm)',
                  pointerEvents: 'auto',
                }}
              >
              <IconButton
                aria-label={t('projectWiki.toggle')}
                aria-pressed={showWiki}
                size="sm"
                variant={showWiki ? 'primary' : 'ghost'}
                onClick={() => {
                  setShowWiki((prev) => {
                    const next = !prev
                    setProjectViewSession(projectId, { showWiki: next })
                    return next
                  })
                }}
              >
                <WikiIcon />
              </IconButton>
              </div>
            </div>
          )}
          {showWiki ? (
            <ProjectWikiPanel
              projectName={projectName}
              summary={wikiSummary}
              gitPulse={gitPulse.summary}
              gitPulseLoading={gitPulse.loading}
              brief={wikiBrief}
              briefLoading={wikiBriefLoading}
              docsByPath={docsByPath}
              onOpenDoc={loadDoc}
            />
          ) : selectedDoc ? (
            <>
              <ProjectDocReturnBar
                docName={selectedDoc.name}
                onReturnToWiki={handleReturnToWiki}
                actions={documentActions}
              />
              {selectedIsImage ? (
                <I18nErrorBoundary resetKey={selectedDoc.path}>
                  <ImageViewer
                    path={selectedDoc.path}
                    name={selectedDoc.name}
                    size={selectedDoc.size}
                    workspaceId={currentWorkspaceId}
                  />
                </I18nErrorBoundary>
              ) : (
                <I18nErrorBoundary resetKey={selectedDoc.path}>
                  <div
                    data-project-document-body=""
                    style={{ padding: '0 var(--sp-8) var(--sp-6)' }}
                  >
                    <MarkdownViewer
                      content={docContent}
                      basePath={selectedDoc.path}
                      onDocNavigate={handleDocNavigate}
                      onHeadings={setHeadings}
                      workspaceId={currentWorkspaceId}
                    />
                  </div>
                </I18nErrorBoundary>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <EmptyState
                icon="📄"
                title={t('projectView.selectFile')}
                description={t('projectView.selectFileDesc')}
              />
            </div>
          )}
        </div>

        {showRightRail && selectedDoc && (
          <aside
            aria-label={t('projectView.documentTools')}
            style={{
              width: getDocumentRailWidth(activeRightTool),
              flexShrink: 0,
              minHeight: 0,
              height: '100%',
              borderLeft: '1px solid var(--border)',
              background: 'color-mix(in srgb, var(--bg-elev) 92%, var(--bg))',
              overflow: 'auto',
              overscrollBehavior: 'contain',
              padding: activeRightTool === 'toc' ? 'var(--sp-3) var(--sp-2)' : 'var(--sp-4) var(--sp-3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--sp-4)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-2)',
                position: 'sticky',
                top: 0,
                zIndex: 'var(--z-sticky)',
                paddingBottom: 'var(--sp-2)',
                background: 'color-mix(in srgb, var(--bg-elev) 92%, var(--bg))',
              }}
            >
              {canShowDriftTool && hasTocTool ? (
                <div
                  role="tablist"
                  aria-label={t('projectView.documentTools')}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '4px',
                    padding: '3px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-pill)',
                    background: 'var(--bg)',
                  }}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeRightTool === 'issues'}
                    onClick={() => setActiveDocumentTool('issues')}
                    style={{
                      border: 0,
                      borderRadius: 'var(--r-pill)',
                      background: activeRightTool === 'issues' ? 'var(--accent)' : 'transparent',
                      color: activeRightTool === 'issues' ? 'var(--accent-contrast)' : 'var(--text-muted)',
                      padding: '4px 8px',
                      fontSize: 'var(--fs-xs)',
                      fontWeight: 'var(--fw-semibold)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t('projectView.issuesTab')}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeRightTool === 'toc'}
                    onClick={() => setActiveDocumentTool('toc')}
                    style={{
                      border: 0,
                      borderRadius: 'var(--r-pill)',
                      background: activeRightTool === 'toc' ? 'var(--accent)' : 'transparent',
                      color: activeRightTool === 'toc' ? 'var(--accent-contrast)' : 'var(--text-muted)',
                      padding: '4px 8px',
                      fontSize: 'var(--fs-xs)',
                      fontWeight: 'var(--fw-semibold)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t('projectView.tocTab')}
                  </button>
                </div>
              ) : (
                <strong
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 'var(--fs-md)',
                    fontWeight: 'var(--fw-semibold)',
                    color: 'var(--text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {showTocRail ? t('projectView.tocTab') : t('projectView.issuesTab')}
                </strong>
              )}
              <IconButton
                aria-label={t('projectView.closeDocumentTools')}
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (activeRightTool === 'toc') setShowToc(false)
                  setShowDocumentTools(false)
                  setDocumentToolsMode('all')
                }}
              >
                ✕
              </IconButton>
            </div>
            {showDriftRail && (
              <I18nErrorBoundary resetKey={`${selectedDoc.path}:drift-rail`}>
                <DriftPanel
                  docPath={selectedDoc.path}
                  projectRoot={projectRoot}
                  variant="side"
                  onJumpToRef={handleJumpToRef}
                />
              </I18nErrorBoundary>
            )}
            {showTocRail && (
              <section
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-lg)',
                  background: 'var(--bg-elev)',
                  padding: 'var(--sp-2)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <TableOfContents headings={headings} onHeadingClick={handleTocClick} showTitle={false} />
              </section>
            )}
          </aside>
        )}
      </div>
      {SHOW_FILE_MUTATION_ACTIONS && fileDialog && (
        <FileActionDialog
          state={fileDialog}
          busy={fileActionBusy}
          onChange={handleFileDialogChange}
          onClose={closeFileDialog}
          onSubmit={handleSubmitFileAction}
        />
      )}
    </div>
  )
}

// re-export for App.tsx activeProject tracking
export type { ProjectViewProps }
