// SshWorkspaceAddModal — Plan Follow-up FS2/FS5/FS8/FS9.
//
// SSH workspace 등록 폼. 제출 시 window.api.workspace.addSsh(...) 호출 → TOFU 모달이
// 뒤따라 자동 트리거됨(main hostVerifier bridge). Modal 닫기 전까지 loading 상태 유지(RF-5).
//
// FS9 UX 개선:
//   - 전면 한국어화 (host → 서버 주소, user → 계정 등)
//   - 원격 폴더 picker (root 를 직접 탐색하여 선택 가능)
//   - mode 용어 리네이밍 (단일 → "이 폴더 하나만", 컨테이너 → "여러 프로젝트 상위 폴더")
//   - 인증 방식 라벨 풀어쓰기 (ssh-agent → "자동 로그인(권장)", key-file → "열쇠 파일 지정")
//   - 에러 맵 확장 (타임아웃/인증실패/네트워크/권한 거부 등)

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, KeyboardEvent } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import type {
  SshAuthConfig,
  LoadSshConfigResult,
  SshConfigHost,
  SshBrowseFolderResult,
} from '../../../src/preload/types'
import { Button } from './ui'
import { humanizeError } from '../lib/humanizeError'

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (input: {
    name: string
    host: string
    port: number
    user: string
    auth: SshAuthConfig
    root: string
    mode: 'container' | 'single'
  }) => Promise<void>
}

