import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../state/store'
import { Button, Gauge, toast } from './ui'
import { ComposerChip } from './ComposerChip'
import { estimateTokens, TOKEN_WARN, TOKEN_CRIT } from '../lib/tokenEstimate'

export function ComposerTray() {
  const selected = useAppStore((s) => s.selectedDocPaths)
  const composerCollapsed = useAppStore((s) => s.composerCollapsed)
  const setComposerCollapsed = useAppStore((s) => s.setComposerCollapsed)
  const composerAutoClear = useAppStore((s) => s.composerAutoClear)
  const toggleDocSelection = useAppStore((s) => s.toggleDocSelection)
  const clearDocSelection = useAppStore((s) => s.clearDocSelection)

  const [tokens, setTokens] = useState(0)
  const [copying, setCopying] = useState(false)

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

  // 선택이 증가하는 전이 시 Tray 자동 펼침.
  const prevCountRef = useRef(count)
  useEffect(() => {
    const prev = prevCountRef.current
    prevCountRef.current = count
    if (count > prev && composerCollapsed) {
      setComposerCollapsed(false)
    }
  }, [count, composerCollapsed, setComposerCollapsed])

  if (count === 0) return null

  const handleCopyRef = async () => {
    setCopying(true)
    try {
      // 파일마다 `@절대경로` 나열. 공백 포함 경로는 따옴표로 감싸 Claude/쉘이 분리되지 않게.
      const atRefs = paths
        .map((p) => (p.includes(' ') ? `"@${p}"` : `@${p}`))
        .join(' ')
      await navigator.clipboard.writeText(atRefs)
      toast.success(`@참조 ${paths.length}개 복사됨 — Claude/Codex에 붙여넣기`, {
        durationMs: 4000,
      })
      if (composerAutoClear) clearDocSelection()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`복사 실패: ${msg}`)
    } finally {
      setCopying(false)
    }
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
        onClick={handleCopyRef}
        disabled={copying}
        aria-label="@참조를 클립보드에 복사"
      >
        {copying ? '복사 중…' : '📋 Copy @ref'}
      </Button>
    </div>
  )
}
