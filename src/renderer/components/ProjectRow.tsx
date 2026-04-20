import { memo } from 'react'
import { StatusMessage } from './ui'
import type { Project } from '../../../src/preload/types'

interface ProjectRowProps {
  project: Project
  onOpen: (project: Project) => void
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

const FinderIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M.54 3.87.5 3a2 2 0 0 1 2-2h3.19l.637.315A1.5 1.5 0 0 0 7 1.5h2a1.5 1.5 0 0 0 .645-.185L10.27 1H13.5A2 2 0 0 1 15.5 3v10a2 2 0 0 1-2 2H2.5a2 2 0 0 1-2-2V3.87zm3.11-.985A1 1 0 0 0 2.5 4h11a1 1 0 0 0-1-1.115L11.27 3H10a.5.5 0 0 1-.215-.046L9.148 2.5H6.852L6.215 2.954A.5.5 0 0 1 6 3H4.73l-1.08.885z"/>
  </svg>
)

export const ProjectRow = memo(function ProjectRow({ project, onOpen }: ProjectRowProps) {
  const docCount = project.docCount

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(project)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(project)
        }
      }}
      className="project-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-3)',
        padding: 'var(--sp-2) var(--sp-3)',
        borderRadius: 'var(--r-md)',
        cursor: 'pointer',
        border: '1px solid transparent',
        transition: 'background var(--duration-fast) var(--ease-standard)',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)'
        e.currentTarget.style.borderColor = 'var(--border)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.borderColor = 'transparent'
      }}
    >
      {/* 프로젝트 이름 */}
      <span
        style={{
          fontSize: 'var(--fs-sm)',
          fontWeight: 'var(--fw-medium)',
          color: 'var(--text)',
          flex: '1 1 160px',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {project.name}
      </span>

      {/* 문서 수 */}
      <span
        style={{
          fontSize: 'var(--fs-xs)',
          color: 'var(--text-muted)',
          flexShrink: 0,
          width: '60px',
          textAlign: 'right',
        }}
      >
        {docCount > 0 ? (
          `${docCount}개`
        ) : (
          <StatusMessage variant="loading" inline>…</StatusMessage>
        )}
      </span>

      {/* 날짜 */}
      <span
        style={{
          fontSize: 'var(--fs-xs)',
          color: 'var(--text-muted)',
          flexShrink: 0,
          width: '56px',
          textAlign: 'right',
        }}
      >
        {formatDate(project.lastModified)}
      </span>

      {/* Finder 아이콘 */}
      <div className="card-actions" style={{ flexShrink: 0 }}>
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
            e.stopPropagation()
            e.currentTarget.style.background = 'var(--bg-hover)'
            e.currentTarget.style.color = 'var(--text)'
          }}
          onMouseLeave={(e) => {
            e.stopPropagation()
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
        >
          <FinderIcon />
        </button>
      </div>

      {/* chevron */}
      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>›</span>
    </div>
  )
})
