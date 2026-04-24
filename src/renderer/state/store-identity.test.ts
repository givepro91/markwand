/**
 * store-identity.test.ts — C-2 Zustand 5 identity 보장 검증 (S4)
 *
 * 5건:
 * I1 — appendDocs 연속 2회 호출 시 docs 배열 identity 가 다름 (chunk마다 새 참조)
 * I2 — appendDocs 1회 후 docs[0] identity 유지 (spread 아닌 Map 기반 concat)
 * I3 — updateDoc 시 나머지 요소 identity 유지
 * I4 — removeDoc 시 남은 요소 identity 유지
 * I5 — setDocs([]) 후 다시 appendDocs 시 재구축 정상
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from './store'

type Doc = {
  path: string
  projectId: string
  name: string
  mtime: number
  size?: number
  frontmatter?: Record<string, unknown>
  workspaceId?: string
}

function makeDoc(id: number, pid = 'proj-A'): Doc {
  return {
    path: `/workspace/${pid}/doc-${id}.md`,
    projectId: pid,
    name: `doc-${id}.md`,
    mtime: Date.now() - id * 1000,
  }
}

beforeEach(() => {
  useAppStore.getState().setDocs([])
})

// I1: appendDocs 연속 2회 → docs 배열 참조가 각각 다른 identity
describe('I1: appendDocs 연속 2회 시 docs identity 다름', () => {
  it('두 번째 appendDocs 후 docs 참조가 첫 번째와 다름', () => {
    const doc1 = makeDoc(1)
    const doc2 = makeDoc(2)

    useAppStore.getState().appendDocs([doc1])
    const docsAfterFirst = useAppStore.getState().docs

    useAppStore.getState().appendDocs([doc2])
    const docsAfterSecond = useAppStore.getState().docs

    // 참조가 다름 (새 cachedFlat 할당)
    expect(docsAfterFirst).not.toBe(docsAfterSecond)
    expect(docsAfterFirst).toHaveLength(1)
    expect(docsAfterSecond).toHaveLength(2)
  })
})

// I2: appendDocs 1회 후 docs[0] 객체 identity 유지
describe('I2: appendDocs 후 기존 doc 객체 identity 유지', () => {
  it('첫 번째 doc 객체가 두 번째 appendDocs 후에도 동일 참조', () => {
    const doc1 = makeDoc(1)
    const doc2 = makeDoc(2)

    useAppStore.getState().appendDocs([doc1])
    const firstDocRef = useAppStore.getState().docs[0]

    useAppStore.getState().appendDocs([doc2])
    // docs[0]은 doc1과 동일 객체 참조여야 한다 (불필요한 spread/clone 없음)
    const firstDocAfter = useAppStore.getState().docs.find((d) => d.path === doc1.path)

    expect(firstDocAfter).toBe(firstDocRef)
  })
})

// I3: updateDoc 시 나머지 요소 identity 유지
describe('I3: updateDoc 시 수정 안 된 요소 identity 유지', () => {
  it('doc2 업데이트 시 doc1 객체 identity 유지됨', () => {
    const doc1 = makeDoc(1)
    const doc2 = makeDoc(2)

    useAppStore.getState().appendDocs([doc1, doc2])
    const doc1RefBefore = useAppStore.getState().docs.find((d) => d.path === doc1.path)!

    useAppStore.getState().updateDoc(doc2.path, { mtime: Date.now() + 9999 })

    const doc1RefAfter = useAppStore.getState().docs.find((d) => d.path === doc1.path)!

    // doc1은 updateDoc 대상이 아니므로 동일 참조
    expect(doc1RefAfter).toBe(doc1RefBefore)
    // doc2는 새 참조 (spread로 업데이트됨)
    const doc2After = useAppStore.getState().docs.find((d) => d.path === doc2.path)!
    expect(doc2After).not.toBe(doc2)
    expect(doc2After.mtime).toBeGreaterThan(doc2.mtime)
  })
})

// I4: removeDoc 시 남은 요소 identity 유지
describe('I4: removeDoc 시 남은 요소 identity 유지', () => {
  it('doc2 제거 시 doc1 객체 identity 유지됨', () => {
    const doc1 = makeDoc(1)
    const doc2 = makeDoc(2)

    useAppStore.getState().appendDocs([doc1, doc2])
    const doc1RefBefore = useAppStore.getState().docs.find((d) => d.path === doc1.path)!

    useAppStore.getState().removeDoc(doc2.path)

    const docs = useAppStore.getState().docs
    expect(docs).toHaveLength(1)
    expect(docs[0]).toBe(doc1RefBefore)
  })
})

// I5: setDocs([]) 후 appendDocs 재구축 정상
describe('I5: setDocs([]) 후 appendDocs 재구축', () => {
  it('setDocs([]) 후 새 docs를 appendDocs하면 정상 반영', () => {
    const docA = makeDoc(1, 'proj-A')
    const docB = makeDoc(2, 'proj-B')

    useAppStore.getState().appendDocs([docA, docB])
    expect(useAppStore.getState().docs).toHaveLength(2)

    useAppStore.getState().setDocs([])
    expect(useAppStore.getState().docs).toHaveLength(0)
    expect(useAppStore.getState().docsByProject.size).toBe(0)

    const docC = makeDoc(3, 'proj-C')
    useAppStore.getState().appendDocs([docC])
    const docs = useAppStore.getState().docs
    expect(docs).toHaveLength(1)
    expect(docs[0].projectId).toBe('proj-C')

    // docsByProject 도 정상
    expect(useAppStore.getState().docsByProject.has('proj-C')).toBe(true)
    expect(useAppStore.getState().docsByProject.has('proj-A')).toBe(false)
  })
})

// 추가: docsByProject 구조 검증
describe('docsByProject Map 구조 검증', () => {
  it('appendDocs 후 docsByProject에 projectId별 버킷이 생성됨', () => {
    const docs = [
      makeDoc(1, 'proj-A'),
      makeDoc(2, 'proj-A'),
      makeDoc(3, 'proj-B'),
    ]

    useAppStore.getState().appendDocs(docs)

    const map = useAppStore.getState().docsByProject
    expect(map.get('proj-A')).toHaveLength(2)
    expect(map.get('proj-B')).toHaveLength(1)
  })

  it('frontmatterIndex가 증분으로 갱신됨', () => {
    const doc = {
      ...makeDoc(1, 'proj-A'),
      frontmatter: { status: 'draft', source: 'claude' },
    }

    useAppStore.getState().appendDocs([doc])

    const idx = useAppStore.getState().frontmatterIndex
    expect(idx.statuses.has('draft')).toBe(true)
    expect(idx.sources.has('claude')).toBe(true)
  })
})
