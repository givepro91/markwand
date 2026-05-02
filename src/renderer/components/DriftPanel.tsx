import { useCallback, useMemo, useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useAppStore } from '../state/store'
import { Button } from './ui'
import type { DriftStatus, VerifiedReference } from '../../preload/types'

interface DriftPanelProps {
  docPath: string
  projectRoot: string
  // 위치로 이동 — 뷰어에서 ref.line 을 우선 스크롤하고, ref.raw 문자열은 보조 하이라이트로 사용.
  // 미지정 시 "위치로 이동" 액션이 숨겨진다 (기본 동작: ProjectView 가 주입).
  onJumpToRef?: (target: DriftJumpTarget) => void
}

export interface DriftJumpTarget {
  raw: string
  line: number
  col: number
}

function buildStatusMeta(t: TFunction): Record<DriftStatus, { label: string; color: string; bg: string; icon: string }> {
  return {
    ok: {
      label: t('drift.statusOk'),
      color: 'var(--color-success)',
      bg: 'var(--color-success-bg)',
      icon: '●',
    },
    stale: {
      label: t('drift.statusStale'),
      color: 'var(--color-warning)',
      bg: 'var(--color-warning-bg)',
      icon: '◐',
    },
    missing: {
      label: t('drift.statusMissing'),
      color: 'var(--color-danger)',
      bg: 'var(--color-danger-bg)',
      icon: '✕',
    },
  }
}

function relativePath(abs: string, root: string): string {
  if (abs.startsWith(root + '/')) return '@/' + abs.slice(root.length + 1)
  return abs
}

// "위치로 이동" 시 뷰어에서 find 할 검색어 — 백틱을 제거해 실제 본문 텍스트와 매치되게.
// - inline: `utils/helper.ts` → utils/helper.ts
// - at:     @/path (그대로)
// - hint:   // src/foo.ts (전체 라인 — 코드블록 내 주석 라인 전체와 매치)
function getSearchText(raw: string, kind: string): string {
  if (kind === 'inline') return raw.replace(/^`+|`+$/g, '')
  return raw
}

