import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { IconButton, Checkbox, Button } from './ui'
import { useAppStore } from '../state/store'
import type { Language } from '../i18n'

export function Settings() {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [sshEnabled, setSshEnabled] = useState(false)
  const [language, setLanguage] = useState<Language>((i18n.language as Language) || 'en')
  const containerRef = useRef<HTMLDivElement>(null)

  const trackReadDocs = useAppStore((s) => s.trackReadDocs)
  const setTrackReadDocs = useAppStore((s) => s.setTrackReadDocs)

  useEffect(() => {
    window.api.prefs
      .get('experimentalFeatures.sshTransport')
      .then((v) => setSshEnabled(v === true))
      .catch(() => undefined)
  }, [])

  const handleSshToggle = useCallback(async (next: boolean) => {
    setSshEnabled(next)
    await window.api.prefs.set('experimentalFeatures.sshTransport', next)
  }, [])

  const handleLanguageChange = useCallback(
    async (next: Language) => {
      setLanguage(next)
      await i18n.changeLanguage(next)
      await window.api.prefs.set('language', next)
    },
    [i18n]
  )

  useEffect(() => {
    if (!open) return
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setConfirmClear(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        setConfirmClear(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  const handleToggle = useCallback(
    async (next: boolean) => {
      if (!next) {
        setConfirmClear(true)
        return
      }
      setTrackReadDocs(true)
      await window.api.prefs.set('trackReadDocs', true)
    },
    [setTrackReadDocs]
  )

  const handleConfirmClear = useCallback(async () => {
    useAppStore.setState({ trackReadDocs: false, readDocs: {} })
    setConfirmClear(false)
    await window.api.prefs.set('trackReadDocs', false)
    await window.api.prefs.set('readDocs', {})
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <IconButton
        aria-label={t('settings.aria')}
        aria-pressed={open}
        size="sm"
        variant={open ? 'primary' : 'ghost'}
        onClick={() => {
          setOpen((v) => !v)
          setConfirmClear(false)
        }}
      >
        <span style={{ fontSize: '15px', lineHeight: 1 }}>⚙</span>
      </IconButton>

      {open && (
        <div
          role="dialog"
          aria-label={t('settings.title')}
          style={{
            position: 'absolute',
            top: 'calc(100% + var(--sp-2))',
            right: 0,
            background: 'var(--bg-elev)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-xl)',
            padding: 'var(--sp-4)',
            width: '280px',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 'var(--z-dropdown)',
          }}
        >
          <h3
            style={{
              fontSize: 'var(--fs-sm)',
              fontWeight: 'var(--fw-semibold)',
              color: 'var(--text)',
              margin: '0 0 var(--sp-3)',
            }}
          >
            {t('settings.title')}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            <div>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', cursor: 'pointer' }}
                title={t('settings.trackReadDocsHint')}
              >
                <Checkbox
                  checked={trackReadDocs}
                  onChange={handleToggle}
                  aria-label={t('settings.trackReadDocs')}
                />
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)' }}>
                  {t('settings.trackReadDocs')}
                </span>
              </label>
              <p
                style={{
                  fontSize: 'var(--fs-xs)',
                  color: 'var(--text-muted)',
                  margin: 'var(--sp-1) 0 0 calc(16px + var(--sp-2))',
                }}
              >
                {t('settings.trackReadDocsHint')}
              </p>
            </div>

            {confirmClear && (
              <div
                style={{
                  borderTop: '1px solid var(--border)',
                  paddingTop: 'var(--sp-3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--sp-2)',
                }}
              >
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                  {t('settings.confirmClear')}
                </span>
                <div style={{ display: 'flex', gap: 'var(--sp-2)', justifyContent: 'flex-end' }}>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button variant="danger" size="sm" onClick={handleConfirmClear}>
                    {t('settings.clearButton')}
                  </Button>
                </div>
              </div>
            )}

            {/* 언어 토글 */}
            <div
              style={{
                borderTop: '1px solid var(--border)',
                paddingTop: 'var(--sp-3)',
                marginTop: 'var(--sp-2)',
              }}
            >
              <h4
                style={{
                  fontSize: 'var(--fs-xs)',
                  fontWeight: 'var(--fw-semibold)',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  margin: '0 0 var(--sp-2)',
                }}
              >
                {t('language.label')}
              </h4>
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <Button
                  variant={language === 'ko' ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => handleLanguageChange('ko')}
                >
                  {t('language.ko')}
                </Button>
                <Button
                  variant={language === 'en' ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => handleLanguageChange('en')}
                >
                  {t('language.en')}
                </Button>
              </div>
              <p
                style={{
                  fontSize: 'var(--fs-xs)',
                  color: 'var(--text-muted)',
                  margin: 'var(--sp-2) 0 0',
                }}
              >
                {t('language.hint')}
              </p>
            </div>

            {/* Beta features */}
            <div
              style={{
                borderTop: '1px solid var(--border)',
                paddingTop: 'var(--sp-3)',
                marginTop: 'var(--sp-2)',
              }}
            >
              <h4
                style={{
                  fontSize: 'var(--fs-xs)',
                  fontWeight: 'var(--fw-semibold)',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  margin: '0 0 var(--sp-2)',
                }}
              >
                {t('settings.experimentalSection')}
              </h4>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', cursor: 'pointer' }}
                title={t('settings.sshTransportTitle')}
              >
                <Checkbox
                  checked={sshEnabled}
                  onChange={handleSshToggle}
                  aria-label={t('settings.sshTransport')}
                />
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)' }}>
                  {t('settings.sshTransport')}
                </span>
              </label>
              <p
                style={{
                  fontSize: 'var(--fs-xs)',
                  color: 'var(--text-muted)',
                  margin: 'var(--sp-1) 0 0 calc(16px + var(--sp-2))',
                }}
              >
                <Trans i18nKey="settings.sshTransportHint">
                  원격 서버의 마크다운 문서를 읽기 전용으로 볼 수 있습니다. 변경 후 <strong>앱을 재시작</strong>해주세요.
                </Trans>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