export const SshWorkspaceAddModal = memo(function SshWorkspaceAddModal({
  open,
  onClose,
  onSubmit,
}: Props) {
  const { t } = useTranslation()
  // S6-1 — 2-step wizard
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [user, setUser] = useState('')
  const [authKind, setAuthKind] = useState<'agent' | 'key-file' | ''>('')
  const [keyFilePath, setKeyFilePath] = useState('')
  const [root, setRoot] = useState('')
  // FS9-B — 베타에서는 single 강제. container 는 비활성화(원격 RTT × N 비용 큼 · UX 감사 결과).
  // 향후 v1.0 에서 고급 옵션으로 재활성 가능.
  const mode: 'container' | 'single' = 'single'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Follow-up FS5 — ~/.ssh/config import 상태
  const [sshConfig, setSshConfig] = useState<LoadSshConfigResult | null>(null)
  const [selectedAlias, setSelectedAlias] = useState<string>('')
  const [configLoadFailed, setConfigLoadFailed] = useState(false)

  // Follow-up FS9 — 원격 폴더 picker 상태
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerPath, setPickerPath] = useState<string>('/')
  const [pickerEntries, setPickerEntries] = useState<SshBrowseFolderResult['entries']>([])
  const [pickerParent, setPickerParent] = useState<string | null>(null)
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerError, setPickerError] = useState<string | null>(null)

  const nameRef = useRef<HTMLInputElement | null>(null)
  const step2FirstRef = useRef<HTMLInputElement | null>(null)
  const errorRef = useRef<HTMLDivElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  // S6-2 — trigger 요소 복귀용 ref
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement
      if (step === 1 && nameRef.current) nameRef.current.focus()
      else if (step === 2 && step2FirstRef.current) step2FirstRef.current.focus()
    }
  }, [open, step])

  // S6-2 — focus trap
  useEffect(() => {
    if (!open) return
    const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const el = dialogRef.current
      if (!el) return
      const focusable = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [open])

  // 에러 발생 시 focus 이동 (UX Audit A6 반영)
  useEffect(() => {
    if (error && errorRef.current) errorRef.current.focus()
  }, [error])

  useEffect(() => {
    if (!open || sshConfig || configLoadFailed) return
    window.api.ssh
      .loadConfig()
      .then(setSshConfig)
      .catch(() => setConfigLoadFailed(true))
  }, [open, sshConfig, configLoadFailed])

  const handleSelectConfigHost = useCallback((alias: string) => {
    setSelectedAlias(alias)
    if (!alias || !sshConfig) return
    const h: SshConfigHost | undefined = sshConfig.hosts.find((x) => x.alias === alias)
    if (!h) return
    if (!name) setName(alias)
    setHost(h.hostname ?? alias)
    if (h.port !== undefined) setPort(String(h.port))
    if (h.user) setUser(h.user)
    if (h.identityFile && h.identityFile.length > 0) {
      setAuthKind('key-file')
      setKeyFilePath(h.identityFile[0])
    }
  }, [name, sshConfig])

  const reset = useCallback(() => {
    setStep(1)
    setName('')
    setHost('')
    setPort('22')
    setUser('')
    setAuthKind('')
    setKeyFilePath('')
    setRoot('')
    setError(null)
    setLoading(false)
    setSelectedAlias('')
    setPickerOpen(false)
    setPickerPath('/')
    setPickerEntries([])
    setPickerParent(null)
    setPickerError(null)
  }, [])

  const handleClose = useCallback(() => {
    if (loading) return
    reset()
    onClose()
    // S6-2 — 모달 닫힌 후 trigger 요소로 focus 복귀
    setTimeout(() => triggerRef.current?.focus(), 0)
  }, [loading, onClose, reset])

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (pickerOpen) {
          setPickerOpen(false)
          return
        }
        handleClose()
      }
    },
    [handleClose, pickerOpen],
  )

  // 폴더 탐색 — 접속 정보 검증 후 IPC 호출.
  const openPicker = useCallback(async () => {
    setPickerError(null)
    // 사전 검증
    if (!host.trim() || !user.trim()) {
      setPickerError(t('ssh.add.picker.errHostUser'))
      return
    }
    const portNum = parseInt(port, 10)
    if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
      setPickerError(t('ssh.add.picker.errPort'))
      return
    }
    let authInput: SshAuthConfig
    if (authKind === 'agent') {
      authInput = { kind: 'agent' }
    } else {
      const kp = keyFilePath.trim()
      if (!kp) {
        setPickerError(t('ssh.add.picker.errKey'))
        return
      }
      authInput = { kind: 'key-file', path: kp }
    }

    // 기본 경로: 기존 root 가 있으면 사용, 없으면 /home/{user} 추측 → 실패 시 /
    const startPath = root.trim() || `/home/${user.trim()}`
    setPickerPath(startPath)
    setPickerOpen(true)
    setPickerLoading(true)
    try {
      const result = await window.api.ssh.browseFolder({
        host: host.trim(),
        port: portNum,
        user: user.trim(),
        auth: authInput,
        path: startPath,
      })
      setPickerEntries(result.entries)
      setPickerPath(result.path)
      setPickerParent(result.parent)
    } catch (err) {
      // /home/{user} 가 없으면 / 로 재시도
      if (startPath !== '/') {
        try {
          const result = await window.api.ssh.browseFolder({
            host: host.trim(),
            port: portNum,
            user: user.trim(),
            auth: authInput,
            path: '/',
          })
          setPickerEntries(result.entries)
          setPickerPath(result.path)
          setPickerParent(result.parent)
        } catch (err2) {
          setPickerError(humanizeError(t, err2 instanceof Error ? err2.message : String(err2)))
        }
      } else {
        setPickerError(humanizeError(t, err instanceof Error ? err.message : String(err)))
      }
    } finally {
      setPickerLoading(false)
    }
  }, [authKind, host, keyFilePath, port, root, user])

  const navigatePicker = useCallback(
    async (target: string) => {
      setPickerLoading(true)
      setPickerError(null)
      try {
        const portNum = parseInt(port, 10)
        const authInput: SshAuthConfig =
          authKind === 'agent' ? { kind: 'agent' } : { kind: 'key-file', path: keyFilePath.trim() }
        const result = await window.api.ssh.browseFolder({
          host: host.trim(),
          port: portNum,
          user: user.trim(),
          auth: authInput,
          path: target,
        })
        setPickerEntries(result.entries)
        setPickerPath(result.path)
        setPickerParent(result.parent)
      } catch (err) {
        setPickerError(humanizeError(t, err instanceof Error ? err.message : String(err)))
      } finally {
        setPickerLoading(false)
      }
    },
    [authKind, host, keyFilePath, port, user, t],
  )

  const confirmPickerSelection = useCallback(() => {
    setRoot(pickerPath)
    setPickerOpen(false)
  }, [pickerPath])

  // S6-1 — step1 검증 후 step2 이동
  const handleNext = useCallback(() => {
    setError(null)
    if (!name.trim()) { setError(t('ssh.add.name') + ' ' + t('error.keyPathRequired')); return }
    if (!host.trim()) { setError(t('ssh.add.host') + ' 입력 필요'); return }
    if (!user.trim()) { setError(t('ssh.add.user') + ' 입력 필요'); return }
    const portNum = parseInt(port, 10)
    if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
      setError(t('error.portRange'))
      return
    }
    setStep(2)
  }, [name, host, user, port, t])

  const handlePrev = useCallback(() => {
    setError(null)
    setStep(1)
  }, [])

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (loading) return
      setError(null)
      const portNum = parseInt(port, 10)
      if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
        setError(t('error.portRange'))
        return
      }
      if (!authKind) {
        setError(t('ssh.add.authSection') + ' 선택 필요')
        return
      }
      let auth: SshAuthConfig
      if (authKind === 'agent') {
        auth = { kind: 'agent' }
      } else {
        const trimmedKeyPath = keyFilePath.trim()
        if (!trimmedKeyPath) {
          setError(t('error.keyPathRequired'))
          return
        }
        auth = { kind: 'key-file', path: trimmedKeyPath }
      }
      try {
        setLoading(true)
        await onSubmit({
          name: name.trim(),
          host: host.trim(),
          port: portNum,
          user: user.trim(),
          auth,
          root: root.trim(),
          mode,
        })
        reset()
        onClose()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(humanizeError(t, message))
        setLoading(false)
      }
    },
    [authKind, host, keyFilePath, loading, mode, name, onClose, onSubmit, port, reset, root, t, user],
  )

  if (!open) return null

  const backdropStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  }
  const dialogStyle: CSSProperties = {
    background: 'var(--bg)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-md)',
    padding: 'var(--sp-5)',
    maxWidth: '560px',
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: 'var(--shadow-lg, 0 16px 48px rgba(0,0,0,0.25))',
  }
  const fieldStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-1)',
    marginBottom: 'var(--sp-3)',
  }
  const labelStyle: CSSProperties = {
    fontSize: 'var(--fs-sm)',
    fontWeight: 'var(--fw-medium)',
    color: 'var(--text)',
  }
  const inputStyle: CSSProperties = {
    padding: 'var(--sp-2) var(--sp-3)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)',
    background: 'var(--bg-elev)',
    color: 'var(--text)',
    fontSize: 'var(--fs-sm)',
  }
  const hintStyle: CSSProperties = {
    fontSize: 'var(--fs-xs)',
    color: 'var(--text-muted)',
  }
  const errorStyle: CSSProperties = {
    padding: 'var(--sp-3)',
    background: 'var(--danger-bg, #fee)',
    color: 'var(--danger-fg, var(--danger, #c00))',
    border: '1px solid var(--danger-fg, var(--danger, #c00))',
    borderRadius: 'var(--r-sm)',
    fontSize: 'var(--fs-sm)',
    marginBottom: 'var(--sp-3)',
  }

  return (
    <div style={backdropStyle} onKeyDown={onKeyDown}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ssh-add-title"
        style={dialogStyle}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-2)' }}>
          <h2
            id="ssh-add-title"
            style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-semibold)' }}
          >
            {step === 1 ? t('ssh.add.step1Title') : t('ssh.add.step2Title')}
          </h2>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
            {t('ssh.add.stepIndicator', { step, total: 2 })}
          </span>
        </div>
        <p style={{ ...hintStyle, margin: '0 0 var(--sp-4)' }}>
          {t('ssh.add.description')}
        </p>

        {error && (
          <div id="ssh-add-error" role="alert" ref={errorRef} tabIndex={-1} style={errorStyle}>
            {error}
          </div>
        )}

        {/* Follow-up FS5 — ~/.ssh/config import 섹션 (Step1에만 표시) */}
        {step === 1 && sshConfig && sshConfig.exists && sshConfig.hosts.length > 0 && (
          <div
            style={{
              padding: 'var(--sp-3)',
              background: 'var(--bg-elev)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)',
              marginBottom: 'var(--sp-4)',
            }}
          >
            <label
              htmlFor="ssh-config-select"
              style={{ ...labelStyle, display: 'block', marginBottom: 'var(--sp-2)' }}
            >
              {t('ssh.add.configSection')}
            </label>
            <select
              id="ssh-config-select"
              value={selectedAlias}
              onChange={(e) => handleSelectConfigHost(e.target.value)}
              disabled={loading}
              style={{
                ...inputStyle,
                width: '100%',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              <option value="">{t('ssh.add.configDirect')}</option>
              {sshConfig.hosts.map((h) => (
                <option key={h.alias} value={h.alias}>
                  {h.alias}
                  {h.user && h.hostname ? ` (${h.user}@${h.hostname}${h.port && h.port !== 22 ? ':' + h.port : ''})` : ''}
                </option>
              ))}
            </select>
            {selectedAlias && sshConfig.hosts.find((h) => h.alias === selectedAlias)?.proxyJump && (
              <p style={{ ...hintStyle, marginTop: 'var(--sp-1)', color: 'var(--accent)' }}>
                <span aria-hidden="true">ℹ</span> {t('ssh.add.configProxyJumpNote')}
              </p>
            )}
            {sshConfig.permissionWarning && (
              <p style={{ ...hintStyle, marginTop: 'var(--sp-1)', color: 'var(--text-muted)' }}>
                <span aria-hidden="true">⚠</span> {sshConfig.permissionWarning}
              </p>
            )}
            {sshConfig.rejected.length > 0 && (
              <details style={{ marginTop: 'var(--sp-2)' }}>
                <summary style={{ ...hintStyle, cursor: 'pointer' }}>
                  {t('ssh.add.configRejectedSummary', { count: sshConfig.rejected.length })}
                </summary>
                <ul style={{ margin: 'var(--sp-1) 0 0', paddingLeft: 'var(--sp-4)', fontSize: 'var(--fs-xs)' }}>
                  {sshConfig.rejected.map((r) => (
                    <li key={r.alias} style={{ color: 'var(--text-muted)' }}>
                      <code>{r.alias}</code> — {r.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        {step === 1 && sshConfig && sshConfig.exists && sshConfig.hosts.length === 0 && !sshConfig.permissionWarning && (
          <p style={{ ...hintStyle, marginBottom: 'var(--sp-3)' }}>
            {t('ssh.add.configEmpty')}
          </p>
        )}

        <form onSubmit={step === 1 ? (e) => { e.preventDefault(); handleNext() } : handleSubmit}>
          {/* S6-1 Step1 — 이름·주소·계정 */}
          {step === 1 && (
            <>
              <div style={fieldStyle}>
                <label htmlFor="ssh-name" style={labelStyle}>
                  {t('ssh.add.name')} <span style={hintStyle}>{t('ssh.add.nameSub')}</span>
                </label>
                <input
                  id="ssh-name"
                  ref={nameRef}
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('ssh.add.namePlaceholder')}
                  style={inputStyle}
                  disabled={loading}
                  aria-invalid={!name && error ? 'true' : 'false'}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 'var(--sp-3)' }}>
                <div style={fieldStyle}>
                  <label htmlFor="ssh-host" style={labelStyle}>{t('ssh.add.host')}</label>
                  <input
                    id="ssh-host"
                    type="text"
                    required
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder={t('ssh.add.hostPlaceholder')}
                    style={inputStyle}
                    disabled={loading}
                    aria-invalid={!host && error ? 'true' : 'false'}
                    aria-describedby={!host && error ? 'ssh-add-error' : undefined}
                  />
                </div>
                <div style={fieldStyle}>
                  <label htmlFor="ssh-port" style={labelStyle}>{t('ssh.add.port')}</label>
                  <input
                    id="ssh-port"
                    type="number"
                    min={1}
                    max={65535}
                    required
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    style={inputStyle}
                    disabled={loading}
                    aria-invalid={error && error.includes('포트') ? 'true' : 'false'}
                    aria-describedby={error && error.includes('포트') ? 'ssh-add-error' : undefined}
                  />
                </div>
              </div>

              <div style={fieldStyle}>
                <label htmlFor="ssh-user" style={labelStyle}>{t('ssh.add.user')}</label>
                <input
                  id="ssh-user"
                  type="text"
                  required
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder={t('ssh.add.userPlaceholder')}
                  style={inputStyle}
                  disabled={loading}
                  aria-invalid={!user && error ? 'true' : 'false'}
                />
              </div>
            </>
          )}

          {/* S6-1 Step2 — 인증·폴더 */}
          {step === 2 && (
            <>
          <fieldset
            style={{ ...fieldStyle, border: 'none', padding: 0, margin: '0 0 var(--sp-3)' }}
          >
            <legend style={{ ...labelStyle, marginBottom: 'var(--sp-1)' }}>{t('ssh.add.authSection')}</legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-1)' }}>
              <label style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'flex-start', fontSize: 'var(--fs-sm)', cursor: 'pointer' }}>
                <input
                  ref={step2FirstRef}
                  type="radio"
                  name="auth"
                  value="agent"
                  checked={authKind === 'agent'}
                  onChange={() => setAuthKind('agent')}
                  disabled={loading}
                  style={{ marginTop: '3px' }}
                />
                <span>
                  <strong>{t('ssh.add.authAgent')}</strong>
                  <br />
                  <span style={hintStyle}>
                    <Trans
                      i18nKey="ssh.add.authAgentHint"
                      values={{ user: user || '...', host: host || '...' }}
                    >
                      시스템의 ssh-agent 를 사용합니다. 터미널에서 <code></code> 로 접속할 수 있다면 이 방식이 가능합니다.
                    </Trans>
                  </span>
                </span>
              </label>
              <label style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'flex-start', fontSize: 'var(--fs-sm)', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="auth"
                  value="key-file"
                  checked={authKind === 'key-file'}
                  onChange={() => setAuthKind('key-file')}
                  disabled={loading}
                  style={{ marginTop: '3px' }}
                />
                <span>
                  <strong>{t('ssh.add.authKeyFile')}</strong>
                  <br />
                  <span style={hintStyle}>{t('ssh.add.authKeyFileHint')}</span>
                </span>
              </label>
            </div>
          </fieldset>

          {authKind === 'key-file' && (
            <div style={fieldStyle}>
              <label htmlFor="ssh-keypath" style={labelStyle}>{t('ssh.add.keyPath')}</label>
              <input
                id="ssh-keypath"
                type="text"
                required
                value={keyFilePath}
                onChange={(e) => setKeyFilePath(e.target.value)}
                placeholder={t('ssh.add.keyPathPlaceholder')}
                style={inputStyle}
                disabled={loading}
              />
              <span style={hintStyle}>{t('ssh.add.keyPathHint')}</span>
            </div>
          )}

          <div style={fieldStyle}>
            <label htmlFor="ssh-root" style={labelStyle}>{t('ssh.add.root')}</label>
            <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
              <input
                id="ssh-root"
                type="text"
                required
                value={root}
                onChange={(e) => setRoot(e.target.value)}
                placeholder={t('ssh.add.rootPlaceholder')}
                style={{ ...inputStyle, flex: 1 }}
                disabled={loading || pickerOpen}
              />
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={openPicker}
                disabled={loading || pickerOpen}
                aria-label={t('ssh.add.rootBrowseAria')}
              >
                {t('ssh.add.rootBrowse')}
              </Button>
            </div>
            <span style={hintStyle}>
              <Trans i18nKey="ssh.add.rootHint">
                서버에서 마크다운 문서가 모여있는 폴더를 가리켜주세요. 직접 입력하거나 <strong>폴더 탐색</strong> 으로 찾을 수 있습니다.
              </Trans>
            </span>
          </div>

          {/* FS9 — 원격 폴더 picker */}
          {pickerOpen && (
            <div
              style={{
                padding: 'var(--sp-3)',
                background: 'var(--bg-elev)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm)',
                marginBottom: 'var(--sp-3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 'var(--sp-2)' }}>
                <strong style={{ fontSize: 'var(--fs-sm)' }}>{t('ssh.add.picker.title')}</strong>
                <code
                  style={{ flex: 1, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={pickerPath}
                >
                  {pickerPath}
                </code>
                <Button variant="ghost" size="sm" type="button" onClick={() => setPickerOpen(false)}>
                  {t('common.close')}
                </Button>
              </div>
              {pickerError && (
                <div role="alert" style={{ ...errorStyle, marginBottom: 'var(--sp-2)' }}>
                  {pickerError}
                </div>
              )}
              {pickerLoading && <p style={hintStyle}>{t('common.loading')}</p>}
              {!pickerLoading && !pickerError && (
                <ul style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  maxHeight: '220px',
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--bg)',
                }}>
                  {pickerParent !== null && (
                    <li>
                      <button
                        type="button"
                        onClick={() => navigatePicker(pickerParent!)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: 'var(--sp-2) var(--sp-3)',
                          background: 'transparent',
                          border: 'none',
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--text-muted)',
                          fontSize: 'var(--fs-sm)',
                          cursor: 'pointer',
                        }}
                      >
                        {t('ssh.add.picker.parent')}
                      </button>
                    </li>
                  )}
                  {pickerEntries.filter((e) => e.isDirectory).map((entry) => (
                    <li key={entry.name}>
                      <button
                        type="button"
                        onClick={() => {
                          const next = pickerPath.endsWith('/') ? pickerPath + entry.name : pickerPath + '/' + entry.name
                          navigatePicker(next)
                        }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: 'var(--sp-2) var(--sp-3)',
                          background: 'transparent',
                          border: 'none',
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--text)',
                          fontSize: 'var(--fs-sm)',
                          cursor: 'pointer',
                        }}
                      >
                        <span aria-hidden="true">📁</span> {entry.name}
                      </button>
                    </li>
                  ))}
                  {pickerEntries.filter((e) => e.isDirectory).length === 0 && (
                    <li style={{ padding: 'var(--sp-3)', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>
                      {t('ssh.add.picker.empty')}
                    </li>
                  )}
                </ul>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--sp-2)' }}>
                <span style={hintStyle}>
                  {pickerEntries.filter((e) => !e.isDirectory).length > 0
                    ? t('ssh.add.picker.filesInFolder', { count: pickerEntries.filter((e) => !e.isDirectory).length })
                    : t('ssh.add.picker.filesNone')}
                </span>
                <Button variant="primary" size="sm" type="button" onClick={confirmPickerSelection} disabled={pickerLoading}>
                  {t('ssh.add.picker.select')}
                </Button>
              </div>
            </div>
          )}

          {/* FS9-B — 베타에서는 등록 방식 선택 제거. 선택한 폴더 = 단일 프로젝트로 고정. */}
          <p
            style={{
              fontSize: 'var(--fs-xs)',
              color: 'var(--text-muted)',
              background: 'var(--bg-elev)',
              padding: 'var(--sp-2) var(--sp-3)',
              borderRadius: 'var(--r-sm)',
              marginBottom: 'var(--sp-3)',
            }}
          >
            <span aria-hidden="true">ℹ</span> {t('ssh.add.modeNote')}
          </p>
            </>
          )}

          {/* 버튼 영역 — step별 분기 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-4)' }}>
            <Button variant="ghost" size="sm" type="button" onClick={handleClose} disabled={loading}>
              {t('common.cancel')}
            </Button>
            {step === 1 && (
              <Button variant="primary" size="sm" type="submit" disabled={loading || !name || !host || !user}>
                {t('ssh.add.next')}
              </Button>
            )}
            {step === 2 && (
              <>
                <Button variant="ghost" size="sm" type="button" onClick={handlePrev} disabled={loading}>
                  {t('ssh.add.prev')}
                </Button>
                <Button variant="primary" size="sm" type="submit" disabled={loading}>
                  {loading ? t('ssh.add.submitting') : t('ssh.add.submit')}
                </Button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  )
})
