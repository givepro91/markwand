import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Project } from '../../preload/types'

interface ProjectTabsProps {
  projects: Project[]
  openProjectTabs: string[]
  activeProjectId: string | null
  onSelect: (projectId: string) => void
  onClose: (projectId: string) => void
  onReorder?: (projectId: string, targetProjectId: string) => void
  onCloseOthers?: (projectId: string) => void
  onCloseToRight?: (projectId: string) => void
  onReopenClosed?: () => void
  canReopenClosed?: boolean
}

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
)

const ChevronLeftIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d="M10.8 3.2a.7.7 0 0 1 0 1L7 8l3.8 3.8a.7.7 0 1 1-1 1L5.5 8.5a.7.7 0 0 1 0-1l4.3-4.3a.7.7 0 0 1 1 0z" />
  </svg>
)

const ChevronRightIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d="M5.2 3.2a.7.7 0 0 1 1 0l4.3 4.3a.7.7 0 0 1 0 1l-4.3 4.3a.7.7 0 1 1-1-1L9 8 5.2 4.2a.7.7 0 0 1 0-1z" />
  </svg>
)

interface TabScrollState {
  overflow: boolean
  canScrollLeft: boolean
  canScrollRight: boolean
}

const initialScrollState: TabScrollState = {
  overflow: false,
  canScrollLeft: false,
  canScrollRight: false,
}

interface ContextMenuState {
  projectId: string
  top: number
  left: number
}

