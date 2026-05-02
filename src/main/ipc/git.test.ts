import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { execaSync } from 'execa'
import { describe, expect, it } from 'vitest'
import { buildLocalGitPulseSummary } from './git'

function makeRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'markwand-git-pulse-'))
  execaSync('git', ['init'], { cwd: root })
  execaSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root })
  execaSync('git', ['config', 'user.name', 'Test User'], { cwd: root })
  return root
}

function commitFile(root: string, file: string, content: string, message: string): void {
  const target = path.join(root, file)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, content)
  execaSync('git', ['add', file], { cwd: root })
  execaSync('git', ['commit', '-m', message], { cwd: root })
}

describe('buildLocalGitPulseSummary', () => {
  it('summarizes a local git repository without network or GitHub access', async () => {
    const root = makeRepo()
    try {
      commitFile(root, 'README.md', '# Demo\n', 'docs: add readme')
      commitFile(root, 'src/app.ts', 'export const app = true\n', 'feat: add app')
      writeFileSync(path.join(root, 'src/app.ts'), 'export const app = false\n')

      const summary = await buildLocalGitPulseSummary(root, Date.parse('2026-05-02T00:00:00Z'))

      expect(summary.available).toBe(true)
      expect(summary.branch).toBeTruthy()
      expect(summary.head).toMatch(/^[a-f0-9]{7,}$/)
      expect(summary.dirtyCount).toBe(1)
      expect(summary.recentCommitCount).toBeGreaterThanOrEqual(2)
      expect(summary.changedFiles).toEqual(expect.arrayContaining(['README.md', 'src/app.ts']))
      expect(summary.changedAreas).toContain('src/app.ts')
      expect(summary.commits?.[0]?.subject).toBe('feat: add app')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns a calm unavailable result outside git repositories', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'markwand-not-git-'))
    try {
      const summary = await buildLocalGitPulseSummary(root)

      expect(summary).toMatchObject({ available: false, reason: 'not-git' })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
