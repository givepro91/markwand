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
import type {
  SshAuthConfig,
  LoadSshConfigResult,
  SshConfigHost,
  SshBrowseFolderResult,
} from '../../../src/preload/types'
import { Button } from './ui'

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

// 에러 맵 — 기술 상수 → 사용자 자연어 + 해결 방향.
function humanizeError(message: string): string {
  if (message === 'SSH_TRANSPORT_DISABLED') {
    return 'SSH 기능이 꺼져있습니다. 설정(⚙) → Experimental → "SSH Remote Transport" 를 켜고 앱을 재시작해주세요.'
  }
  if (message === 'SSH_WORKSPACE_ALREADY_EXISTS') {
    return '동일한 계정·서버 조합이 이미 등록되어 있습니다.'
  }
  if (message.includes('INVALID_SSH_ROOT')) {
    return '폴더 경로는 슬래시(/) 로 시작하는 절대 경로여야 합니다. 최소 두 단계 이상이어야 합니다 (예: /home/user/docs).'
  }
  // ssh2/Node 에러 패턴
  if (message.includes('ECONNREFUSED') || message.includes('CONN_REFUSED')) {
    return '연결이 거부되었습니다. 서버 주소·포트가 맞는지, 서버가 켜져 있는지 확인해주세요.'
  }
  if (message.includes('ETIMEDOUT') || message.includes('CONNECT_TIMEOUT')) {
    return '연결 시간이 초과되었습니다. 네트워크 또는 방화벽을 확인해주세요.'
  }
  if (message.includes('ENOTFOUND') || message.includes('HOST_UNREACHABLE')) {
    return '서버를 찾을 수 없습니다. 주소(호스트명 또는 IP) 가 맞는지 확인해주세요.'
  }
  if (message.includes('AUTH_FAILED') || message.toLowerCase().includes('authentication')) {
    return '인증에 실패했습니다. 계정 이름과 인증 방식(자동 로그인 또는 키 파일 경로) 을 확인해주세요.'
  }
  if (message.includes('HOST_KEY_REJECTED')) {
    return '서버 지문을 신뢰하지 않아 연결이 중단되었습니다.'
  }
  if (message.includes('HOST_KEY_MISMATCH')) {
    return '서버 지문이 저장된 값과 다릅니다. 관리자에게 확인한 뒤 설정에서 기존 지문을 제거해주세요.'
  }
  if (message.includes('ENOENT') && message.includes('.ssh')) {
    return '키 파일을 찾을 수 없습니다. 경로를 다시 확인해주세요.'
  }
  // fallback — 원문 + 안내
  return `연결 실패: ${message}`
}

