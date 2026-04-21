// SshWorkspaceAddModal — Plan Follow-up FS2.
//
// SSH workspace 등록 폼. 제출 시 window.api.workspace.addSsh(...) 호출 → TOFU 모달이
// 뒤따라 자동 트리거됨(main hostVerifier bridge). Modal 닫기 전까지 loading 상태 유지(RF-5).
//
// UX:
//   - role="dialog" + Escape 키 닫기
//   - auth: radio (ssh-agent / key-file) — key-file 선택 시 path input 노출
//   - root: POSIX 절대경로, depth ≥ 2 힌트 표시
//   - 에러 처리: SSH_TRANSPORT_DISABLED → Settings Experimental 안내

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, KeyboardEvent } from 'react'
import type { SshAuthConfig, LoadSshConfigResult, SshConfigHost } from '../../../src/preload/types'
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
  // Follow-up FS8 — 기본 'single' (속도 우선). container 는 명시 선택 시만.
  const [mode, setMode] = useState<'container' | 'single'>('single')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Follow-up FS5 — ~/.ssh/config import 상태. modal 최초 open 시 1회 로드.
  const [sshConfig, setSshConfig] = useState<LoadSshConfigResult | null>(null)
  const [selectedAlias, setSelectedAlias] = useState<string>('')
  const [configLoadFailed, setConfigLoadFailed] = useState(false)

  const nameRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open && nameRef.current) nameRef.current.focus()
  }, [open])

  // Follow-up FS5 — modal open 시 ~/.ssh/config 로드. flag off 시 silent 실패.
  useEffect(() => {
    if (!open || sshConfig || configLoadFailed) return
    window.api.ssh
      .loadConfig()
      .then(setSshConfig)
      .catch(() => setConfigLoadFailed(true))
  }, [open, sshConfig, configLoadFailed])

  // 호스트 선택 시 폼 자동 채움. proxyJump 가 있으면 경고 (backend 지원하지만 UI 는 pass-through 안 함).
  const handleSelectConfigHost = useCallback((alias: string) => {
    setSelectedAlias(alias)
    if (!alias || !sshConfig) return
    const h: SshConfigHost | undefined = sshConfig.hosts.find((x) => x.alias === alias)
    if (!h) return
    // name 은 alias 기본값. 사용자가 이미 입력했으면 유지.
    if (!name) setName(alias)
    setHost(h.hostname ?? alias)
    if (h.port !== undefined) setPort(String(h.port))
    if (h.user) setUser(h.user)
    if (h.identityFile && h.identityFile.length > 0) {
      setAuthKind('key-file')
      setKeyFilePath(h.identityFile[0])
    }
    // root 는 ssh_config 에 개념이 없음 — 사용자 수동 입력 유지.
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
  }, [])

  const handleClose = useCallback(() => {
    if (loading) return // 제출 중엔 취소 불가 — TOFU 응답 대기 race 방어
    reset()
    onClose()
  }, [loading, onClose, reset])

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    },
    [handleClose],
  )

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (loading) return
      setError(null)
      const portNum = parseInt(port, 10)
      if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
        setError('Port 는 1~65535 범위여야 합니다')
        return
      }
      let auth: SshAuthConfig
      if (authKind === 'agent') {
        auth = { kind: 'agent' }
      } else {
        const trimmedKeyPath = keyFilePath.trim()
        if (!trimmedKeyPath) {
          setError('key-file 경로를 입력하세요')
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
        if (message === 'SSH_TRANSPORT_DISABLED') {
          setError(
            'SSH Transport 가 비활성화 상태입니다. 설정 → Experimental → SSH Remote 체크 후 앱을 재시작하세요.',
          )
        } else if (message.includes('INVALID_SSH_ROOT')) {
          setError('root 는 POSIX 절대경로 + 최소 depth 2 (예: /home/user/projects)')
        } else if (message === 'SSH_WORKSPACE_ALREADY_EXISTS') {
          setError('이미 등록된 SSH 워크스페이스입니다 (같은 user@host:port)')
        } else {
          setError(message)
        }
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
    maxWidth: '520px',
    width: '100%',
    boxShadow: '0 16px 48px rgba(0,0,0,0.25)',
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
    color: 'var(--danger, #c00)',
    border: '1px solid var(--danger, #c00)',
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
          style={{ margin: '0 0 var(--sp-4)', fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-semibold)' }}
        >
          SSH Remote 워크스페이스 추가
        </h2>

        {error && (
          <div role="alert" style={errorStyle}>
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
              ~/.ssh/config 에서 불러오기
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
                ℹ ProxyJump 설정이 있습니다: <code>{sshConfig.hosts.find((h) => h.alias === selectedAlias)?.proxyJump}</code> — 현재 UI 는 기본 필드만 자동 채움합니다.
              </p>
            )}
            {sshConfig.permissionWarning && (
              <p style={{ ...hintStyle, marginTop: 'var(--sp-1)', color: 'var(--text-muted)' }}>
                ⚠ {sshConfig.permissionWarning}
              </p>
            )}
            {sshConfig.rejected.length > 0 && (
              <details style={{ marginTop: 'var(--sp-2)' }}>
                <summary style={{ ...hintStyle, cursor: 'pointer' }}>
                  제외된 호스트 {sshConfig.rejected.length}개 (지원 불가 directive)
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
            ~/.ssh/config 는 있으나 사용 가능한 Host 항목이 없습니다.
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <div style={fieldStyle}>
            <label htmlFor="ssh-name" style={labelStyle}>이름</label>
            <input
              id="ssh-name"
              ref={nameRef}
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: prod-server"
              style={inputStyle}
              disabled={loading}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 'var(--sp-3)' }}>
            <div style={fieldStyle}>
              <label htmlFor="ssh-host" style={labelStyle}>Host</label>
              <input
                id="ssh-host"
                type="text"
                required
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="example.com 또는 127.0.0.1"
                style={inputStyle}
                disabled={loading}
              />
            </div>
            <div style={fieldStyle}>
              <label htmlFor="ssh-port" style={labelStyle}>Port</label>
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
            <label htmlFor="ssh-user" style={labelStyle}>User</label>
            <input
              id="ssh-user"
              type="text"
              required
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="원격 SSH 계정"
              style={inputStyle}
              disabled={loading}
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>인증 방식</label>
            <div style={{ display: 'flex', gap: 'var(--sp-4)', marginTop: 'var(--sp-1)' }}>
              <label style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', fontSize: 'var(--fs-sm)' }}>
                <input
                  type="radio"
                  name="auth"
                  value="agent"
                  checked={authKind === 'agent'}
                  onChange={() => setAuthKind('agent')}
                  disabled={loading}
                />
                ssh-agent
              </label>
              <label style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', fontSize: 'var(--fs-sm)' }}>
                <input
                  type="radio"
                  name="auth"
                  value="key-file"
                  checked={authKind === 'key-file'}
                  onChange={() => setAuthKind('key-file')}
                  disabled={loading}
                />
                key-file
              </label>
            </div>
          </div>

          {authKind === 'key-file' && (
            <div style={fieldStyle}>
              <label htmlFor="ssh-keypath" style={labelStyle}>Private key 경로</label>
              <input
                id="ssh-keypath"
                type="text"
                required
                value={keyFilePath}
                onChange={(e) => setKeyFilePath(e.target.value)}
                placeholder="/Users/alice/.ssh/id_ed25519"
                style={inputStyle}
                disabled={loading}
              />
              <span style={hintStyle}>파일 경로만 저장됩니다. 키 내용은 저장하지 않습니다.</span>
            </div>
          )}

          <div style={fieldStyle}>
            <label htmlFor="ssh-root" style={labelStyle}>Workspace root (원격 POSIX 경로)</label>
            <input
              id="ssh-root"
              type="text"
              required
              value={root}
              onChange={(e) => setRoot(e.target.value)}
              placeholder="/home/alice/projects"
              style={inputStyle}
              disabled={loading}
            />
            <span style={hintStyle}>절대경로 + 최소 depth 2 (예: /home/user/workspace)</span>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>등록 방식</label>
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
                  <strong>단일 프로젝트</strong>{' '}
                  <span style={{ color: 'var(--accent)' }}>(추천)</span>
                  <br />
                  <span style={hintStyle}>이 폴더 자체를 1개 프로젝트로 등록. 원격 SSH 환경에서 가장 빠름.</span>
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
                  <strong>컨테이너</strong>
                  <br />
                  <span style={hintStyle}>하위 depth 2 까지 프로젝트 자동 탐색. 원격에선 RTT × N 비용으로 느릴 수 있음.</span>
                </span>
              </label>
            </div>
          </div>

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
