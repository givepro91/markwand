import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from './ui'
import type { ProjectOpenerId, ProjectOpenerInfo } from '../../preload/types'

interface ProjectOpenMenuProps {
  projectRoot: string
  disabled?: boolean
  disabledReason?: string
  variant?: 'block' | 'compact'
}

const openerGlyph: Record<ProjectOpenerId, string> = {
  vscode: '▣',
  cursor: '⌁',
  finder: '⌂',
  terminal: '⌘',
  iterm2: '$',
  ghostty: '▸',
  xcode: '✦',
  intellij: 'IJ',
}

const coreFallbackOpeners: ProjectOpenerInfo[] = [
  { id: 'vscode', label: 'VS Code', available: true },
  { id: 'terminal', label: 'Terminal', available: true },
  { id: 'finder', label: 'Finder', available: true },
]

function isProjectOpenerId(value: unknown): value is ProjectOpenerId {
  return (
    value === 'vscode' ||
    value === 'cursor' ||
    value === 'finder' ||
    value === 'terminal' ||
    value === 'iterm2' ||
    value === 'ghostty' ||
    value === 'xcode' ||
    value === 'intellij'
  )
}

function withFinderFallback(openers: ProjectOpenerInfo[]): ProjectOpenerInfo[] {
  if (openers.some((opener) => opener.id === 'finder')) return openers
  return [...openers, { id: 'finder', label: 'Finder', available: true }]
}

