import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, StatusMessage } from './ui'
import { useAppStore } from '../state/store'
import { isDriftRefIgnored } from '../lib/driftRefKey'
import type { Project } from '../../../src/preload/types'

interface ProjectCardProps {
  project: Project
  onOpen: (project: Project) => void
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

const FinderIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M.54 3.87.5 3a2 2 0 0 1 2-2h3.19l.637.315A1.5 1.5 0 0 0 7 1.5h2a1.5 1.5 0 0 0 .645-.185L10.27 1H13.5A2 2 0 0 1 15.5 3v10a2 2 0 0 1-2 2H2.5a2 2 0 0 1-2-2V3.87zm3.11-.985A1 1 0 0 0 2.5 4h11a1 1 0 0 0-1-1.115L11.27 3H10a.5.5 0 0 1-.215-.046L9.148 2.5H6.852L6.215 2.954A.5.5 0 0 1 6 3H4.73l-1.08.885z"/>
  </svg>
)

export const ProjectCard = memo(function ProjectCard({ project, onOpen }: ProjectCardProps) {
  const { t } = useTranslation()
  const docCount = project.docCount
  const driftReports = useAppStore((s) => s.driftReports)
  const ignoredDriftRefs = useAppStore((s) => s.ignoredDriftRefs)

  // 이 프로젝트에 속한 리포트만 합산, 무시된 참조는 제외.
  const driftCounts = useMemo(() => {
    let missing = 0
    let stale = 0
    for (const r of Object.values(driftReports)) {
      if (r.projectRoot !== project.root) continue
      const ignored = ignoredDriftRefs[r.docPath]
      if (!ignored || ignored.length === 0) {
        missing += r.counts.missing
        stale += r.counts.stale
        continue
      }
      const ignoredSet = new Set(ignored)
      for (const ref of r.references) {
        if (isDriftRefIgnored(ignoredSet, ref)) continue
        if (ref.status === 'missing') missing++
        else if (ref.status === 'stale') stale++
      }
    }
    return { missing, stale }
  }, [driftReports, ignoredDriftRefs, project.root])

  const hasDrift = driftCounts.missing > 0 || driftCounts.stale > 0

  return (
    <Card padding="sm" interactive onClick={() => onOpen(project)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        {/* 헤더 행: 이름 + 액션 아이콘 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--sp-2)' }}>
          <h3
            style={{
              fontSize: 'var(--fs-sm)',
              fontWeight: 'var(--fw-bold)',
              color: 'var(--text)',
              margin: 0,
              lineHeight: 'var(--lh-tight)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}
          >
            {project.name}
          </h3>
          {/* 액션 아이콘 — hover 시 표시 */}
          <div className="card-actions" style={{ display: 'flex', gap: 'var(--sp-1)', flexShrink: 0 }}>
            <button
              type="button"
              aria-label={t('project.revealAria')}
              title={t('project.revealTitle')}
              onClick={(e) => {
                e.stopPropagation()
                window.api.shell.revealInFinder(project.root)
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '22px',
                height: '22px',
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--r-sm)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: 0,
                transition: 'background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-hover)'
                e.currentTarget.style.color = 'var(--text)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--text-muted)'
              }}
            >
              <FinderIcon />
            </button>
          </div>
        </div>

        {/* 문서 수 + 날짜 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-2)' }}>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
            {docCount < 0 ? (
              <StatusMessage variant="loading" inline>{t('project.analyzing')}</StatusMessage>
            ) : (
              <span>{t('project.docCount', { count: docCount })}</span>
            )}
            {hasDrift && (
              <span
                title={t('project.driftTitle', { missing: driftCounts.missing, stale: driftCounts.stale })}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: 'var(--fs-xs)',
                  fontWeight: 'var(--fw-medium)',
                  padding: '1px 6px',
                  borderRadius: 'var(--r-pill)',
                  background: driftCounts.missing > 0 ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)',
                  color: driftCounts.missing > 0 ? 'var(--color-danger)' : 'var(--color-warning)',
                  lineHeight: 1.3,
                }}
              >
                {driftCounts.missing > 0 && driftCounts.stale > 0
                  ? t('project.driftBadgeMixed', { missing: driftCounts.missing, stale: driftCounts.stale })
                  : driftCounts.missing > 0
                    ? t('project.driftBadgeMissing', { count: driftCounts.missing })
                    : t('project.driftBadgeStale', { count: driftCounts.stale })}
              </span>
            )}
          </div>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
            {formatDate(project.lastModified)}
          </span>
        </div>
      </div>
    </Card>
  )
})
