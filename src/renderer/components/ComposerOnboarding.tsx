import { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui'

interface ComposerOnboardingProps {
  onDismiss: () => void
}

// 첫 실행 시 FileTree 위에 1회 표시되는 말풍선.
// "빈 상태는 숨김" 정책 때문에 Composer Tray가 보이지 않는 순간 — 기능 발견성을 위해 필요.
export function ComposerOnboarding({ onDismiss }: ComposerOnboardingProps) {
  const { t } = useTranslation()
  const container: CSSProperties = {
    margin: 'var(--sp-3)',
    padding: 'var(--sp-3)',
    background: 'var(--bg-elev)',
    border: '1px solid var(--accent)',
    borderRadius: 'var(--r-md)',
    boxShadow: 'var(--shadow-md)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-2)',
    position: 'relative',
  }

  const title: CSSProperties = {
    fontSize: 'var(--fs-sm)',
    fontWeight: 'var(--fw-semibold)',
    color: 'var(--text)',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
  }

  const body: CSSProperties = {
    fontSize: 'var(--fs-xs)',
    color: 'var(--text-muted)',
    lineHeight: 'var(--lh-normal)',
  }

  return (
    <div style={container} role="note" aria-label={t('composer.onboardingAria')}>
      <div style={title}>
        <span aria-hidden>☑</span>
        <span>{t('composer.onboardingBadge')}</span>
      </div>
      <div style={body}>
        {t('composer.onboardingBody')}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" size="sm" onClick={onDismiss}>
          {t('composer.onboardingAck')}
        </Button>
      </div>
    </div>
  )
}
