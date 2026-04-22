import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui'
import type { TerminalType } from '../../../src/preload/types'

interface ClaudeButtonProps {
  projectDir: string
  terminal?: TerminalType
}

export function ClaudeButton({ projectDir, terminal = 'Terminal' }: ClaudeButtonProps) {
  const { t } = useTranslation()
  const [available, setAvailable] = useState<boolean | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [isLaunching, setIsLaunching] = useState(false)
  const [rechecking, setRechecking] = useState(false)
  const triggerWrapRef = useRef<HTMLSpanElement | null>(null)
  const modalRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    window.api.claude.check().then((result) => {
      setAvailable(result.available)
    })
  }, [])

  const handleClick = useCallback(async () => {
    if (available === null || isLaunching) return

    if (!available) {
      setShowModal(true)
      return
    }

    setIsLaunching(true)
    try {
      const result = await window.api.claude.open(projectDir, terminal)
      if (!result.ok) {
        console.error('claude 열기 실패:', result.reason)
      }
    } finally {
      setIsLaunching(false)
    }
  }, [available, isLaunching, projectDir, terminal])

  const closeModal = useCallback(() => {
    setShowModal(false)
    const btn = triggerWrapRef.current?.querySelector<HTMLButtonElement>('button')
    btn?.focus()
  }, [])

  // 모달 열릴 때 첫 포커서블에 focus
  useEffect(() => {
    if (showModal) {
      const id = setTimeout(() => {
        const first = modalRef.current?.querySelector<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        first?.focus()
      }, 0)
      return () => clearTimeout(id)
    }
  }, [showModal])

  // 모달 열린 동안 Esc 키 핸들러
  useEffect(() => {
    if (!showModal) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeModal()
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
  }, [showModal, closeModal])

  const handleRecheck = useCallback(async () => {
    setRechecking(true)
    try {
      const result = await window.api.claude.check()
      setAvailable(result.available)
      if (result.available) {
        setShowModal(false)
      }
    } finally {
      setRechecking(false)
    }
  }, [])

  const handleRevealInFinder = useCallback(() => {
    window.api.shell.revealInFinder(projectDir)
    closeModal()
  }, [projectDir, closeModal])

  return (
    <>
      <span ref={triggerWrapRef} style={{ display: 'contents' }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClick}
          disabled={isLaunching || available === null}
          aria-label={t('claudeCli.openAria')}
        >
          {t('claudeCli.open')}{isLaunching ? t('claudeCli.opening') : ''}
        </Button>
      </span>

      {showModal && (
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
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="claude-modal-title"
            style={{
              background: 'var(--bg-elev)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-xl)',
              padding: 'var(--sp-6)',
              maxWidth: '360px',
              width: '90%',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <h3
              id="claude-modal-title"
              style={{
                fontSize: 'var(--fs-lg)',
                fontWeight: 'var(--fw-semibold)',
                marginBottom: 'var(--sp-3)',
                color: 'var(--text)',
              }}
            >
              {t('claudeCli.notFoundTitle')}
            </h3>
            <p
              style={{
                fontSize: 'var(--fs-sm)',
                color: 'var(--text-muted)',
                marginBottom: 'var(--sp-5)',
                lineHeight: 'var(--lh-normal)',
              }}
            >
              {t('claudeCli.notFoundDetail')}
            </p>
            <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  window.api.shell.openExternal('https://docs.anthropic.com/en/docs/claude-code/getting-started')
                }}
              >
                {t('claudeCli.installGuide')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRecheck}
                disabled={rechecking}
              >
                {rechecking ? t('claudeCli.rechecking') : t('claudeCli.recheck')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRevealInFinder}
              >
                {t('claudeCli.revealFinder')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={closeModal}
              >
                {t('claudeCli.close')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
