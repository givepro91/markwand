import { describe, expect, it } from 'vitest'
import type { Doc, Project } from '../../preload/types'
import {
  getBodyReadBudget,
  getBodyReadConcurrency,
  pickBodyReadCandidates,
  scoreMetadata,
  tokenizeQuery,
} from './search'

const project: Project = {
  id: 'abc12345',
  workspaceId: 'local-ws',
  name: 'markwand',
  root: '/repo/markwand',
  markers: ['package.json'],
  docCount: -1,
  lastModified: 0,
}

function doc(index: number, overrides: Partial<Doc> = {}): Doc {
  return {
    path: `/repo/markwand/docs/feature-${index}.md`,
    projectId: project.id,
    name: `feature-${index}.md`,
    mtime: Date.now() - index,
    ...overrides,
  }
}

describe('search backend safeguards', () => {
  it('tokenizes bounded user queries for predictable scoring cost', () => {
    expect(tokenizeQuery('  Project   Wiki   SSH  ')).toEqual(['project', 'wiki', 'ssh'])
    expect(tokenizeQuery('a b c d e f g h i j')).toHaveLength(8)
  })

  it('scores filename/path/frontmatter matches without reading document bodies first', () => {
    const matched = doc(1, {
      name: 'Project-Wiki-Plan.md',
      frontmatter: { status: 'draft', tags: ['ssh', 'performance'] },
    })
    const tokens = tokenizeQuery('ssh performance')

    expect(scoreMetadata(matched, 'ssh performance', tokens)).toBeGreaterThan(0)
    expect(scoreMetadata(doc(2), 'ssh performance', tokens)).toBe(0)
  })

  it('keeps SSH body reads tightly capped and low-concurrency', () => {
    const sshProject = { ...project, workspaceId: 'ssh:1234567890abcdef' }
    const candidates = Array.from({ length: 40 }, (_, index) => ({
      doc: doc(index),
      project: sshProject,
      metadataScore: 100 - index,
    }))

    expect(getBodyReadBudget(sshProject.workspaceId)).toBe(8)
    expect(getBodyReadConcurrency(sshProject.workspaceId)).toBe(2)
    expect(pickBodyReadCandidates(candidates, sshProject.workspaceId)).toHaveLength(8)
  })

  it('allows a larger local body-read budget while still bounding each query', () => {
    const candidates = Array.from({ length: 120 }, (_, index) => ({
      doc: doc(index),
      project,
      metadataScore: 100 - index,
    }))

    expect(getBodyReadBudget(project.workspaceId)).toBe(80)
    expect(getBodyReadConcurrency(project.workspaceId)).toBe(8)
    expect(pickBodyReadCandidates(candidates, project.workspaceId)).toHaveLength(80)
  })
})
