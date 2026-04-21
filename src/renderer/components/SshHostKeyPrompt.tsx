// SshHostKeyPrompt — Plan §S2.1 (TOFU 모달 + mismatch 경고 통합 컴포넌트).
//
// DC-4 핵심:
//   - role="alertdialog" (이탈 차단 필요)
//   - destructive default: focus 가 **"Don't trust"** 에 시작 (실수 confirm 방어)
//   - Escape 키 → respond(false) (항상 reject)
//   - mismatch kind: bypass 버튼 제거, "Remove & re-trust" 단일 경로만
//
// 이 컴포넌트는 어느 상위 트리에서 렌더되어도 동일 동작 — App 진입점에서 1회 mount 권장.

import { memo, useCallback, useEffect, useRef } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { useSshHostKeyPrompt } from '../hooks/useSshHostKeyPrompt'

export const SshHostKeyPrompt = memo(function SshHostKeyPrompt() {
  const { current, respond } = useSshHostKeyPrompt()
  const dontTrustRef = useRef<HTMLButtonElement | null>(null)

  // current 바뀔 때마다 "Don't trust" 로 focus 이동 (destructive default).
  useEffect(() => {
    if (current && dontTrustRef.current) {
      dontTrustRef.current.focus()
    }
  }, [current])

  const onTrust = useCallback(() => void respond(true), [respond])
  const onReject = useCallback(() => void respond(false), [respond])

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onReject()
      }
    },
    [onReject],
  )

  if (!current) return null

  const isMismatch = current.kind === 'mismatch'
  const titleId = `ssh-prompt-title-${current.nonce}`
  const descId = `ssh-prompt-desc-${current.nonce}`

  const backdropStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
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
  const fieldRowStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '110px 1fr',
    gap: 'var(--sp-2)',
    padding: 'var(--sp-1) 0',
    fontSize: 'var(--fs-sm)',
  }
  const fingerprintStyle: CSSProperties = {
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
    fontSize: 'var(--fs-xs)',
    wordBreak: 'break-all',
  }
  const btnStyle = (variant: 'neutral' | 'danger' | 'primary'): CSSProperties => ({
    padding: 'var(--sp-2) var(--sp-4)',
    borderRadius: 'var(--r-sm)',
    border:
      variant === 'neutral' ? '1px solid var(--border)' : '1px solid transparent',
    background:
      variant === 'primary'
        ? 'var(--accent)'
        : variant === 'danger'
          ? 'var(--danger-bg)'
          : 'var(--bg-hover)',
    color: variant === 'primary' ? 'white' : 'var(--text)',
    cursor: 'pointer',
    fontWeight: 'var(--fw-medium)' as CSSProperties['fontWeight'],
  })

  return (
    <div style={backdropStyle} onKeyDown={onKeyDown}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        style={dialogStyle}
      >
        <h2 id={titleId} style={{ marginTop: 0, fontSize: 'var(--fs-lg)' }}>
          {isMismatch ? '⚠ Host key changed — connection aborted' : 'Unknown host key'}
        </h2>
        <p id={descId} style={{ color: 'var(--text-muted)', marginBottom: 'var(--sp-4)' }}>
          {isMismatch
            ? 'The server fingerprint has changed since you last connected. This could indicate the server was reinstalled, or a man-in-the-middle attack.'
            : 'Markwand has never connected to this server. Verify the fingerprint with your server administrator before trusting.'}
        </p>

        <div role="list" style={{ marginBottom: 'var(--sp-4)' }}>
          <div style={fieldRowStyle} role="listitem">
            <span style={{ color: 'var(--text-muted)' }}>Host</span>
            <span>
              {current.host}:{current.port}
            </span>
          </div>
          <div style={fieldRowStyle} role="listitem">
            <span style={{ color: 'var(--text-muted)' }}>Algorithm</span>
            <span>{current.algorithm}</span>
          </div>
          {isMismatch && current.expectedSha256 ? (
            <>
              <div style={fieldRowStyle} role="listitem">
                <span style={{ color: 'var(--text-muted)' }}>Expected</span>
                <span style={fingerprintStyle}>SHA256:{current.expectedSha256}</span>
              </div>
              <div style={fieldRowStyle} role="listitem">
                <span style={{ color: 'var(--danger-fg)' }}>Received</span>
                <span style={fingerprintStyle}>SHA256:{current.sha256}</span>
              </div>
            </>
          ) : (
            <div style={fieldRowStyle} role="listitem">
              <span style={{ color: 'var(--text-muted)' }}>Fingerprint</span>
              <span style={fingerprintStyle}>SHA256:{current.sha256}</span>
            </div>
          )}
          {current.md5 ? (
            <details style={{ marginTop: 'var(--sp-2)' }}>
              <summary
                style={{
                  fontSize: 'var(--fs-xs)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                Show legacy MD5 fingerprint
              </summary>
              <div style={{ ...fingerprintStyle, marginTop: 'var(--sp-1)' }}>
                MD5:{current.md5}
              </div>
            </details>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--sp-2)',
          }}
        >
          <button
            ref={dontTrustRef}
            type="button"
            onClick={onReject}
            style={btnStyle('neutral')}
            data-testid="ssh-prompt-reject"
          >
            {isMismatch ? 'Abort' : "Don't trust"}
          </button>
          {!isMismatch ? (
            <button
              type="button"
              onClick={onTrust}
              style={btnStyle('primary')}
              data-testid="ssh-prompt-trust"
            >
              Trust
            </button>
          ) : (
            // mismatch: bypass 없음. 사용자가 명시적 "Remove & re-trust" 원할 때만 허용.
            // 구현은 단순화: Abort 후 Settings 에서 Remove → 다음 연결 시 trust-new 플로우.
            // 이 모달 자체엔 Trust 버튼 노출 금지(DC-4).
            null
          )}
        </div>
      </div>
    </div>
  )
})
