import { useCallback, useMemo, useState } from 'react'
import { useAppStore } from '../state/store'
import { Button } from './ui'
import type { DriftStatus, VerifiedReference } from '../../preload/types'

interface DriftPanelProps {
  docPath: string
  projectRoot: string
  // 위치로 이동 — 뷰어에서 ref.raw 문자열을 find → 하이라이트 + 스크롤.
  // 미지정 시 "위치로 이동" 액션이 숨겨진다 (기본 동작: ProjectView 가 주입).
  onJumpToRef?: (raw: string) => void
}

const STATUS_META: Record<DriftStatus, { label: string; color: string; bg: string; icon: string }> = {
  ok: {
    label: '동기화됨',
    color: 'var(--color-success)',
    bg: 'var(--color-success-bg)',
    icon: '●',
  },
  stale: {
    label: 'stale',
    color: 'var(--color-warning)',
    bg: 'var(--color-warning-bg)',
    icon: '◐',
  },
  missing: {
    label: 'missing',
    color: 'var(--color-danger)',
    bg: 'var(--color-danger-bg)',
    icon: '✕',
  },
}

function relativePath(abs: string, root: string): string {
  if (abs.startsWith(root + '/')) return '@/' + abs.slice(root.length + 1)
  return abs
}

export function DriftPanel({ docPath, projectRoot, onJumpToRef }: DriftPanelProps) {
  const report = useAppStore((s) => s.driftReports[docPath])
  const ignoredList = useAppStore((s) => s.ignoredDriftRefs[docPath])
  const setDriftReport = useAppStore((s) => s.setDriftReport)
  const toggleIgnoredRef = useAppStore((s) => s.toggleIgnoredRef)
  const clearIgnoredRefs = useAppStore((s) => s.clearIgnoredRefs)

  const [expanded, setExpanded] = useState(false)
  const [revalidating, setRevalidating] = useState(false)
  const [revalidateError, setRevalidateError] = useState<string | null>(null)

  const ignored = useMemo(() => new Set(ignoredList ?? []), [ignoredList])

  // 무시 반영된 실제 표시 카운트
  const effectiveCounts = useMemo(() => {
    if (!report) return null
    if (ignored.size === 0) return report.counts
    let ok = 0, missing = 0, stale = 0
    for (const r of report.references) {
      if (ignored.has(r.resolvedPath)) continue
      if (r.status === 'ok') ok++
      else if (r.status === 'missing') missing++
      else stale++
    }
    return { ok, missing, stale }
  }, [report, ignored])

  const handleRevalidate = useCallback(async () => {
    setRevalidating(true)
    setRevalidateError(null)
    try {
      const next = await window.api.drift.verify(docPath, projectRoot)
      setDriftReport(docPath, next)
    } catch (err) {
      setRevalidateError(err instanceof Error ? err.message : String(err))
    } finally {
      setRevalidating(false)
    }
  }, [docPath, projectRoot, setDriftReport])

  // 정렬은 early-return 전에 선언. React hook 규칙: 모든 hook 은 동일 순서로 호출되어야 함.
  // (과거 sortedRefs useMemo 가 return null 뒤에 있어 "Rendered fewer hooks than expected" 크래시 발생했음)
  const sortedRefs = useMemo(() => {
    if (!report) return []
    const order: Record<DriftStatus, number> = { missing: 0, stale: 1, ok: 2 }
    return [...report.references].sort((a, b) => {
      const d = order[a.status] - order[b.status]
      return d !== 0 ? d : a.line - b.line
    })
  }, [report])

  // 렌더 결정: 참조 없으면 숨김, ok만 있으면 조용한 초록 배지 한 줄
  if (!report || report.references.length === 0) return null
  const counts = effectiveCounts!
  const hasIssues = counts.missing > 0 || counts.stale > 0
  const totalRefs = report.references.length

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        background: hasIssues ? 'var(--bg-elev, #fafaf9)' : 'transparent',
        marginBottom: 'var(--sp-4)',
        overflow: 'hidden',
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-3)',
          padding: 'var(--sp-2) var(--sp-3)',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setExpanded((v) => !v)}
        role="button"
        aria-expanded={expanded}
        aria-label="drift 리포트 토글"
      >
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
          {expanded ? '▾' : '▸'}
        </span>
        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-medium)', color: 'var(--text)' }}>
          문서↔코드 참조 {totalRefs}개
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {counts.missing > 0 && (
            <span
              title={`${counts.missing}개 missing — 파일 없음`}
              style={{
                fontSize: 'var(--fs-xs)',
                fontWeight: 'var(--fw-medium)',
                padding: '1px 6px',
                borderRadius: '10px',
                background: STATUS_META.missing.bg,
                color: STATUS_META.missing.color,
              }}
            >
              {counts.missing} missing
            </span>
          )}
          {counts.stale > 0 && (
            <span
              title={`${counts.stale}개 stale — 문서 이후 수정됨`}
              style={{
                fontSize: 'var(--fs-xs)',
                fontWeight: 'var(--fw-medium)',
                padding: '1px 6px',
                borderRadius: '10px',
                background: STATUS_META.stale.bg,
                color: STATUS_META.stale.color,
              }}
            >
              {counts.stale} stale
            </span>
          )}
          {!hasIssues && (
            <span
              style={{
                fontSize: 'var(--fs-xs)',
                fontWeight: 'var(--fw-medium)',
                padding: '1px 6px',
                borderRadius: '10px',
                background: STATUS_META.ok.bg,
                color: STATUS_META.ok.color,
              }}
            >
              전부 OK
            </span>
          )}
          {ignored.size > 0 && (
            <span
              title={`${ignored.size}개 참조가 무시 목록에 있음`}
              style={{
                fontSize: 'var(--fs-xs)',
                padding: '1px 6px',
                borderRadius: '10px',
                background: 'var(--bg-elev-2, #f5f5f4)',
                color: 'var(--text-muted)',
              }}
            >
              무시 {ignored.size}
            </span>
          )}
        </div>
        <span style={{ flex: 1 }} />
        {/* 헤더 div 의 토글 onClick 이 Button에 번지지 않도록 wrapping span 에서 stopPropagation */}
        <span
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'inline-flex' }}
        >
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRevalidate}
            disabled={revalidating}
          >
            {revalidating ? '검증 중…' : '재검증'}
          </Button>
        </span>
      </div>

      {revalidateError && (
        <div
          style={{
            padding: 'var(--sp-2) var(--sp-3)',
            fontSize: 'var(--fs-xs)',
            color: STATUS_META.missing.color,
            background: STATUS_META.missing.bg,
            borderTop: '1px solid var(--border)',
          }}
          role="alert"
        >
          재검증 실패: {revalidateError}
        </div>
      )}

      {/* 참조 목록 */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 'var(--sp-2) var(--sp-3)' }}>
          {/* 상태 설명 — "무엇을 해야 할지 모르겠다" 해소용. hasIssues 일 때만 노출. */}
          {hasIssues && (
            <div
              style={{
                fontSize: 'var(--fs-xs)',
                color: 'var(--text-muted)',
                background: 'var(--bg-elev, #fafaf9)',
                padding: 'var(--sp-2) var(--sp-3)',
                borderRadius: 'var(--r-sm)',
                marginBottom: 'var(--sp-2)',
                lineHeight: 1.5,
              }}
            >
              <div>
                <span style={{ color: STATUS_META.missing.color, fontWeight: 'var(--fw-medium)' }}>✕ missing</span>
                {' '}— 문서가 언급한 파일이 실제로 없습니다. 경로 오타·이름 변경·삭제일 수 있어요. <strong>위치로 이동</strong>으로 문서에서 해당 참조를 찾아 고치거나, 해결이 어려우면 <strong>무시</strong>로 제외하세요.
              </div>
              <div style={{ marginTop: '4px' }}>
                <span style={{ color: STATUS_META.stale.color, fontWeight: 'var(--fw-medium)' }}>◐ stale</span>
                {' '}— 참조 파일이 문서보다 나중에 수정됐습니다. 파일이 열어서 바뀐 내용을 확인한 뒤 문서를 갱신하세요. 문제없으면 <strong>무시</strong>.
              </div>
            </div>
          )}
          {ignored.size > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--sp-2)' }}>
              <Button size="sm" variant="ghost" onClick={() => clearIgnoredRefs(docPath)}>
                무시 전체 해제 ({ignored.size})
              </Button>
            </div>
          )}
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              maxHeight: '280px',
              overflow: 'auto',
            }}
          >
            {sortedRefs.map((ref) => (
              <DriftRefRow
                key={`${ref.resolvedPath}:${ref.line}:${ref.col}`}
                ref_={ref}
                projectRoot={projectRoot}
                ignored={ignored.has(ref.resolvedPath)}
                onToggleIgnore={() => toggleIgnoredRef(docPath, ref.resolvedPath)}
                onJump={onJumpToRef ? () => onJumpToRef(ref.raw) : undefined}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

interface DriftRefRowProps {
  ref_: VerifiedReference
  projectRoot: string
  ignored: boolean
  onToggleIgnore: () => void
  onJump?: () => void
}

function DriftRefRow({ ref_, projectRoot, ignored, onToggleIgnore, onJump }: DriftRefRowProps) {
  const meta = STATUS_META[ref_.status]
  const displayPath = relativePath(ref_.resolvedPath, projectRoot)
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(ref_.resolvedPath)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // clipboard 실패 시 silent — Electron contextIsolation 환경에서 흔함.
    }
  }, [ref_.resolvedPath])

  const handleReveal = useCallback(() => {
    if (ref_.status === 'missing') return
    window.api.shell.revealInFinder(ref_.resolvedPath)
  }, [ref_])

  const actionBtn: React.CSSProperties = {
    flexShrink: 0,
    fontSize: 'var(--fs-xs)',
    padding: '2px 8px',
    borderRadius: 'var(--r-sm)',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }

  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-2)',
        padding: '4px 6px',
        borderRadius: 'var(--r-sm)',
        opacity: ignored ? 0.5 : 1,
        fontSize: 'var(--fs-xs)',
      }}
    >
      <span
        title={meta.label}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '16px',
          color: meta.color,
          fontWeight: 'var(--fw-bold)',
        }}
      >
        {meta.icon}
      </span>
      <span style={{ color: 'var(--text-muted)', flexShrink: 0, minWidth: '40px' }}>
        L{ref_.line}
      </span>
      <span
        title={`${ref_.resolvedPath}\n(클릭: ${ref_.status === 'missing' ? '액션 없음' : 'Finder에서 열기'})`}
        onClick={handleReveal}
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: 'var(--text)',
          fontFamily: 'var(--font-mono, monospace)',
          cursor: ref_.status === 'missing' ? 'default' : 'pointer',
          textDecoration: ignored ? 'line-through' : 'none',
        }}
      >
        {displayPath}
      </span>
      {onJump && (
        <button
          type="button"
          onClick={onJump}
          style={actionBtn}
          title="문서에서 이 참조가 나오는 위치로 이동"
        >
          위치로 이동
        </button>
      )}
      <button
        type="button"
        onClick={handleCopy}
        style={actionBtn}
        title="절대 경로 복사"
      >
        {copied ? '복사됨' : '경로 복사'}
      </button>
      <button
        type="button"
        onClick={onToggleIgnore}
        style={{ ...actionBtn, background: ignored ? 'var(--bg-elev, #fafaf9)' : 'transparent' }}
        aria-pressed={ignored}
      >
        {ignored ? '무시 해제' : '무시'}
      </button>
    </li>
  )
}
