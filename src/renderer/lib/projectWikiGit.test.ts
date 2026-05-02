import { describe, expect, it } from 'vitest'
import type { Doc, GitPulseSummary } from '../../preload/types'
import { buildProjectWikiGitContext, formatProjectWikiGitContext } from './projectWikiGit'

const NOW = Date.parse('2026-05-02T00:00:00Z')

function doc(name: string, overrides: Partial<Doc> = {}): Doc {
  return {
    path: `/project/${name}`,
    projectId: 'p1',
    name,
    mtime: NOW - 60_000,
    ...overrides,
  }
}

function pulse(overrides: Partial<GitPulseSummary> = {}): GitPulseSummary {
  return {
    available: true,
    branch: 'main',
    head: 'abc123',
    dirtyCount: 0,
    recentCommitCount: 5,
    changedFileCount: 4,
    changedFiles: ['src/renderer/ProjectView.tsx', 'src/main/ipc/git.ts', 'scripts/deploy.ts', 'package.json'],
    changedAreas: ['src/renderer', 'src/main', 'scripts/deploy'],
    commits: [],
    cachedAt: NOW,
    ...overrides,
  }
}

describe('projectWikiGit context', () => {
  it('promotes operational and current-guide checks without forcing old work logs to refresh', () => {
    const docs = [
      doc('README.md', { mtime: NOW - 45 * 24 * 60 * 60 * 1000 }),
      doc('docs/ops/deploy.md', {
        mtime: NOW - 20 * 24 * 60 * 60 * 1000,
        frontmatter: { source: 'ops', status: 'runbook' },
      }),
      doc('docs/plans/april-plan.md', {
        mtime: NOW - 100 * 24 * 60 * 60 * 1000,
        frontmatter: { source: 'design', status: 'done' },
      }),
    ]

    const context = buildProjectWikiGitContext(docs, pulse(), NOW)

    expect(context?.insights.map((item) => item.kind)).toEqual([
      'operationalCheck',
      'currentGuideCheck',
      'decisionTrace',
    ])
    expect(context?.situation).toMatchObject({
      kind: 'needsTriage',
      priority: 'high',
      focusDoc: { name: 'docs/ops/deploy.md' },
    })
    expect(context?.insights.find((item) => item.kind === 'operationalCheck')).toMatchObject({
      priority: 'high',
      doc: { name: 'docs/ops/deploy.md', role: 'operational', ageDays: 20 },
      changedFile: 'scripts/deploy.ts',
    })
    expect(context?.insights.some((item) => item.doc?.path.includes('/docs/plans/'))).toBe(true)
    expect(context?.insights.find((item) => item.doc?.path.includes('/docs/plans/'))?.kind).toBe('decisionTrace')
  })

  it('keeps quiet when a Git summary is unavailable or SSH-disabled', () => {
    expect(buildProjectWikiGitContext([doc('README.md')], { available: false, reason: 'ssh-unsupported' }, NOW)).toBeNull()
  })

  it('formats role-sensitive Git context for AI handoff', () => {
    const context = buildProjectWikiGitContext(
      [doc('README.md', { mtime: NOW - 45 * 24 * 60 * 60 * 1000 })],
      pulse({ dirtyCount: 2, changedFiles: ['src/app.ts'], changedAreas: ['src/app.ts'] }),
      NOW
    )

    const lines = formatProjectWikiGitContext(context)

    expect(lines).toContain('- Branch: main')
    expect(lines).toContain('- Uncommitted changes: 2')
    expect(lines).toContain('- Situation: workInProgress')
    expect(lines.join('\n')).toContain('Role-sensitive interpretation')
    expect(lines.join('\n')).toContain('current guide')
    expect(lines.join('\n')).toContain('Uncommitted local work exists')
  })
})
