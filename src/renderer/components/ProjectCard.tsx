import { memo } from 'react'
import { Card, StatusMessage } from './ui'
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
  const docCount = project.docCount

  return (
    <Card padding="sm" interactive onClick={() => onOpen(project)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        {/* 헤더 행: 이름 + 액션 아이콘 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--sp-2)' }}>
          <h3
            style={{
              fontSize: 'var(--fs-sm)',
              fontWeight: 'var(--fw-semibold)',
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
              aria-label="Finder에서 열기"
              title="Finder에서 열기"
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
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
            {docCount < 0 ? (
              <StatusMessage variant="loading" inline>분석 중</StatusMessage>
            ) : (
              `문서 ${docCount}개`
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
