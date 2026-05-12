import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button } from './ui'

interface ProductGuideModalProps {
  onClose: () => void
}

const GUIDE_SECTIONS = [
  'why',
  'wiki',
  'search',
  'handoff',
  'ssh',
  'install',
] as const

const GUIDE_TIPS = ['cmdk', 'wiki', 'ssh', 'handoff', 'install'] as const

export function ProductGuideModal({ onClose }: ProductGuideModalProps) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const id = setTimeout(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')
      first?.focus()
    }, 0)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

  const modal = (
    <div
      data-product-guide-modal-root=""
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.48)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 'calc(var(--sp-8) + env(safe-area-inset-top, 0px)) var(--sp-4) var(--sp-4)',
        overflowY: 'auto',
        zIndex: 'calc(var(--z-modal) + 30)',
        boxSizing: 'border-box',
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-guide-title"
        style={{
          width: 'min(760px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 56px)',
          overflowY: 'auto',
          background:
            'radial-gradient(circle at top left, color-mix(in srgb, var(--accent) 14%, transparent) 0, transparent 32%), linear-gradient(135deg, var(--bg-elev) 0%, var(--bg) 100%)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)',
          boxShadow: 'var(--shadow-lg)',
          padding: 'var(--sp-6)',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-5)',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--sp-4)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            <span
              style={{
                color: 'var(--accent)',
                fontSize: 'var(--fs-xs)',
                fontWeight: 'var(--fw-semibold)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {t('productGuide.kicker')}
            </span>
            <h2
              id="product-guide-title"
              style={{
                margin: 0,
                color: 'var(--text)',
                fontSize: 'var(--fs-2xl)',
                fontWeight: 'var(--fw-bold)',
                letterSpacing: '-0.02em',
              }}
            >
              {t('productGuide.title')}
            </h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-relaxed)' }}>
              {t('productGuide.intro')}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </Button>
        </header>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
            gap: 'var(--sp-3)',
            minWidth: 0,
          }}
        >
          {GUIDE_SECTIONS.map((key) => (
            <section
              key={key}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-lg)',
                background: 'color-mix(in srgb, var(--bg-elev) 86%, transparent)',
                padding: 'var(--sp-4)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--sp-2)',
                minWidth: 0,
              }}
            >
              <h3 style={{ margin: 0, color: 'var(--text)', fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-semibold)' }}>
                {t(`productGuide.sections.${key}.title`)}
              </h3>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-relaxed)' }}>
                {t(`productGuide.sections.${key}.body`)}
              </p>
            </section>
          ))}
        </div>

        <section
          style={{
            border: '1px solid color-mix(in srgb, var(--accent) 24%, var(--border))',
            borderRadius: 'var(--r-lg)',
            background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-elev))',
            padding: 'var(--sp-4)',
          }}
        >
          <h3 style={{ margin: '0 0 var(--sp-3)', color: 'var(--text)', fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-semibold)' }}>
            {t('productGuide.tipsTitle')}
          </h3>
          <ul style={{ margin: 0, paddingInlineStart: '1.2rem', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-relaxed)' }}>
            {GUIDE_TIPS.map((key) => (
              <li key={key}>{t(`productGuide.tips.${key}`)}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
