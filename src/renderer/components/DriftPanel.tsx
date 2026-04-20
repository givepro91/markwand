import { useCallback, useMemo, useState } from 'react'
import { useAppStore } from '../state/store'
import { Button } from './ui'
import type { DriftStatus, VerifiedReference } from '../../preload/types'

interface DriftPanelProps {
  docPath: string
  projectRoot: string
}

const STATUS_META: Record<DriftStatus, { label: string; color: string; bg: string; icon: string }> = {
  ok: {
    label: '동기화됨',
    color: 'var(--color-success-fg, #067647)',
    bg: 'var(--color-success-bg, #dcfae6)',
    icon: '●',
  },
  stale: {
    label: 'stale',
    color: 'var(--color-warning-fg, #b54708)',
    bg: 'var(--color-warning-bg, #fef0c7)',
    icon: '◐',
  },
  missing: {
    label: 'missing',
    color: 'var(--color-danger-fg, #b42318)',
    bg: 'var(--color-danger-bg, #fee4e2)',
    icon: '✕',
  },
}

function relativePath(abs: string, root: string): string {
  if (abs.startsWith(root + '/')) return '@/' + abs.slice(root.length + 1)
  return abs
}

export function DriftPanel({ docPath, projectRoot }: DriftPanelProps) {
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

  // 렌더 결정: 참조 없으면 숨김, ok만 있으면 조용한 초록 배지 한 줄
  if (!report || report.references.length === 0) return null
  const counts = effectiveCounts!
  const hasIssues = counts.missing > 0 || counts.stale > 0
  const totalRefs = report.references.length

  // 정렬: missing → stale → ok, 각 내부는 line 오름차순
  const sortedRefs = useMemo(() => {
    const order: Record<DriftStatus, number> = { missing: 0, stale: 1, ok: 2 }
    return [...report.references].sort((a, b) => {
      const d = order[a.status] - order[b.status]
      return d !== 0 ? d : a.line - b.line
    })
  }, [report])

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
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation()
            handleRevalidate()
          }}
          disabled={revalidating}
        >
          {revalidating ? '검증 중…' : '재검증'}
        </Button>
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
}

function DriftRefRow({ ref_, projectRoot, ignored, onToggleIgnore }: DriftRefRowProps) {
  const meta = STATUS_META[ref_.status]
  const displayPath = relativePath(ref_.resolvedPath, projectRoot)
  const handleReveal = useCallback(() => {
    if (ref_.status === 'missing') return
    window.api.shell.revealInFinder(ref_.resolvedPath)
  }, [ref_])

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
      <span style={{ color: 'var(--text-muted)', flexShrink: 0, minWidth: '48px' }}>
        L{ref_.line}
      </span>
      <span
        title={ref_.resolvedPath}
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
      <span
        style={{
          flexShrink: 0,
          color: 'var(--text-muted)',
          fontSize: 'var(--fs-xs)',
          fontStyle: 'italic',
        }}
      >
        {ref_.kind}
      </span>
      <button
        type="button"
        onClick={onToggleIgnore}
        style={{
          flexShrink: 0,
          fontSize: 'var(--fs-xs)',
          padding: '2px 8px',
          borderRadius: 'var(--r-sm)',
          border: '1px solid var(--border)',
          background: ignored ? 'var(--bg-elev, #fafaf9)' : 'transparent',
          color: 'var(--text-muted)',
          cursor: 'pointer',
        }}
        aria-pressed={ignored}
      >
        {ignored ? '무시 해제' : '무시'}
      </button>
    </li>
  )
}
