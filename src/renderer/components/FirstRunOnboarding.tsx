import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui'

interface FirstRunOnboardingProps {
  onClose: () => void
}

/**
 * v0.4 C3 — 첫 워크스페이스 추가 직후 1회 노출되는 핵심 개념 오버레이.
 * 워크스페이스/프로젝트 관계가 UI 로 설명되지 않아 신규 사용자가 혼란 겪음.
 * prefs.onboardingShown === true 이면 렌더 측에서 mount 자체 skip.
 */
export function FirstRunOnboarding({ onClose }: FirstRunOnboardingProps) {
  const { t } = useTranslation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const steps = [
    { key: 'step1', icon: '📁' },
    { key: 'step2', icon: '📦' },
    { key: 'step3', icon: '⌨️' },
  ] as const

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-run-onboarding-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 'var(--z-modal)' as unknown as number,
        padding: 'var(--sp-6)',
      }}
    >
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--shadow-lg)',
          maxWidth: '720px',
          width: '100%',
          padding: 'var(--sp-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-5)',
        }}
      >
        <h2
          id="first-run-onboarding-title"
          style={{
            fontSize: 'var(--fs-xl)',
            fontWeight: 'var(--fw-semibold)',
            color: 'var(--text)',
            margin: 0,
          }}
        >
          {t('empty.title')}
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 'var(--sp-4)',
          }}
        >
          {steps.map((s) => (
            <div
              key={s.key}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--sp-2)',
                padding: 'var(--sp-4)',
                background: 'var(--bg-elev)',
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--border-muted)',
              }}
            >
              <div style={{ fontSize: '24px' }} aria-hidden="true">
                {s.icon}
              </div>
              <div
                style={{
                  fontSize: 'var(--fs-md)',
                  fontWeight: 'var(--fw-semibold)',
                  color: 'var(--text)',
                }}
              >
                {t(`onboarding.${s.key}.title`)}
              </div>
              <div
                style={{
                  fontSize: 'var(--fs-sm)',
                  color: 'var(--text-muted)',
                  lineHeight: 'var(--lh-normal)',
                }}
              >
                {t(`onboarding.${s.key}.body`)}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
          <Button variant="primary" onClick={onClose}>
            {t('onboarding.start')}
          </Button>
        </div>
      </div>
    </div>
  )
}