export const SshWorkspaceAddModal = memo(function SshWorkspaceAddModal({
  open,
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [user, setUser] = useState('')
  const [authKind, setAuthKind] = useState<'agent' | 'key-file'>('agent')
  const [keyFilePath, setKeyFilePath] = useState('')
  const [root, setRoot] = useState('')
  const [mode, setMode] = useState<'container' | 'single'>('single')
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
  const errorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (open && nameRef.current) nameRef.current.focus()
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
    setName('')
    setHost('')
    setPort('22')
    setUser('')
    setAuthKind('agent')
    setKeyFilePath('')
    setRoot('')
    setMode('single')
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
      setPickerError('먼저 서버 주소와 계정을 입력하세요.')
      return
    }
    const portNum = parseInt(port, 10)
    if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
      setPickerError('포트 번호는 1~65535 범위여야 합니다.')
      return
    }
    let authInput: SshAuthConfig
    if (authKind === 'agent') {
      authInput = { kind: 'agent' }
    } else {
      const kp = keyFilePath.trim()
      if (!kp) {
        setPickerError('키 파일 경로를 입력한 후 탐색하세요.')
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
          setPickerError(humanizeError(err2 instanceof Error ? err2.message : String(err2)))
        }
      } else {
        setPickerError(humanizeError(err instanceof Error ? err.message : String(err)))
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
        setPickerError(humanizeError(err instanceof Error ? err.message : String(err)))
      } finally {
        setPickerLoading(false)
      }
    },
    [authKind, host, keyFilePath, port, user],
  )

  const confirmPickerSelection = useCallback(() => {
    setRoot(pickerPath)
    setPickerOpen(false)
  }, [pickerPath])

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (loading) return
      setError(null)
      const portNum = parseInt(port, 10)
      if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
        setError('포트 번호는 1~65535 범위여야 합니다.')
        return
      }
      let auth: SshAuthConfig
      if (authKind === 'agent') {
        auth = { kind: 'agent' }
      } else {
        const trimmedKeyPath = keyFilePath.trim()
        if (!trimmedKeyPath) {
          setError('키 파일 경로를 입력하세요.')
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
        setError(humanizeError(message))
        setLoading(false)
      }
    },
    [authKind, host, keyFilePath, loading, mode, name, onClose, onSubmit, port, reset, root, user],
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
        role="dialog"
        aria-modal="true"
        aria-labelledby="ssh-add-title"
        style={dialogStyle}
      >
        <h2
          id="ssh-add-title"
          style={{ margin: '0 0 var(--sp-2)', fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-semibold)' }}
        >
          원격 SSH 서버의 문서 폴더 추가
        </h2>
        <p style={{ ...hintStyle, margin: '0 0 var(--sp-4)' }}>
          원격 서버에 있는 마크다운 폴더를 읽기 전용으로 불러옵니다. 서버에는 아무것도 전송·변경되지 않습니다.
        </p>

        {error && (
          <div role="alert" ref={errorRef} tabIndex={-1} style={errorStyle}>
            {error}
          </div>
        )}

        {/* Follow-up FS5 — ~/.ssh/config import 섹션 */}
        {sshConfig && sshConfig.exists && sshConfig.hosts.length > 0 && (
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
              SSH 설정 파일(~/.ssh/config) 에서 불러오기
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
              <option value="">— 직접 입력 —</option>
              {sshConfig.hosts.map((h) => (
                <option key={h.alias} value={h.alias}>
                  {h.alias}
                  {h.user && h.hostname ? ` (${h.user}@${h.hostname}${h.port && h.port !== 22 ? ':' + h.port : ''})` : ''}
                </option>
              ))}
            </select>
            {selectedAlias && sshConfig.hosts.find((h) => h.alias === selectedAlias)?.proxyJump && (
              <p style={{ ...hintStyle, marginTop: 'var(--sp-1)', color: 'var(--accent)' }}>
                <span aria-hidden="true">ℹ</span>{' '}
                이 호스트는 경유 서버(ProxyJump) 설정이 있습니다. 현재 화면에서는 기본 정보만 자동 입력됩니다.
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
                  제외된 호스트 {sshConfig.rejected.length}개 (지원하지 않는 설정 포함)
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
        {sshConfig && sshConfig.exists && sshConfig.hosts.length === 0 && !sshConfig.permissionWarning && (
          <p style={{ ...hintStyle, marginBottom: 'var(--sp-3)' }}>
            SSH 설정 파일은 있으나 불러올 수 있는 호스트가 없습니다.
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <div style={fieldStyle}>
            <label htmlFor="ssh-name" style={labelStyle}>이름 <span style={hintStyle}>(구분하기 쉬운 별명)</span></label>
            <input
              id="ssh-name"
              ref={nameRef}
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 개발 서버, 회사 노트 서버"
              style={inputStyle}
              disabled={loading}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 'var(--sp-3)' }}>
            <div style={fieldStyle}>
              <label htmlFor="ssh-host" style={labelStyle}>서버 주소</label>
              <input
                id="ssh-host"
                type="text"
                required
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="예: example.com, 192.168.0.10"
                style={inputStyle}
                disabled={loading}
              />
            </div>
            <div style={fieldStyle}>
              <label htmlFor="ssh-port" style={labelStyle}>포트</label>
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
              />
            </div>
          </div>

          <div style={fieldStyle}>
            <label htmlFor="ssh-user" style={labelStyle}>계정 이름</label>
            <input
              id="ssh-user"
              type="text"
              required
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="원격 서버에 로그인하는 계정"
              style={inputStyle}
              disabled={loading}
            />
          </div>

          <fieldset
            style={{ ...fieldStyle, border: 'none', padding: 0, margin: '0 0 var(--sp-3)' }}
          >
            <legend style={{ ...labelStyle, marginBottom: 'var(--sp-1)' }}>로그인 방식</legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-1)' }}>
              <label style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'flex-start', fontSize: 'var(--fs-sm)', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="auth"
                  value="agent"
                  checked={authKind === 'agent'}
                  onChange={() => setAuthKind('agent')}
                  disabled={loading}
                  style={{ marginTop: '3px' }}
                />
                <span>
                  <strong>자동 로그인 (권장)</strong>
                  <br />
                  <span style={hintStyle}>
                    시스템의 ssh-agent 를 사용합니다. 터미널에서 <code>ssh {user || '계정'}@{host || '서버'}</code> 로 접속할 수 있다면 이 방식이 가능합니다.
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
                  <strong>키 파일 지정</strong>
                  <br />
                  <span style={hintStyle}>접속용 개인 키 파일 경로를 직접 지정합니다.</span>
                </span>
              </label>
            </div>
          </fieldset>

          {authKind === 'key-file' && (
            <div style={fieldStyle}>
              <label htmlFor="ssh-keypath" style={labelStyle}>키 파일 경로</label>
              <input
                id="ssh-keypath"
                type="text"
                required
                value={keyFilePath}
                onChange={(e) => setKeyFilePath(e.target.value)}
                placeholder="예: /Users/alice/.ssh/id_ed25519"
                style={inputStyle}
                disabled={loading}
              />
              <span style={hintStyle}>파일 경로만 저장되며, 키 내용 자체는 앱에 저장되지 않습니다.</span>
            </div>
          )}

          <div style={fieldStyle}>
            <label htmlFor="ssh-root" style={labelStyle}>원격 폴더 경로</label>
            <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
              <input
                id="ssh-root"
                type="text"
                required
                value={root}
                onChange={(e) => setRoot(e.target.value)}
                placeholder="예: /home/alice/docs"
                style={{ ...inputStyle, flex: 1 }}
                disabled={loading || pickerOpen}
              />
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={openPicker}
                disabled={loading || pickerOpen}
                aria-label="원격 폴더 탐색"
              >
                폴더 탐색…
              </Button>
            </div>
            <span style={hintStyle}>
              서버에서 마크다운 문서가 모여있는 폴더를 가리켜주세요. 직접 입력하거나 <strong>폴더 탐색</strong> 으로 찾을 수 있습니다.
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
                <strong style={{ fontSize: 'var(--fs-sm)' }}>폴더 탐색</strong>
                <code
                  style={{ flex: 1, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={pickerPath}
                >
                  {pickerPath}
                </code>
                <Button variant="ghost" size="sm" type="button" onClick={() => setPickerOpen(false)}>
                  닫기
                </Button>
              </div>
              {pickerError && (
                <div role="alert" style={{ ...errorStyle, marginBottom: 'var(--sp-2)' }}>
                  {pickerError}
                </div>
              )}
              {pickerLoading && <p style={hintStyle}>읽는 중…</p>}
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
                        ← 상위 폴더
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
                      하위 폴더가 없습니다.
                    </li>
                  )}
                </ul>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--sp-2)' }}>
                <span style={hintStyle}>
                  {pickerEntries.filter((e) => !e.isDirectory).length > 0
                    ? `이 폴더의 파일 ${pickerEntries.filter((e) => !e.isDirectory).length}개 (미표시)`
                    : '이 폴더에 파일이 없습니다.'}
                </span>
                <Button variant="primary" size="sm" type="button" onClick={confirmPickerSelection} disabled={pickerLoading}>
                  이 폴더 선택
                </Button>
              </div>
            </div>
          )}

          <fieldset
            style={{ ...fieldStyle, border: 'none', padding: 0, margin: '0 0 var(--sp-3)' }}
          >
            <legend style={{ ...labelStyle, marginBottom: 'var(--sp-1)' }}>등록 방식</legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-1)' }}>
              <label style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'flex-start', fontSize: 'var(--fs-sm)', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="mode"
                  value="single"
                  checked={mode === 'single'}
                  onChange={() => setMode('single')}
                  disabled={loading}
                  style={{ marginTop: '3px' }}
                />
                <span>
                  <strong>이 폴더 하나만</strong>{' '}
                  <span style={{ color: 'var(--accent)' }}>(권장)</span>
                  <br />
                  <span style={hintStyle}>선택한 폴더 자체를 한 개 프로젝트로 등록합니다. 원격 환경에서 가장 빠릅니다.</span>
                </span>
              </label>
              <label style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'flex-start', fontSize: 'var(--fs-sm)', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="mode"
                  value="container"
                  checked={mode === 'container'}
                  onChange={() => setMode('container')}
                  disabled={loading}
                  style={{ marginTop: '3px' }}
                />
                <span>
                  <strong>여러 프로젝트가 있는 상위 폴더</strong>
                  <br />
                  <span style={hintStyle}>하위에 있는 여러 프로젝트 폴더를 자동으로 찾아냅니다. 원격에서는 탐색이 느릴 수 있습니다.</span>
                </span>
              </label>
            </div>
          </fieldset>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-4)' }}>
            <Button variant="ghost" size="sm" type="button" onClick={handleClose} disabled={loading}>
              취소
            </Button>
            <Button variant="primary" size="sm" type="submit" disabled={loading}>
              {loading ? '연결 중…' : '연결 및 추가'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
})