export function ProjectOpenMenu({ projectRoot, disabled = false, disabledReason, variant = 'block' }: ProjectOpenMenuProps) {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [openers, setOpeners] = useState<ProjectOpenerInfo[]>([])
  const [defaultOpener, setDefaultOpener] = useState<ProjectOpenerId>('finder')
  const [launchingId, setLaunchingId] = useState<ProjectOpenerId | null>(null)
  const [loading, setLoading] = useState(true)

  const availableOpeners = useMemo(() => openers.filter((opener) => opener.available), [openers])
  const selectedOpener = useMemo(
    () => availableOpeners.find((opener) => opener.id === defaultOpener) ?? availableOpeners[0],
    [availableOpeners, defaultOpener]
  )
  const effectivelyDisabled = disabled || loading || !selectedOpener

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refreshOpeners = useCallback(async () => {
    if (disabled) {
      setLoading(false)
      setMenuOpen(false)
      return
    }
    setLoading(true)
    try {
      const [list, saved] = await Promise.all([
        window.api.projectOpeners.list(),
        window.api.prefs.get('defaultProjectOpener').catch(() => undefined),
      ])
      if (!mountedRef.current) return
      const safeOpeners = withFinderFallback(list)
      setOpeners(safeOpeners)
      const available = safeOpeners.filter((opener) => opener.available)
      if (isProjectOpenerId(saved) && available.some((opener) => opener.id === saved)) {
        setDefaultOpener(saved)
      } else if (available.some((opener) => opener.id === 'finder')) {
        setDefaultOpener('finder')
      } else if (available[0]) {
        setDefaultOpener(available[0].id)
      }
    } catch {
      if (!mountedRef.current) return
      setOpeners(coreFallbackOpeners)
      setDefaultOpener('finder')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [disabled])

  useEffect(() => {
    void refreshOpeners()
  }, [refreshOpeners])

  useEffect(() => {
    if (!menuOpen) return
    const handleMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  const openWith = useCallback(
    async (opener: ProjectOpenerInfo | undefined) => {
      if (!opener || disabled) return
      setLaunchingId(opener.id)
      try {
        const result = await window.api.projectOpeners.open(projectRoot, opener.id)
        if (!result.ok) {
          toast.error(t('projectOpen.openError', { reason: result.reason ?? t('projectOpen.unknownError') }))
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        toast.error(t('projectOpen.openError', { reason }))
      } finally {
        if (mountedRef.current) {
          setLaunchingId(null)
          setMenuOpen(false)
        }
      }
    },
    [disabled, projectRoot, t]
  )

  const setDefault = useCallback(
    async (opener: ProjectOpenerInfo) => {
      setDefaultOpener(opener.id)
      await window.api.prefs.set('defaultProjectOpener', opener.id)
      toast.success(t('projectOpen.defaultSaved', { app: opener.label }))
    },
    [t]
  )

  const isCompact = variant === 'compact'
  const menuAria = isCompact ? t('projectOpen.currentFileMenuAria') : t('projectOpen.menuAria')
  const title = disabled
    ? disabledReason ?? t('projectOpen.disabled')
    : selectedOpener
      ? t(isCompact ? 'projectOpen.openCurrentFileWith' : 'projectOpen.openWith', { app: selectedOpener.label })
      : t('projectOpen.none')

  return (
    <div
      ref={rootRef}
      style={{
        position: 'relative',
        width: isCompact ? 'auto' : '100%',
        maxWidth: '100%',
        flex: isCompact ? '0 0 auto' : undefined,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isCompact ? 'minmax(0, 1fr) 30px' : '1fr 34px',
          gap: 'var(--sp-1)',
          border: '1px solid var(--border)',
          borderRadius: isCompact ? 'var(--r-pill)' : 'var(--r-lg)',
          padding: '3px',
          background: isCompact ? 'var(--surface-glass)' : 'var(--bg)',
          opacity: disabled ? 0.62 : 1,
        }}
        title={title}
      >
        <button
          type="button"
          disabled={effectivelyDisabled}
          onClick={() => openWith(selectedOpener)}
          aria-label={title}
          style={{
            minWidth: 0,
            height: isCompact ? '30px' : '32px',
            border: 0,
            borderRadius: isCompact ? 'var(--r-pill)' : 'calc(var(--r-lg) - 4px)',
            background: disabled
              ? 'transparent'
              : isCompact
                ? 'transparent'
                : 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
            color: disabled ? 'var(--text-muted)' : isCompact ? 'var(--text)' : 'var(--accent-contrast)',
            cursor: effectivelyDisabled ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            fontSize: 'var(--fs-sm)',
            fontWeight: 'var(--fw-semibold)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--sp-2)',
            padding: isCompact ? '0 var(--sp-2)' : '0 var(--sp-3)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <span aria-hidden="true">{selectedOpener ? openerGlyph[selectedOpener.id] : '⌂'}</span>
          <span style={{ maxWidth: isCompact ? '132px' : undefined, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {launchingId
              ? t('projectOpen.opening')
              : selectedOpener
                ? isCompact ? selectedOpener.label : t('projectOpen.openWithShort', { app: selectedOpener.label })
                : t('projectOpen.none')}
          </span>
        </button>
        <button
          type="button"
          disabled={disabled || loading}
          aria-label={menuAria}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => {
            if (!disabled) {
              setMenuOpen((prev) => !prev)
              void refreshOpeners()
            }
          }}
          style={{
            height: isCompact ? '30px' : '32px',
            border: 0,
            borderRadius: isCompact ? 'var(--r-pill)' : 'calc(var(--r-lg) - 4px)',
            background: 'transparent',
            color: 'var(--text)',
            cursor: disabled || loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            fontSize: 'var(--fs-md)',
            fontWeight: 'var(--fw-semibold)',
          }}
        >
          ▾
        </button>
      </div>

      {menuOpen && !disabled && (
        <div
          role="menu"
          aria-label={menuAria}
          style={{
            position: 'absolute',
            left: 0,
            top: 'calc(100% + var(--sp-2))',
            width: isCompact ? 'max-content' : '100%',
            minWidth: isCompact ? '220px' : undefined,
            padding: 'var(--sp-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-xl)',
            background: 'var(--surface-glass)',
            backdropFilter: 'blur(18px)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 'calc(var(--z-dropdown) + 30)',
          }}
        >
          <div
            style={{
              padding: 'var(--sp-2) var(--sp-2) var(--sp-3)',
              color: 'var(--text-muted)',
              fontSize: 'var(--fs-xs)',
              lineHeight: 'var(--lh-relaxed)',
            }}
          >
            {t(isCompact ? 'projectOpen.currentFileMenuHint' : 'projectOpen.menuHint')}
          </div>
          {availableOpeners.map((opener) => {
            const isDefault = opener.id === defaultOpener
            return (
              <div
                key={opener.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 'var(--sp-1)',
                  alignItems: 'center',
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => openWith(opener)}
                  style={{
                    minWidth: 0,
                    border: 0,
                    borderRadius: 'var(--r-md)',
                    background: 'transparent',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 'var(--fs-sm)',
                    fontWeight: 'var(--fw-medium)',
                    padding: 'var(--sp-2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--sp-2)',
                    textAlign: 'left',
                  }}
                >
                  <span aria-hidden="true" style={{ width: 20, textAlign: 'center' }}>{openerGlyph[opener.id]}</span>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opener.label}</span>
                  {isDefault && (
                    <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontSize: 'var(--fs-xs)' }}>
                      {t('projectOpen.defaultBadge')}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label={t('projectOpen.setDefaultAria', { app: opener.label })}
                  disabled={isDefault}
                  onClick={() => setDefault(opener)}
                  style={{
                    height: '30px',
                    minWidth: '30px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-md)',
                    background: isDefault ? 'var(--accent-soft)' : 'transparent',
                    color: isDefault ? 'var(--accent)' : 'var(--text-muted)',
                    cursor: isDefault ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 'var(--fs-xs)',
                    fontWeight: 'var(--fw-semibold)',
                  }}
                >
                  ★
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