export function ProjectTabs({
  projects,
  openProjectTabs,
  activeProjectId,
  onSelect,
  onClose,
  onReorder,
  onCloseOthers,
  onCloseToRight,
  onReopenClosed,
  canReopenClosed = false,
}: ProjectTabsProps) {
  const { t } = useTranslation()
  const tabListRef = useRef<HTMLDivElement | null>(null)
  const tabItemRefs = useRef(new Map<string, HTMLDivElement>())
  const tabButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null)
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null)
  const [scrollState, setScrollState] = useState<TabScrollState>(initialScrollState)
  const [focusedProjectId, setFocusedProjectId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const projectById = new Map(projects.map((project) => [project.id, project]))
  const tabs = openProjectTabs
    .map((id) => projectById.get(id))
    .filter((project): project is Project => Boolean(project))
  const tabIds = tabs.map((project) => project.id)
  const tabOrderKey = tabIds.join('\0')
  const focusableProjectId =
    (focusedProjectId && tabIds.includes(focusedProjectId) && focusedProjectId) ||
    (activeProjectId && tabIds.includes(activeProjectId) && activeProjectId) ||
    tabIds[0] ||
    null

  const setTabItemRef = useCallback((projectId: string, node: HTMLDivElement | null) => {
    if (node) tabItemRefs.current.set(projectId, node)
    else tabItemRefs.current.delete(projectId)
  }, [])

  const setTabButtonRef = useCallback((projectId: string, node: HTMLButtonElement | null) => {
    if (node) tabButtonRefs.current.set(projectId, node)
    else tabButtonRefs.current.delete(projectId)
  }, [])

  const updateScrollState = useCallback(() => {
    const el = tabListRef.current
    if (!el) return
    const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth)
    const overflow = maxScrollLeft > 1
    const next = {
      overflow,
      canScrollLeft: overflow && el.scrollLeft > 1,
      canScrollRight: overflow && el.scrollLeft < maxScrollLeft - 1,
    }
    setScrollState((prev) =>
      prev.overflow === next.overflow &&
      prev.canScrollLeft === next.canScrollLeft &&
      prev.canScrollRight === next.canScrollRight
        ? prev
        : next
    )
  }, [])

  const revealProjectTab = useCallback(
    (projectId: string) => {
      const list = tabListRef.current
      const tab = tabItemRefs.current.get(projectId)
      if (!list || !tab) return

      const visibleLeft = list.scrollLeft
      const visibleRight = visibleLeft + list.clientWidth
      const tabLeft = tab.offsetLeft
      const tabRight = tabLeft + tab.offsetWidth
      const maxScrollLeft = Math.max(0, list.scrollWidth - list.clientWidth)
      let nextScrollLeft = visibleLeft

      if (tabLeft < visibleLeft) {
        nextScrollLeft = tabLeft
      } else if (tabRight > visibleRight) {
        nextScrollLeft = tabRight - list.clientWidth
      }

      nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, nextScrollLeft))
      if (nextScrollLeft !== visibleLeft) {
        list.scrollLeft = nextScrollLeft
      }
      updateScrollState()
    },
    [updateScrollState]
  )

  useEffect(() => {
    const el = tabListRef.current
    if (!el) return
    updateScrollState()

    el.addEventListener('scroll', updateScrollState, { passive: true })
    window.addEventListener('resize', updateScrollState)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateScrollState)
      resizeObserver.observe(el)
    }

    return () => {
      el.removeEventListener('scroll', updateScrollState)
      window.removeEventListener('resize', updateScrollState)
      resizeObserver?.disconnect()
    }
  }, [tabs.length, updateScrollState])

  const scrollTabs = useCallback(
    (direction: -1 | 1) => {
      const el = tabListRef.current
      if (!el) return
      const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth)
      const delta = Math.max(180, Math.floor(el.clientWidth * 0.72))
      el.scrollLeft = Math.min(maxScrollLeft, Math.max(0, el.scrollLeft + direction * delta))
      updateScrollState()
    },
    [updateScrollState]
  )

  const focusTab = useCallback(
    (projectId: string) => {
      setFocusedProjectId(projectId)
      revealProjectTab(projectId)
      tabButtonRefs.current.get(projectId)?.focus()
    },
    [revealProjectTab]
  )

  const handleTabKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, projectId: string) => {
      const currentIndex = tabIds.indexOf(projectId)
      if (currentIndex === -1) return

      let nextIndex: number | null = null
      if (event.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + tabIds.length) % tabIds.length
      } else if (event.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % tabIds.length
      } else if (event.key === 'Home') {
        nextIndex = 0
      } else if (event.key === 'End') {
        nextIndex = tabIds.length - 1
      }

      if (nextIndex !== null) {
        event.preventDefault()
        focusTab(tabIds[nextIndex])
        return
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onSelect(projectId)
      }
    },
    [focusTab, onSelect, tabOrderKey]
  )

  useEffect(() => {
    if (activeProjectId && tabIds.includes(activeProjectId)) {
      setFocusedProjectId(activeProjectId)
      revealProjectTab(activeProjectId)
    }
  }, [activeProjectId, revealProjectTab, tabOrderKey])

  useEffect(() => {
    if (!contextMenu) return

    const onPointerDown = (event: Event) => {
      const target = event.target as Node | null
      if (target && contextMenuRef.current?.contains(target)) return
      setContextMenu(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null)
    }

    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('resize', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('resize', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [contextMenu])

  if (tabs.length === 0) return null

  const contextProject = contextMenu ? projectById.get(contextMenu.projectId) : null
  const contextIndex = contextMenu ? tabIds.indexOf(contextMenu.projectId) : -1
  const hasOtherTabs = tabs.length > 1
  const hasRightTabs = contextIndex >= 0 && contextIndex < tabs.length - 1
  const runContextAction = (action: () => void) => {
    action()
    setContextMenu(null)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        minHeight: '36px',
        padding: '4px var(--sp-2) 0',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-elev)',
        flexShrink: 0,
      }}
    >
      {scrollState.overflow && (
        <button
          type="button"
          aria-label={t('projectTabs.scrollLeft')}
          title={t('projectTabs.scrollLeft')}
          disabled={!scrollState.canScrollLeft}
          onClick={() => scrollTabs(-1)}
          style={{
            width: '24px',
            height: '28px',
            marginRight: '2px',
            border: 0,
            borderRadius: 'var(--r-sm)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: '0 0 auto',
            color: 'var(--text-muted)',
            background: 'transparent',
            cursor: scrollState.canScrollLeft ? 'pointer' : 'not-allowed',
            opacity: scrollState.canScrollLeft ? 1 : 0.38,
          }}
        >
          <ChevronLeftIcon />
        </button>
      )}
      <div
        ref={tabListRef}
        role="tablist"
        aria-label={t('projectTabs.aria')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          minWidth: 0,
          flex: '1 1 auto',
          overflowX: 'auto',
          overflowY: 'hidden',
        }}
      >
      {tabs.map((project) => {
        const active = project.id === activeProjectId
        return (
          <div
            key={project.id}
            ref={(node) => setTabItemRef(project.id, node)}
            data-project-tab=""
            data-project-id={project.id}
            data-active={active ? 'true' : 'false'}
            data-drag-over={dragOverProjectId === project.id ? 'true' : 'false'}
            draggable={Boolean(onReorder)}
            onContextMenu={(event) => {
              event.preventDefault()
              setContextMenu({
                projectId: project.id,
                top: event.clientY,
                left: event.clientX,
              })
            }}
            onDragStart={(event) => {
              if (!onReorder) return
              setDraggedProjectId(project.id)
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', project.id)
            }}
            onDragEnter={(event) => {
              if (!onReorder || !draggedProjectId || draggedProjectId === project.id) return
              event.preventDefault()
              setDragOverProjectId(project.id)
            }}
            onDragOver={(event) => {
              if (!onReorder || !draggedProjectId || draggedProjectId === project.id) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
            }}
            onDragLeave={() => {
              if (dragOverProjectId === project.id) setDragOverProjectId(null)
            }}
            onDrop={(event) => {
              if (!onReorder) return
              event.preventDefault()
              const sourceProjectId = draggedProjectId ?? event.dataTransfer.getData('text/plain')
              setDraggedProjectId(null)
              setDragOverProjectId(null)
              if (!sourceProjectId || sourceProjectId === project.id) return
              onReorder(sourceProjectId, project.id)
            }}
            onDragEnd={() => {
              setDraggedProjectId(null)
              setDragOverProjectId(null)
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              boxSizing: 'border-box',
              minWidth: 0,
              maxWidth: '220px',
              height: '32px',
              border: '1px solid var(--border)',
              borderTopWidth: active ? '2px' : '1px',
              borderColor: active ? 'var(--accent)' : 'var(--border)',
              borderBottomColor: active ? 'var(--bg)' : 'var(--border)',
              borderRadius: 'var(--r-sm) var(--r-sm) 0 0',
              background: active
                ? 'color-mix(in srgb, var(--accent) 10%, var(--bg))'
                : 'color-mix(in srgb, var(--bg-elev) 88%, var(--bg))',
              color: active ? 'var(--text)' : 'var(--text-muted)',
              opacity: draggedProjectId === project.id ? 0.58 : 1,
              boxShadow: dragOverProjectId === project.id
                ? 'inset 2px 0 0 var(--accent)'
                : active
                  ? 'inset 0 2px 0 var(--accent), 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent), 0 4px 12px color-mix(in srgb, var(--accent) 12%, transparent)'
                  : 'none',
            }}
          >
            <button
              ref={(node) => setTabButtonRef(project.id, node)}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={project.id === focusableProjectId ? 0 : -1}
              title={project.root}
              onFocus={() => setFocusedProjectId(project.id)}
              onKeyDown={(event) => handleTabKeyDown(event, project.id)}
              onClick={() => onSelect(project.id)}
              style={{
                minWidth: 0,
                flex: '1 1 auto',
                height: '100%',
                border: 0,
                background: 'transparent',
                color: active ? 'var(--text)' : 'inherit',
                padding: '0 7px 0 10px',
                font: 'inherit',
                fontSize: 'var(--fs-xs)',
                fontWeight: active ? 'var(--fw-semibold)' : 'var(--fw-medium)',
                textAlign: 'left',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              {project.name}
            </button>
            <button
              type="button"
              aria-label={t('projectTabs.close', { name: project.name })}
              title={t('projectTabs.close', { name: project.name })}
              onClick={() => onClose(project.id)}
              style={{
                width: '26px',
                height: '26px',
                marginRight: '3px',
                border: 0,
                borderRadius: 'var(--r-sm)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: '0 0 auto',
                color: active ? 'var(--text-muted)' : 'color-mix(in srgb, var(--text-muted) 78%, transparent)',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              <CloseIcon />
            </button>
          </div>
        )
      })}
      </div>
      {scrollState.overflow && (
        <button
          type="button"
          aria-label={t('projectTabs.scrollRight')}
          title={t('projectTabs.scrollRight')}
          disabled={!scrollState.canScrollRight}
          onClick={() => scrollTabs(1)}
          style={{
            width: '24px',
            height: '28px',
            marginLeft: '2px',
            border: 0,
            borderRadius: 'var(--r-sm)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: '0 0 auto',
            color: 'var(--text-muted)',
            background: 'transparent',
            cursor: scrollState.canScrollRight ? 'pointer' : 'not-allowed',
            opacity: scrollState.canScrollRight ? 1 : 0.38,
          }}
        >
          <ChevronRightIcon />
        </button>
      )}
      {contextMenu && contextProject && createPortal(
        <div
          ref={contextMenuRef}
          role="menu"
          aria-label={t('projectTabs.contextMenuAria', { name: contextProject.name })}
          style={{
            position: 'fixed',
            top: `${contextMenu.top}px`,
            left: `${contextMenu.left}px`,
            zIndex: 1000,
            minWidth: '180px',
            padding: '5px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)',
            background: 'var(--bg-elev)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => runContextAction(() => onClose(contextMenu.projectId))}
            style={menuItemStyle}
          >
            {t('projectTabs.menuClose')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!hasOtherTabs || !onCloseOthers}
            onClick={() => {
              if (!onCloseOthers) return
              runContextAction(() => onCloseOthers(contextMenu.projectId))
            }}
            style={{
              ...menuItemStyle,
              opacity: hasOtherTabs && onCloseOthers ? 1 : 0.45,
            }}
          >
            {t('projectTabs.menuCloseOthers')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!hasRightTabs || !onCloseToRight}
            onClick={() => {
              if (!onCloseToRight) return
              runContextAction(() => onCloseToRight(contextMenu.projectId))
            }}
            style={{
              ...menuItemStyle,
              opacity: hasRightTabs && onCloseToRight ? 1 : 0.45,
            }}
          >
            {t('projectTabs.menuCloseRight')}
          </button>
          <div style={{ height: '1px', margin: '4px 3px', background: 'var(--border)' }} />
          <button
            type="button"
            role="menuitem"
            disabled={!canReopenClosed || !onReopenClosed}
            onClick={() => {
              if (!onReopenClosed) return
              runContextAction(onReopenClosed)
            }}
            style={{
              ...menuItemStyle,
              opacity: canReopenClosed && onReopenClosed ? 1 : 0.45,
            }}
          >
            {t('projectTabs.menuReopenClosed')}
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}

const menuItemStyle = {
  width: '100%',
  minHeight: '28px',
  border: 0,
  borderRadius: 'var(--r-sm)',
  display: 'flex',
  alignItems: 'center',
  padding: '0 9px',
  background: 'transparent',
  color: 'var(--text)',
  font: 'inherit',
  fontSize: 'var(--fs-xs)',
  textAlign: 'left' as const,
  cursor: 'pointer',
}
