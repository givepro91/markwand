import { useState, useRef, useEffect, useCallback } from 'react'
import { IconButton, Checkbox, Button } from './ui'
import { useAppStore } from '../state/store'

export function Settings() {
  const [open, setOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [sshEnabled, setSshEnabled] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const trackReadDocs = useAppStore((s) => s.trackReadDocs)
  const setTrackReadDocs = useAppStore((s) => s.setTrackReadDocs)

  // Follow-up FS2 — Experimental SSH Transport flag 동기화.
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
    // single Zustand transaction — avoids 2-frame flicker from separate set calls
    useAppStore.setState({ trackReadDocs: false, readDocs: {} })
    setConfirmClear(false)
    await window.api.prefs.set('trackReadDocs', false)
    await window.api.prefs.set('readDocs', {})
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <IconButton
        aria-label="설정"
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
          aria-label="환경설정"
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
            환경설정
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            <div>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', cursor: 'pointer' }}
                title="끄면 모든 문서가 unread로 표시되며 이력이 삭제됩니다"
              >
                <Checkbox
                  checked={trackReadDocs}
                  onChange={handleToggle}
                  aria-label="읽음 추적"
                />
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)' }}>읽음 추적</span>
              </label>
              <p
                style={{
                  fontSize: 'var(--fs-xs)',
                  color: 'var(--text-muted)',
                  margin: 'var(--sp-1) 0 0 calc(16px + var(--sp-2))',
                }}
              >
                끄면 모든 문서가 unread로 표시되며 이력이 삭제됩니다
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
                  읽음 이력을 모두 삭제하고 추적을 끄시겠습니까?
                </span>
                <div style={{ display: 'flex', gap: 'var(--sp-2)', justifyContent: 'flex-end' }}>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
                    취소
                  </Button>
                  <Button variant="danger" size="sm" onClick={handleConfirmClear}>
                    삭제 후 끄기
                  </Button>
                </div>
              </div>
            )}

            {/* Follow-up FS2 — Experimental 섹션 */}
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
                Experimental
              </h4>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', cursor: 'pointer' }}
                title="SSH 원격 워크스페이스 등록/스캔을 활성화합니다. 변경 후 재시작 필요."
              >
                <Checkbox
                  checked={sshEnabled}
                  onChange={handleSshToggle}
                  aria-label="SSH Remote Transport"
                />
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)' }}>SSH Remote Transport</span>
              </label>
              <p
                style={{
                  fontSize: 'var(--fs-xs)',
                  color: 'var(--text-muted)',
                  margin: 'var(--sp-1) 0 0 calc(16px + var(--sp-2))',
                }}
              >
                원격 SSH 서버의 마크다운 문서를 읽기 전용으로 탐색합니다. 변경 후 <strong>앱 재시작</strong>이 필요합니다.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
