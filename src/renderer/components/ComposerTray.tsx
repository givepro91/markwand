import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../state/store'
import { Button, Checkbox, Gauge, toast } from './ui'
import { ComposerChip } from './ComposerChip'
import { estimateTokens, TOKEN_WARN, TOKEN_CRIT } from '../lib/tokenEstimate'
import type { ComposerTarget, TerminalType } from '../../preload/types'

// sessionStorage에 저장되는 "토큰 초과 모달 다시 묻지 않음" 플래그 키
const SKIP_TOKEN_MODAL_KEY = 'composer.skipTokenModalThisSession'

interface ComposerTrayProps {
  projectDir: string | null
  terminal: TerminalType
  codexAvailable: boolean
}

export function ComposerTray({ projectDir, terminal, codexAvailable }: ComposerTrayProps) {
  const selected = useAppStore((s) => s.selectedDocPaths)
  const composerCollapsed = useAppStore((s) => s.composerCollapsed)
  const setComposerCollapsed = useAppStore((s) => s.setComposerCollapsed)
  const composerAutoClear = useAppStore((s) => s.composerAutoClear)
  const toggleDocSelection = useAppStore((s) => s.toggleDocSelection)
  const clearDocSelection = useAppStore((s) => s.clearDocSelection)

  const [tokens, setTokens] = useState(0)
  const [sendingTarget, setSendingTarget] = useState<ComposerTarget | null>(null)
  const [tokenModal, setTokenModal] = useState<ComposerTarget | null>(null)
  const [dontAskAgain, setDontAskAgain] = useState(false)

  const paths = useMemo(() => Array.from(selected), [selected])
  const count = paths.length

  // 선택이 바뀌면 토큰 재추정. IPC 디바운스 200ms.
  useEffect(() => {
    if (count === 0) {
      setTokens(0)
      return
    }
    const t = setTimeout(() => {
      window.api.composer
        .estimateTokens(paths)
        .then((r) => setTokens(r.estimatedTokens))
        .catch(() => setTokens(estimateTokens(0)))
    }, 200)
    return () => clearTimeout(t)
  }, [paths, count])

  // 선택이 증가하는 전이(사용자가 새 파일을 체크했을 때)에 자동으로 Tray를 펼친다.
  // 접힌 상태에서도 선택이 늘면 사용자가 기능을 재발견.
  const prevCountRef = useRef(count)
  useEffect(() => {
    const prev = prevCountRef.current
    prevCountRef.current = count
    if (count > prev && composerCollapsed) {
      setComposerCollapsed(false)
    }
  }, [count, composerCollapsed, setComposerCollapsed])

  if (count === 0) return null

  const doSend = async (target: ComposerTarget) => {
    if (!projectDir) {
      toast.error('활성 프로젝트가 없습니다')
      return
    }
    setSendingTarget(target)
    try {
      const result = await window.api.composer.send({
        paths,
        target,
        projectDir,
        terminal,
      })
      if (result.ok) {
        if (target === 'claude') {
          toast.success('Claude Code로 전송됨 — 터미널 확인')
        } else {
          toast.success('Codex 실행 — 터미널에서 응답 확인')
        }
        if (composerAutoClear) clearDocSelection()
      } else if (result.fallbackCopied) {
        toast.info('터미널 실행 실패. 명령어를 클립보드에 복사했습니다 — 터미널에 붙여넣기', {
          durationMs: 6000,
        })
      } else if (result.reason === 'CODEX_NOT_FOUND') {
        toast.error('codex CLI를 찾을 수 없습니다')
      } else if (result.reason === 'PATH_OUT_OF_WORKSPACE') {
        toast.error('워크스페이스 외부 경로는 추가할 수 없습니다')
      } else {
        toast.error(`전송 실패: ${result.reason ?? '알 수 없는 오류'}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`전송 실패: ${msg}`)
    } finally {
      setSendingTarget(null)
    }
  }

  const handleSendClick = (target: ComposerTarget) => {
    // 200k 이상이고 세션에서 스킵 안 됨 → 확인 모달
    const sessionSkip = sessionStorage.getItem(SKIP_TOKEN_MODAL_KEY) === '1'
    if (tokens >= TOKEN_WARN && !sessionSkip) {
      setTokenModal(target)
      return
    }
    void doSend(target)
  }

  const confirmTokenModal = () => {
    if (dontAskAgain) {
      sessionStorage.setItem(SKIP_TOKEN_MODAL_KEY, '1')
    }
    const t = tokenModal
    setTokenModal(null)
    if (t) void doSend(t)
  }

  // 접힌 상태 — 우측 하단 작은 pill
  if (composerCollapsed) {
    return (
      <div
        style={{
          position: 'fixed',
          right: 'var(--sp-4)',
          bottom: 'var(--sp-4)',
          zIndex: 'var(--z-sticky)' as CSSProperties['zIndex'],
        }}
      >
        <Button variant="primary" size="sm" onClick={() => setComposerCollapsed(false)}>
          {count} docs 선택됨 ▲
        </Button>
      </div>
    )
  }

  // 펼친 상태 — 하단 고정 bar
  const barStyle: CSSProperties = {
    flexShrink: 0,
    borderTop: '1px solid var(--border)',
    background: 'var(--bg-elev)',
    padding: 'var(--sp-2) var(--sp-3)',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
  }

  const chipRow: CSSProperties = {
    display: 'flex',
    gap: 'var(--sp-1)',
    flex: 1,
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollbarWidth: 'thin',
  }

  return (
    <>
      <div style={barStyle} role="region" aria-label="Composer Tray">
        <div style={chipRow}>
          {paths.map((p) => (
            <ComposerChip key={p} absPath={p} onRemove={() => toggleDocSelection(p)} />
          ))}
        </div>
        <Gauge value={tokens} max={TOKEN_WARN} warn={TOKEN_WARN} crit={TOKEN_CRIT} width={140} />
        <Button variant="ghost" size="sm" onClick={clearDocSelection}>
          Clear
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setComposerCollapsed(true)}
          aria-label="접기"
        >
          ×
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => handleSendClick('claude')}
          disabled={sendingTarget !== null || !projectDir}
        >
          {sendingTarget === 'claude' ? '전송 중…' : 'Send to Claude Code'}
        </Button>
        <span
          title={
            codexAvailable
              ? '대화형 세션이 아닌 비대화형 codex exec으로 단발 실행됩니다'
              : 'codex CLI가 설치되어 있지 않습니다 — https://github.com/openai/codex'
          }
          style={{ display: 'inline-flex' }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleSendClick('codex')}
            disabled={sendingTarget !== null || !projectDir || !codexAvailable}
            aria-label={
              codexAvailable
                ? '대화형 세션이 아닌 비대화형 codex exec으로 단발 실행됩니다'
                : 'codex CLI가 설치되어 있지 않습니다'
            }
          >
            {sendingTarget === 'codex' ? '전송 중…' : 'Send to Codex (단발 응답)'}
          </Button>
        </span>
      </div>

      {tokenModal && (
        <TokenWarnModal
          tokens={tokens}
          threshold={TOKEN_WARN}
          dontAskAgain={dontAskAgain}
          onToggleDontAsk={setDontAskAgain}
          onCancel={() => setTokenModal(null)}
          onConfirm={confirmTokenModal}
        />
      )}
    </>
  )
}

interface TokenWarnModalProps {
  tokens: number
  threshold: number
  dontAskAgain: boolean
  onToggleDontAsk: (v: boolean) => void
  onCancel: () => void
  onConfirm: () => void
}

function TokenWarnModal({
  tokens,
  threshold,
  dontAskAgain,
  onToggleDontAsk,
  onCancel,
  onConfirm,
}: TokenWarnModalProps) {
  const overlay: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 'var(--z-modal)' as CSSProperties['zIndex'],
  }
  const dialog: CSSProperties = {
    background: 'var(--bg-elev)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-xl)',
    padding: 'var(--sp-5)',
    width: 420,
    maxWidth: '90vw',
    boxShadow: 'var(--shadow-lg)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-3)',
  }
  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div role="dialog" aria-modal="true" aria-labelledby="token-warn-title" style={dialog}>
        <h3
          id="token-warn-title"
          style={{
            fontSize: 'var(--fs-lg)',
            fontWeight: 'var(--fw-semibold)',
            margin: 0,
            color: 'var(--text)',
          }}
        >
          큰 컨텍스트 전송 확인
        </h3>
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', margin: 0 }}>
          예상 {tokens.toLocaleString()} 토큰 ({threshold.toLocaleString()} 초과). 계속하시겠습니까?
        </p>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-2)',
            fontSize: 'var(--fs-sm)',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          <Checkbox
            checked={dontAskAgain}
            onChange={onToggleDontAsk}
            size="sm"
            aria-label="이번 세션에서 다시 묻지 않기"
          />
          <span>이번 세션에서 다시 묻지 않기</span>
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            취소
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm}>
            계속 전송
          </Button>
        </div>
      </div>
    </div>
  )
}
