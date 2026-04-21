// SshHostKeyPrompt — Plan §S2.1 (TOFU 모달 + mismatch 경고 통합 컴포넌트) + FS9 UX 개선.
//
// DC-4 핵심:
//   - role="alertdialog" (이탈 차단 필요)
//   - destructive default: focus 가 거부 버튼에 시작 (실수 confirm 방어)
//   - Escape 키 → respond(false) (항상 reject)
//   - mismatch kind: bypass 버튼 제거, "Remove & re-trust" 단일 경로만
//
// FS9 개선:
//   - 전면 한국어화 (PM/파운더 이해 가능)
//   - SHA256 지문 `:` 2자 구분 표기 + aria-label 로 SR 낭독 간소화
//   - Trust 라벨 "신뢰 및 기억" — 영구 저장 고지 (UX Audit D5)
//   - mismatch 시 다음 단계 안내 문구 추가

import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { useSshHostKeyPrompt } from '../hooks/useSshHostKeyPrompt'

// 43자 base64 지문을 2자씩 콜론으로 구분 — 시각 대조 용이 + SR 낭독 시 쉼표.
// 스크린 리더는 긴 base64 를 글자별 낭독하므로 2자씩 구분하면 "에이비, 씨디, 이에프…" 식으로 안정적.
function formatFingerprint(sha256: string): string {
  // sha256 값은 padding 없는 base64 43자 (표준). 2자씩 분리.
  return sha256.match(/.{1,2}/g)?.join(':') ?? sha256
}

export const SshHostKeyPrompt = memo(function SshHostKeyPrompt() {
  const { current, respond } = useSshHostKeyPrompt()
  const rejectRef = useRef<HTMLButtonElement | null>(null)

  // current 바뀔 때마다 reject 버튼으로 focus 이동 (destructive default).
  useEffect(() => {
    if (current && rejectRef.current) {
      rejectRef.current.focus()
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

  const formattedFingerprint = useMemo(
    () => (current ? formatFingerprint(current.sha256) : ''),
    [current],
  )
  const formattedExpected = useMemo(
    () => (current?.expectedSha256 ? formatFingerprint(current.expectedSha256) : ''),
    [current],
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
    maxWidth: '540px',
    width: '100%',
    boxShadow: 'var(--shadow-lg, 0 16px 48px rgba(0,0,0,0.25))',
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
          {isMismatch ? (
            <>
              <span aria-hidden="true">⚠</span> 서버 지문이 바뀌었습니다 — 연결 중단됨
            </>
          ) : (
            '이 서버를 처음 연결합니다'
          )}
        </h2>
        <p id={descId} style={{ color: 'var(--text-muted)', marginBottom: 'var(--sp-4)' }}>
          {isMismatch
            ? '이전에 저장된 서버 지문과 달라졌습니다. 서버를 새로 설치했거나, 누군가 중간에서 가로채는(MITM) 상황일 수 있습니다. 서버 관리자에게 확인해주세요.'
            : '아직 이 서버를 신뢰한 적이 없습니다. 아래 지문이 서버 관리자가 알려준 값과 같은지 확인해주세요.'}
        </p>

        <div role="list" style={{ marginBottom: 'var(--sp-4)' }}>
          <div style={fieldRowStyle} role="listitem">
            <span style={{ color: 'var(--text-muted)' }}>서버</span>
            <span>
              {current.host}:{current.port}
            </span>
          </div>
          <div style={fieldRowStyle} role="listitem">
            <span style={{ color: 'var(--text-muted)' }}>암호 방식</span>
            <span>{current.algorithm === 'unknown' ? '확인 중' : current.algorithm}</span>
          </div>
          {isMismatch && current.expectedSha256 ? (
            <>
              <div style={fieldRowStyle} role="listitem">
                <span style={{ color: 'var(--text-muted)' }}>저장된 지문</span>
                <span
                  style={fingerprintStyle}
                  aria-label={`저장된 SHA256 지문 ${formattedExpected}`}
                >
                  SHA256:{formattedExpected}
                </span>
              </div>
              <div style={fieldRowStyle} role="listitem">
                <span style={{ color: 'var(--danger-fg)' }}>이번 연결의 지문</span>
                <span
                  style={fingerprintStyle}
                  aria-label={`이번 연결의 SHA256 지문 ${formattedFingerprint}`}
                >
                  SHA256:{formattedFingerprint}
                </span>
              </div>
            </>
          ) : (
            <div style={fieldRowStyle} role="listitem">
              <span style={{ color: 'var(--text-muted)' }}>서버 지문</span>
              <span
                style={fingerprintStyle}
                aria-label={`SHA256 지문 ${formattedFingerprint}. 서버 관리자가 알려준 값과 대조하세요.`}
              >
                SHA256:{formattedFingerprint}
              </span>
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
                이전 방식(MD5) 지문 보기
              </summary>
              <div style={{ ...fingerprintStyle, marginTop: 'var(--sp-1)' }}>
                MD5:{current.md5}
              </div>
            </details>
          ) : null}
        </div>

        {!isMismatch && (
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
            <span aria-hidden="true">💾</span>{' '}
            <strong>신뢰 시 지문이 저장됩니다.</strong> 다음부터는 묻지 않고 자동으로 연결합니다. 설정에서 언제든 제거할 수 있습니다.
          </p>
        )}

        {isMismatch && (
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
            <span aria-hidden="true">🛠</span>{' '}
            서버 교체가 확실하다면: 워크스페이스 관리에서 이 서버를 제거한 뒤 다시 추가하면 새 지문으로 신뢰할 수 있습니다.
          </p>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--sp-2)',
          }}
        >
          <button
            ref={rejectRef}
            type="button"
            onClick={onReject}
            style={btnStyle('neutral')}
            data-testid="ssh-prompt-reject"
          >
            {isMismatch ? '연결 중단' : '신뢰하지 않음'}
          </button>
          {!isMismatch ? (
            <button
              type="button"
              onClick={onTrust}
              style={btnStyle('primary')}
              data-testid="ssh-prompt-trust"
            >
              신뢰하고 기억
            </button>
          ) : (
            // mismatch: bypass 없음. 사용자가 명시적 "Remove & re-trust" 원할 때만 허용 (DC-4).
            null
          )}
        </div>
      </div>
    </div>
  )
})