// 이슈(missing/stale) 를 AI 프롬프트 형식으로 직렬화. 무시된 참조는 제외한다.
// 반환이 빈 문자열이면 호출 측에서 버튼을 숨긴다 — 사실 hasIssues 가드로 도달 불가.
export function buildCopyIssuesPrompt(params: {
  docPath: string
  projectRoot: string
  references: VerifiedReference[]
  ignored: Set<string>
  t: TFunction
}): string {
  const { docPath, projectRoot, references, ignored, t } = params
  const active = references.filter((r) => !ignored.has(r.resolvedPath))
  const missing = active.filter((r) => r.status === 'missing')
  const stale = active.filter((r) => r.status === 'stale')
  if (missing.length === 0 && stale.length === 0) return ''

  const docRel = relativePath(docPath, projectRoot)
  const out: string[] = []
  out.push(t('drift.prompt.thisDoc', { path: docRel }))
  out.push('')
  out.push(t('drift.prompt.intro'))
  out.push('')

  if (missing.length > 0) {
    out.push(t('drift.prompt.missingHeading', { count: missing.length }))
    for (const r of missing) {
      const rawSafe = r.raw.replace(/`/g, '')
      out.push(`- ${relativePath(r.resolvedPath, projectRoot)} (L${r.line}, \`${rawSafe}\`)`)
    }
    out.push('')
  }

  if (stale.length > 0) {
    out.push(t('drift.prompt.staleHeading', { count: stale.length }))
    for (const r of stale) {
      const mtimeStr =
        typeof r.targetMtime === 'number'
          ? new Date(r.targetMtime).toISOString().slice(0, 10)
          : t('drift.prompt.unknownTime')
      out.push(
        t('drift.prompt.staleItem', {
          path: relativePath(r.resolvedPath, projectRoot),
          line: r.line,
          time: mtimeStr,
        }),
      )
    }
    out.push('')
  }

  if (missing.length > 0 && stale.length > 0) {
    out.push(t('drift.prompt.closing'))
  } else if (missing.length > 0) {
    out.push(t('drift.prompt.closingMissing'))
  } else {
    out.push(t('drift.prompt.closingStale'))
  }

  return out.join('\n')
}

export function DriftPanel({ docPath, projectRoot, onJumpToRef }: DriftPanelProps) {
  const { t } = useTranslation()
  const STATUS_META = useMemo(() => buildStatusMeta(t), [t])
  const report = useAppStore((s) => s.driftReports[docPath])
  const ignoredList = useAppStore((s) => s.ignoredDriftRefs[docPath])
  const setDriftReport = useAppStore((s) => s.setDriftReport)
  const toggleIgnoredRef = useAppStore((s) => s.toggleIgnoredRef)
  const clearIgnoredRefs = useAppStore((s) => s.clearIgnoredRefs)

  const [expanded, setExpanded] = useState(false)
  const [revalidating, setRevalidating] = useState(false)
  const [revalidateError, setRevalidateError] = useState<string | null>(null)
  const [issuesCopied, setIssuesCopied] = useState(false)

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

  const handleCopyIssues = useCallback(async () => {
    if (!report) return
    const text = buildCopyIssuesPrompt({
      docPath,
      projectRoot,
      references: report.references,
      ignored,
      t,
    })
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setIssuesCopied(true)
      setTimeout(() => setIssuesCopied(false), 1200)
    } catch {
      // clipboard 실패 시 silent — Electron contextIsolation 환경에서 흔함.
    }
  }, [report, docPath, projectRoot, ignored, t])

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
        background: hasIssues ? 'var(--bg-elev)' : 'transparent',
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
        aria-label={t('drift.ariaToggle')}
      >
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
          {expanded ? '▾' : '▸'}
        </span>
        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-medium)', color: 'var(--text)' }}>
          {t('drift.totalRefs', { count: totalRefs })}
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {counts.missing > 0 && (
            <span
              title={t('drift.missingTitle', { count: counts.missing })}
              style={{
                fontSize: 'var(--fs-xs)',
                fontWeight: 'var(--fw-medium)',
                padding: '1px 6px',
                borderRadius: '10px',
                background: STATUS_META.missing.bg,
                color: STATUS_META.missing.color,
              }}
            >
              {t('drift.badgeMissingText', { count: counts.missing })}
            </span>
          )}
          {counts.stale > 0 && (
            <span
              title={t('drift.staleTitle', { count: counts.stale })}
              style={{
                fontSize: 'var(--fs-xs)',
                fontWeight: 'var(--fw-medium)',
                padding: '1px 6px',
                borderRadius: '10px',
                background: STATUS_META.stale.bg,
                color: STATUS_META.stale.color,
              }}
            >
              {t('drift.badgeStaleText', { count: counts.stale })}
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
              {t('drift.ok')}
            </span>
          )}
          {ignored.size > 0 && (
            <span
              title={t('drift.ignoredTitle', { count: ignored.size })}
              style={{
                fontSize: 'var(--fs-xs)',
                padding: '1px 6px',
                borderRadius: 'var(--r-pill)',
                background: 'var(--bg-elev)',
                color: 'var(--text-muted)',
              }}
            >
              {t('drift.ignoredLabel', { count: ignored.size })}
            </span>
          )}
        </div>
        <span style={{ flex: 1 }} />
        {/* 헤더 div 의 토글 onClick 이 Button에 번지지 않도록 wrapping span 에서 stopPropagation */}
        <span
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'inline-flex', gap: '4px' }}
        >
          {hasIssues && (
            <span
              title={t('drift.copyIssuesTitle')}
              style={{ display: 'inline-flex' }}
            >
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopyIssues}
                aria-label={t('drift.copyIssuesAria')}
              >
                {issuesCopied ? t('drift.copyIssuesDone') : t('drift.copyIssuesLabel')}
              </Button>
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRevalidate}
            disabled={revalidating}
          >
            {revalidating ? t('drift.revalidating') : t('drift.revalidate')}
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
          {t('drift.revalidateFailed', { err: revalidateError })}
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
                background: 'var(--bg-elev)',
                padding: 'var(--sp-2) var(--sp-3)',
                borderRadius: 'var(--r-sm)',
                marginBottom: 'var(--sp-2)',
                lineHeight: 1.5,
              }}
            >
              <div>
                <span style={{ color: STATUS_META.missing.color, fontWeight: 'var(--fw-medium)' }}>✕ {t('drift.statusMissing')}</span>
                <Trans i18nKey="drift.missingDetail">
                  {' '}— text. <strong>Jump</strong>, <strong>Ignore</strong>.
                </Trans>
              </div>
              <div style={{ marginTop: '4px' }}>
                <span style={{ color: STATUS_META.stale.color, fontWeight: 'var(--fw-medium)' }}>◐ {t('drift.statusStale')}</span>
                <Trans i18nKey="drift.staleDetail">
                  {' '}— text <em>file</em>. <strong>Ignore</strong>.
                </Trans>
              </div>
            </div>
          )}
          {ignored.size > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--sp-2)' }}>
              <Button size="sm" variant="ghost" onClick={() => clearIgnoredRefs(docPath)}>
                {t('drift.ignoredReset', { count: ignored.size })}
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
                onJump={onJumpToRef ? () => onJumpToRef({
                  raw: getSearchText(ref.raw, ref.kind),
                  line: ref.line,
                  col: ref.col,
                }) : undefined}
              />
            ))}
          </ul>
        </div>
      )}
      {/* 2MB skip 고지 — report 에 sizeSkipped 가 있을 때만 표시 */}
      {(report.sizeSkipped ?? 0) > 0 && (
        <div
          style={{
            padding: 'var(--sp-2) var(--sp-3)',
            fontSize: 'var(--fs-xs)',
            color: 'var(--text-muted)',
            borderTop: '1px solid var(--border-muted)',
          }}
        >
          {t('drift.sizeSkippedCount', { count: report.sizeSkipped })}
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
  const { t } = useTranslation()
  const STATUS_META = useMemo(() => buildStatusMeta(t), [t])
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

  // 경로 span 전체는 클릭 영역이 아님. 액션은 버튼에만 모음. (사용자 피드백: 실수로 파인더 열림)
  // "Finder 에서 열기" 가 필요하면 별도 버튼으로 제공.

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
        title={ref_.resolvedPath}
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: 'var(--text)',
          fontFamily: 'var(--font-mono, monospace)',
          textDecoration: ignored ? 'line-through' : 'none',
          // user-select 허용해 경로 드래그·복사는 가능하게. 단, 클릭 자체는 no-op.
          userSelect: 'text',
        }}
      >
        {displayPath}
      </span>
      {ref_.isDirectory && (
        <span
          title={t('drift.folderTitle')}
          style={{
            flexShrink: 0,
            fontSize: 'var(--fs-xs)',
            color: 'var(--text-muted)',
            background: 'var(--bg-elev)',
            padding: '1px 6px',
            borderRadius: 'var(--r-lg)',
          }}
        >
          {t('drift.folderLabel')}
        </span>
      )}
      {onJump && (
        <button
          type="button"
          onClick={onJump}
          style={actionBtn}
          title={t('drift.jumpTitle')}
        >
          {t('drift.jumpLabel')}
        </button>
      )}
      {ref_.status !== 'missing' && (
        <button
          type="button"
          onClick={handleReveal}
          style={actionBtn}
          title={ref_.isDirectory ? t('drift.revealFolder') : t('drift.revealFile')}
        >
          {t('drift.openInFinder')}
        </button>
      )}
      <button
        type="button"
        onClick={handleCopy}
        style={actionBtn}
        title={t('drift.copyPathTitle')}
      >
        {copied ? t('drift.copyPathDone') : t('drift.copyPathLabel')}
      </button>
      <button
        type="button"
        onClick={onToggleIgnore}
        style={{ ...actionBtn, background: ignored ? 'var(--bg-elev)' : 'transparent' }}
        aria-pressed={ignored}
      >
        {ignored ? t('drift.unignore') : t('drift.ignore')}
      </button>
    </li>
  )
}
