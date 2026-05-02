/**
 * composeDocsFromFileStats — M3 §S0.2 RM-7 해소로 ipc/workspace.ts 에 신설된 헬퍼.
 * LocalScannerDriver.scanDocs(FileStat) 스트림을 Doc composition 으로 조립한다.
 * Plan S0 DoD: composeDocsFromFileStats 3건 단위 테스트.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { composeDocsFromFileStats, findProjectIdByPathIn } from './workspace'
import { localTransport } from '../transport/local'
import type { Project } from '../../preload/types'

async function collectAll<T>(gen: AsyncGenerator<T[]>): Promise<T[]> {
  const out: T[] = []
  for await (const chunk of gen) out.push(...chunk)
  return out
}

function makeTempWorkspace(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'markwand-compose-test-'))
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content, 'utf-8')
  }
  return root
}

describe('composeDocsFromFileStats', () => {
  it('md + 이미지 혼합에서 md 만 frontmatter 파싱, 이미지는 Doc composition 만 (projectId · name · mtime · size)', async () => {
    const root = makeTempWorkspace({
      'note-1.md': '---\ntitle: doc-1\ntags: [a, b]\n---\n\n# content',
      'assets/pic-1.png': Buffer.alloc(128, 0).toString('utf-8'), // placeholder
    })
    try {
      const docs = await collectAll(composeDocsFromFileStats(localTransport, 'proj-1', root))
      expect(docs.length).toBe(2)

      const md = docs.find((d) => d.path.endsWith('note-1.md'))!
      expect(md.projectId).toBe('proj-1')
      expect(md.name).toBe('note-1.md')
      expect(md.size).toBeGreaterThan(0)
      expect(md.mtime).toBeGreaterThan(0)
      expect(md.frontmatter?.title).toBe('doc-1')
      expect(md.frontmatter?.tags).toEqual(['a', 'b'])

      const img = docs.find((d) => d.path.endsWith('pic-1.png'))!
      expect(img.projectId).toBe('proj-1')
      expect(img.frontmatter).toBeUndefined()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('chunkSize 경계 — 50 초과 시 여러 chunk 로 분할 (기본 chunkSize=50)', async () => {
    const files: Record<string, string> = {}
    for (let i = 0; i < 75; i++) {
      files[`note-${i}.md`] = `---\ntitle: doc-${i}\n---\n`
    }
    const root = makeTempWorkspace(files)
    try {
      const chunks: number[] = []
      for await (const chunk of composeDocsFromFileStats(localTransport, 'proj-2', root)) {
        chunks.push(chunk.length)
      }
      // 75 = 50 + 25 → 2 chunks
      expect(chunks.length).toBe(2)
      expect(chunks[0]).toBe(50)
      expect(chunks[1]).toBe(25)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('findProjectIdByPathIn — Follow-up FS-RT-1 watcher path → projectId 역추적', () => {
    function mkProject(id: string, root: string): Project {
      return {
        id,
        workspaceId: 'ws-1',
        name: path.basename(root),
        root,
        markers: [],
        docCount: -1,
        lastModified: 0,
      }
    }
    const cache = new Map<string, Project[]>()
    cache.set('ws-1', [
      mkProject('p-outer', '/ws/outer'),
      mkProject('p-inner', '/ws/outer/sub'),
      mkProject('p-other', '/ws/other'),
    ])

    // 정확히 root 인 파일 → 그 root 매칭
    expect(findProjectIdByPathIn(cache, '/ws/outer')).toBe('p-outer')
    // root 하위 파일 → 매칭
    expect(findProjectIdByPathIn(cache, '/ws/outer/note.md')).toBe('p-outer')
    // 더 깊은 root 도 매칭 가능 → 가장 긴 prefix 우선 (container 케이스)
    expect(findProjectIdByPathIn(cache, '/ws/outer/sub/deep/x.md')).toBe('p-inner')
    // 다른 워크스페이스
    expect(findProjectIdByPathIn(cache, '/ws/other/y.md')).toBe('p-other')
    // 어느 root 에도 속하지 않음
    expect(findProjectIdByPathIn(cache, '/elsewhere/z.md')).toBeNull()
    // sibling (prefix 비매칭, '/ws/outer-sibling' 은 '/ws/outer/' 로 시작 안 함)
    expect(findProjectIdByPathIn(cache, '/ws/outer-sibling/x.md')).toBeNull()
    // 빈 캐시
    expect(findProjectIdByPathIn(new Map(), '/ws/outer/x.md')).toBeNull()
  })

  it('ignore 패턴 준수 — node_modules/dist/__fixtures__ 안의 md 는 Doc composition 대상 아님 (LocalScannerDriver.scanDocs 경유)', async () => {
    const root = makeTempWorkspace({
      'README.md': '# root',
      'node_modules/pkg/a.md': '# skip',
      'dist/build.md': '# skip',
      '.pytest_cache/README.md': '# pytest cache',
      'src/__fixtures__/fm-foo.md': '---\ntags: []\n---\n# fixture', // GUI 피드백: fixture 혼입 방지
      'src/__snapshots__/snap.md': '# snap',
    })
    try {
      const docs = await collectAll(composeDocsFromFileStats(localTransport, 'proj-3', root))
      const paths = docs.map((d) => d.path)
      expect(paths.some((p) => p.endsWith('README.md'))).toBe(true)
      expect(paths.some((p) => p.includes('node_modules'))).toBe(false)
      expect(paths.some((p) => p.includes('dist'))).toBe(false)
      expect(paths.some((p) => p.includes('.pytest_cache'))).toBe(false)
      expect(paths.some((p) => p.includes('__fixtures__'))).toBe(false)
      expect(paths.some((p) => p.includes('__snapshots__'))).toBe(false)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
