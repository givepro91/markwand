import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui'
import type { Workspace } from '../../../src/preload/types'

interface WorkspaceManageModalProps {
  workspaces: Workspace[]
  onRemove: (id: string) => Promise<void>
  onClose: () => void
}

export function WorkspaceManageModal({ workspaces, onRemove, onClose }: WorkspaceManageModalProps) {
  const { t } = useTranslation()
  const modalRef = useRef<HTMLDivElement | null>(null)
  // 인라인 confirm 상태: null이면 미활성, string이면 해당 id 확인 중
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  // 모달 열릴 때 첫 포커서블에 focus
  useEffect(() => {
    const id = setTimeout(() => {
      const first = modalRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      first?.focus()
    }, 0)
    return () => clearTimeout(id)
  }, [])

  // Esc 닫기 + 포커스 트랩
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
      if (e.key === 'Tab') {
        const el = modalRef.current
        if (!el) return
        const focusable = el.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last?.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first?.focus()
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

  const handleConfirmRemove = useCallback(async (id: string) => {
    setRemoving(true)
    try {
      await onRemove(id)
      setConfirmId(null)
    } finally {
      setRemoving(false)
    }
  }, [onRemove])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 'var(--z-modal)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ws-manage-title"
        style={{
          background: 'var(--bg-elev)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)',
          padding: 'var(--sp-6)',
          width: '420px',
          maxWidth: '90vw',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-4)' }}>
          <h3
            id="ws-manage-title"
            style={{
              fontSize: 'var(--fs-lg)',
              fontWeight: 'var(--fw-semibold)',
              color: 'var(--text)',
              margin: 0,
            }}
          >
            {t('manage.title')}
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </Button>
        </div>

        {workspaces.length === 0 ? (
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', margin: 0 }}>
            {t('manage.empty')}
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            {workspaces.map((w) => (
              <li key={w.id}>
                <div
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-md)',
                    padding: 'var(--sp-3)',
                    background: 'var(--bg)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-2)' }}>
                    <div style={{ overflow: 'hidden' }}>
                      <div
                        style={{
                          fontSize: 'var(--fs-sm)',
                          fontWeight: 'var(--fw-medium)',
                          color: 'var(--text)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {w.name}
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--fs-xs)',
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          marginTop: 'var(--sp-1)',
                        }}
                      >
                        {w.root}
                      </div>
                    </div>
                    {confirmId !== w.id && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setConfirmId(w.id)}
                        aria-label={t('manage.removeAria', { name: w.name })}
                      >
                        {t('manage.remove')}
                      </Button>
                    )}
                  </div>

                  {/* 인라인 confirm UI */}
                  {confirmId === w.id && (
                    <div
                      style={{
                        marginTop: 'var(--sp-3)',
                        paddingTop: 'var(--sp-3)',
                        borderTop: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 'var(--sp-2)',
                      }}
                    >
                      <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
                        {t('manage.confirm')}
                      </span>
                      <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmId(null)}
                          disabled={removing}
                        >
                          {t('common.cancel')}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleConfirmRemove(w.id)}
                          disabled={removing}
                        >
                          {removing ? t('manage.removing') : t('manage.remove')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
