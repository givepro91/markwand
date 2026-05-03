import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation, Trans } from 'react-i18next'
import { IconButton, Checkbox, Button } from './ui'
import { useAppStore } from '../state/store'
import type { Language } from '../i18n'
import type { ProjectOpenerId, ProjectOpenerInfo } from '../../preload/types'

const coreFallbackOpeners: ProjectOpenerInfo[] = [
  { id: 'vscode', label: 'VS Code', available: true },
  { id: 'terminal', label: 'Terminal', available: true },
  { id: 'finder', label: 'Finder', available: true },
]

export function Settings() {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [sshEnabled, setSshEnabled] = useState(false)
  const [sshPurgeChecked, setSshPurgeChecked] = useState(false)
  const [language, setLanguage] = useState<Language>((i18n.language as Language) || 'en')
  const [projectOpeners, setProjectOpeners] = useState<ProjectOpenerInfo[]>([])
  const [defaultProjectOpener, setDefaultProjectOpener] = useState<ProjectOpenerId>('finder')
  const containerRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [dialogPosition, setDialogPosition] = useState<{ top: number; right: number }>({ top: 64, right: 16 })

  const trackReadDocs = useAppStore((s) => s.trackReadDocs)
  const setTrackReadDocs = useAppStore((s) => s.setTrackReadDocs)

  useEffect(() => {
    window.api.prefs
      .get('experimentalFeatures.sshTransport')
      .then((v) => setSshEnabled(v === true))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void Promise.all([
      window.api.projectOpeners.list().catch(() => coreFallbackOpeners),
      window.api.prefs.get('defaultProjectOpener').catch(() => undefined),
    ]).then(([openers, saved]) => {
      if (cancelled) return
      const safeOpeners = openers.some((opener) => opener.id === 'finder')
        ? openers
        : [...openers, { id: 'finder' as const, label: 'Finder', available: true }]
      setProjectOpeners(safeOpeners)
      const available = safeOpeners.filter((opener) => opener.available)
      let nextDefault: ProjectOpenerId = 'finder'
      if (
        saved === 'vscode' ||
        saved === 'cursor' ||
        saved === 'finder' ||
        saved === 'terminal' ||
        saved === 'iterm2' ||
        saved === 'ghostty' ||
        saved === 'xcode' ||
        saved === 'intellij'
      ) {
        nextDefault = saved
      }
      if (available.length > 0 && !available.some((opener) => opener.id === nextDefault)) {
        nextDefault = available.some((opener) => opener.id === 'finder') ? 'finder' : available[0].id
      }
      setDefaultProjectOpener(nextDefault)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const trigger = containerRef.current?.getBoundingClientRect()
      if (!trigger) return
      setDialogPosition({
        top: Math.min(Math.max(trigger.bottom + 8, 48), window.innerHeight - 80),
        right: Math.max(16, window.innerWidth - trigger.right),
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  const handleSshToggle = useCallback(async (next: boolean) => {
    setSshEnabled(next)
    await window.api.prefs.set('experimentalFeatures.sshTransport', next)
    // S5-7 — OFF + purge 체크 시 SSH 데이터 전체 삭제
    if (!next && sshPurgeChecked) {
      await window.api.ssh.purgeAll().catch(() => undefined)
      setSshPurgeChecked(false)
    }
  }, [sshPurgeChecked])

  const handleLanguageChange = useCallback(
    async (next: Language) => {
      setLanguage(next)
      await i18n.changeLanguage(next)
      await window.api.prefs.set('language', next)
    },
    [i18n]
  )

  const handleDefaultProjectOpenerChange = useCallback(async (next: ProjectOpenerId) => {
    setDefaultProjectOpener(next)
    await window.api.prefs.set('defaultProjectOpener', next)
  }, [])

  const availableProjectOpeners = projectOpeners.filter((opener) => opener.available)

  useEffect(() => {
    if (!open) return
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      const inTrigger = containerRef.current?.contains(target)
      const inDialog = dialogRef.current?.contains(target)
      if (!inTrigger && !inDialog) {
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

      {open && createPortal(
        <div
          ref={dialogRef}
          data-settings-popover-root=""
          role="dialog"
          aria-label={t('settings.title')}
          style={{
            position: 'fixed',
            top: `${dialogPosition.top}px`,
            right: `${dialogPosition.right}px`,
            background: 'var(--bg-elev)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-xl)',
            padding: 'var(--sp-4)',
            width: 'min(320px, calc(100vw - 32px))',
            maxHeight: `min(640px, calc(100vh - ${dialogPosition.top + 16}px))`,
            overflowY: 'auto',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 'calc(var(--z-modal) + 30)',
            boxSizing: 'border-box',
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

            {/* 프로젝트 열기 기본값 */}
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
                {t('projectOpen.settingsTitle')}
              </h4>
              <select
                value={defaultProjectOpener}
                onChange={(e) => handleDefaultProjectOpenerChange(e.target.value as ProjectOpenerId)}
                aria-label={t('projectOpen.settingsSelectAria')}
                style={{
                  width: '100%',
                  height: '34px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                  fontSize: 'var(--fs-sm)',
                  padding: '0 var(--sp-3)',
                }}
              >
                {availableProjectOpeners.map((opener) => (
                  <option key={opener.id} value={opener.id}>
                    {opener.label}
                  </option>
                ))}
              </select>
              <p
                style={{
                  fontSize: 'var(--fs-xs)',
                  color: 'var(--text-muted)',
                  margin: 'var(--sp-2) 0 0',
                  lineHeight: 'var(--lh-relaxed)',
                }}
              >
                {availableProjectOpeners.length > 0
                  ? t('projectOpen.settingsHint')
                  : t('projectOpen.settingsEmpty')}
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
              {/* S5-7 — SSH OFF 시 purge 옵션 */}
              {!sshEnabled && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 'var(--sp-2)',
                    cursor: 'pointer',
                    marginTop: 'var(--sp-2)',
                    marginLeft: 'calc(16px + var(--sp-2))',
                  }}
                >
                  <Checkbox
                    checked={sshPurgeChecked}
                    onChange={setSshPurgeChecked}
                    aria-label={t('settings.ssh.purgeOption')}
                  />
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                    {t('settings.ssh.purgeOption')}
                  </span>
                </label>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
