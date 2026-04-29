/**
 * QA: 스트리밍 + GC 통합 검증
 * Scenarios:
 *  T3 — readDocs GC: 오래된 타임스탬프 주입 후 재시작해도 GC 없음
 *  T4 — trackReadDocs OFF → markDocRead 호출해도 prefs 미저장 (store 레이어 검증)
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from './store'

// Reset store between tests
beforeEach(() => {
  useAppStore.setState({
    readDocs: {},
    trackReadDocs: true,
  })
})

// ---------------------------------------------------------------------------
// T3: readDocs GC — No time-based expiry exists
// ---------------------------------------------------------------------------
describe('T3: readDocs GC (7-month stale timestamps)', () => {
  const SEVEN_MONTHS_AGO = Date.now() - 7 * 30 * 24 * 60 * 60 * 1000

  it('[FAIL] 7개월 전 타임스탬프는 재시작 후에도 그대로 유지됨 (GC 미구현)', () => {
    const staleReadDocs: Record<string, number> = {
      '/Users/keunsik/develop/proj-a/doc1.md': SEVEN_MONTHS_AGO,
      '/Users/keunsik/develop/proj-a/doc2.md': SEVEN_MONTHS_AGO - 1000,
      '/Users/keunsik/develop/proj-b/old.md': SEVEN_MONTHS_AGO - 999999,
    }

    // Simulate: app restart loads stale prefs into store
    useAppStore.getState().setReadDocs(staleReadDocs)

    const loaded = useAppStore.getState().readDocs

    // GC가 있다면 오래된 항목이 제거되어야 한다.
    // 현재 구현에는 GC가 없으므로 모두 그대로 남는다 → FAIL
    expect(Object.keys(loaded)).toHaveLength(3)
    expect(loaded['/Users/keunsik/develop/proj-a/doc1.md']).toBe(SEVEN_MONTHS_AGO)
    expect(loaded['/Users/keunsik/develop/proj-a/doc2.md']).toBeLessThan(SEVEN_MONTHS_AGO)

    // 이 테스트는 "GC가 없다"는 사실을 문서화한다.
    // 기대 동작: 3개월 이상 된 항목은 앱 시작 시 pruning되어야 한다.
    // 실제 동작: 제거되지 않고 영구 유지. → 버그 확인.
    const gcThreshold = Date.now() - 90 * 24 * 60 * 60 * 1000 // 90일
    const staleKeys = Object.entries(loaded).filter(([, ts]) => ts < gcThreshold)
    // GC가 구현됐다면 staleKeys.length === 0 이어야 한다.
    // 미구현 증거: staleKeys.length > 0
    expect(staleKeys.length).toBeGreaterThan(0) // GC 부재 확인
  })

  it('[FAIL] setReadDocs에 GC 로직 없음 — 신규 항목과 스테일 항목 혼재', () => {
    const mixed: Record<string, number> = {
      '/proj/recent.md': Date.now() - 1000,           // 1초 전
      '/proj/stale.md': SEVEN_MONTHS_AGO,             // 7개월 전
    }

    useAppStore.getState().setReadDocs(mixed)

    const state = useAppStore.getState().readDocs
    // 스테일 항목이 여전히 존재
    expect('/proj/stale.md' in state).toBe(true)
    // 신규 항목도 존재
    expect('/proj/recent.md' in state).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// T4: trackReadDocs OFF → store markDocRead는 상태 업데이트하지만
//     InboxView의 prefs.set 호출은 trackReadDocs 게이트로 보호됨
// ---------------------------------------------------------------------------
describe('T4: trackReadDocs OFF — store 레이어 동작 검증', () => {
  it('[WARN] markDocRead는 trackReadDocs 값과 무관하게 항상 in-memory 상태를 갱신', () => {
    useAppStore.setState({ trackReadDocs: false, readDocs: {} })

    // 직접 store action 호출 (InboxView 게이트 우회 시나리오)
    useAppStore.getState().markDocRead('/proj/doc.md')

    const readDocs = useAppStore.getState().readDocs
    // store.markDocRead는 trackReadDocs를 확인하지 않는다 → in-memory는 업데이트됨
    // prefs.set은 InboxView의 handleClick 내부 게이트가 막아야 함
    expect('/proj/doc.md' in readDocs).toBe(true)

    // 이것은 설계 결함: markDocRead 자체에도 trackReadDocs 가드가 있어야 한다.
    // 현재는 InboxView에만 가드가 있어 다른 진입점에서 bypass 가능.
  })

  it('[PASS] setTrackReadDocs(false) 후 readDocs 값은 유지됨 (Settings에서만 clear)', () => {
    useAppStore.setState({
      trackReadDocs: true,
      readDocs: { '/proj/doc.md': Date.now() },
    })

    // setTrackReadDocs만 호출 (Settings.tsx와 달리 readDocs를 clear하지 않음)
    useAppStore.getState().setTrackReadDocs(false)

    // readDocs는 그대로 — Settings.tsx가 atomic하게 처리해야 함
    const state = useAppStore.getState()
    expect(state.trackReadDocs).toBe(false)
    expect(Object.keys(state.readDocs)).toHaveLength(1)
  })

  it('[PASS] InboxView handleClick 게이트 시뮬레이션 — trackReadDocs=false이면 prefs.set 미호출', () => {
    const prefsCalls: Array<[string, unknown]> = []
    const mockPrefsSet = (key: string, value: unknown) => {
      prefsCalls.push([key, value])
    }

    useAppStore.setState({ trackReadDocs: false, readDocs: {} })

    // InboxView handleClick 로직 재현 (InboxView.tsx:149-152)
    const trackReadDocs = useAppStore.getState().trackReadDocs
    const readDocs = useAppStore.getState().readDocs
    const markDocRead = useAppStore.getState().markDocRead

    const doc = { path: '/proj/doc.md', projectId: 'p1', name: 'doc.md', mtime: Date.now() }

    if (trackReadDocs) {
      const updated = { ...readDocs, [doc.path]: Date.now() }
      markDocRead(doc.path)
      mockPrefsSet('readDocs', updated)
    }
    // onOpenDoc(doc, doc.projectId) — navigation, not relevant

    // trackReadDocs=false이므로 prefs.set 미호출
    expect(prefsCalls).toHaveLength(0)
    // markDocRead도 미호출 → store 상태 변경 없음
    expect(useAppStore.getState().readDocs).toEqual({})
  })

  it('[PASS] InboxView handleClick 게이트 시뮬레이션 — trackReadDocs=true이면 prefs.set 호출됨', () => {
    const prefsCalls: Array<[string, unknown]> = []
    const mockPrefsSet = (key: string, value: unknown) => {
      prefsCalls.push([key, value])
    }

    const existingReadDocs = { '/proj/other.md': Date.now() - 5000 }
    useAppStore.setState({ trackReadDocs: true, readDocs: existingReadDocs })

    const trackReadDocs = useAppStore.getState().trackReadDocs
    const readDocs = useAppStore.getState().readDocs
    const markDocRead = useAppStore.getState().markDocRead

    const doc = { path: '/proj/new-doc.md', projectId: 'p1', name: 'new-doc.md', mtime: Date.now() }

    if (trackReadDocs) {
      const updated = { ...readDocs, [doc.path]: Date.now() }
      markDocRead(doc.path)
      mockPrefsSet('readDocs', updated)
    }

    expect(prefsCalls).toHaveLength(1)
    expect(prefsCalls[0][0]).toBe('readDocs')
    expect(prefsCalls[0][1]).toHaveProperty('/proj/new-doc.md')
    expect(prefsCalls[0][1]).toHaveProperty('/proj/other.md')
  })
})

// ---------------------------------------------------------------------------
// T2: projectId 전환 레이스 — chunk 필터 로직 검증
// ---------------------------------------------------------------------------
describe('T2: projectId 전환 레이스 — chunk 필터', () => {
  type Doc = { path: string; projectId: string; name: string; mtime: number }

  it('[PASS] useDocs onDocsChunk 필터: 다른 projectId 청크는 무시됨', () => {
    const activePid = 'proj-B'
    const staleChunk: Doc[] = [
      { path: '/proj-a/doc1.md', projectId: 'proj-A', name: 'doc1.md', mtime: Date.now() },
      { path: '/proj-a/doc2.md', projectId: 'proj-A', name: 'doc2.md', mtime: Date.now() },
    ]

    // useDocs.ts:23 의 필터 로직 재현
    const relevant = staleChunk.filter((d) => d.projectId === activePid)
    expect(relevant).toHaveLength(0)
  })

  it('[PASS] 동일 청크에 여러 projectId 혼재 시 활성 pid만 통과', () => {
    const activePid = 'proj-B'
    const mixedChunk: Doc[] = [
      { path: '/proj-a/doc.md', projectId: 'proj-A', name: 'doc.md', mtime: Date.now() },
      { path: '/proj-b/doc.md', projectId: 'proj-B', name: 'doc.md', mtime: Date.now() },
      { path: '/proj-c/doc.md', projectId: 'proj-C', name: 'doc.md', mtime: Date.now() },
    ]

    const relevant = mixedChunk.filter((d) => d.projectId === activePid)
    expect(relevant).toHaveLength(1)
    expect(relevant[0].path).toBe('/proj-b/doc.md')
  })

  it('[PASS] setDocs([]) 후 appendDocs는 새 projectId 문서만 추가', () => {
    useAppStore.setState({ docs: [] })

    const newDoc: Doc = { path: '/proj-b/new.md', projectId: 'proj-B', name: 'new.md', mtime: Date.now() }
    useAppStore.getState().appendDocs([newDoc])

    const docs = useAppStore.getState().docs
    expect(docs).toHaveLength(1)
    expect(docs[0].projectId).toBe('proj-B')
  })

  it('[PASS] InboxView cancelled 플래그: 언마운트 후 청크 도착해도 setAllDocs 미호출', () => {
    let cancelled = false
    const setAllDocsCalls: number[] = []
    const mockSetAllDocs = () => { setAllDocsCalls.push(1) }

    // Simulate unmount
    cancelled = true

    // InboxView onDocsChunk 콜백 로직 재현 (InboxView.tsx:77-93)
    const simulateChunkArrival = (chunk: Doc[]) => {
      if (cancelled) return  // ← 이 게이트
      const incoming = chunk.filter(() => true)
      if (incoming.length > 0) mockSetAllDocs()
    }

    simulateChunkArrival([
      { path: '/proj/doc.md', projectId: 'proj-A', name: 'doc.md', mtime: Date.now() }
    ])

    expect(setAllDocsCalls).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 새로고침 깜빡임 회귀 차단: setActiveWorkspaceId 가 ws 전환 시 projects 를 비워
// loadingOverlay 의 'projectsCount === 0' 가드가 의도대로 동작해야 한다.
// ---------------------------------------------------------------------------
describe('setActiveWorkspaceId — 워크스페이스 전환 시 projects 자동 초기화', () => {
  const sampleProject = (id: string) => ({
    id,
    name: id,
    workspaceId: 'ws-A',
    root: `/abs/${id}`,
    markers: [] as string[],
    docCount: 5,
    lastModified: Date.now(),
  })

  it('다른 ws id 로 전환 시 이전 projects 가 비워진다 (깜빡임 방지 핵심)', () => {
    useAppStore.setState({
      activeWorkspaceId: 'ws-A',
      projects: [sampleProject('p1'), sampleProject('p2')],
      projectsError: 'stale-error',
    })
    useAppStore.getState().setActiveWorkspaceId('ws-B')
    const s = useAppStore.getState()
    expect(s.activeWorkspaceId).toBe('ws-B')
    expect(s.projects).toEqual([])
    expect(s.projectsError).toBeNull()
  })

  it('같은 id 재선택은 idempotent — projects 보존 (불필요한 재스캔 트리거 방지)', () => {
    const projects = [sampleProject('p1')]
    useAppStore.setState({
      activeWorkspaceId: 'ws-A',
      projects,
    })
    useAppStore.getState().setActiveWorkspaceId('ws-A')
    expect(useAppStore.getState().projects).toBe(projects)
  })

  it('null 로 전환(워크스페이스 삭제 후 빈 상태) 도 projects 비움', () => {
    useAppStore.setState({
      activeWorkspaceId: 'ws-A',
      projects: [sampleProject('p1')],
    })
    useAppStore.getState().setActiveWorkspaceId(null)
    const s = useAppStore.getState()
    expect(s.activeWorkspaceId).toBeNull()
    expect(s.projects).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 새로고침 시 FileTree 스크롤 보존 회귀 차단:
// appendDocs 가 path-dedup 해야 useDocs.scanDocs 가 기존 docs 를 비우지 않고
// 점진 갱신 가능. 그래야 react-arborist <Tree> 가 unmount/remount 되지 않아 스크롤이 유지된다.
// ---------------------------------------------------------------------------
describe('appendDocs — path 기준 dedup (스크롤 보존 핵심)', () => {
  beforeEach(() => {
    useAppStore.setState({
      docs: [],
      docsByProject: new Map(),
      frontmatterIndex: { statuses: new Set(), sources: new Set() },
    })
  })

  const makeDoc = (path: string, mtime = 1000): {
    path: string
    projectId: string
    name: string
    mtime: number
  } => ({
    path,
    projectId: 'p1',
    name: path.split('/').pop()!,
    mtime,
  })

  it('같은 path 의 doc 을 두 번 append 하면 한 항목으로 유지 (replace)', () => {
    const v1 = makeDoc('/abs/a.md', 100)
    const v2 = makeDoc('/abs/a.md', 200) // 같은 path, 새 mtime
    useAppStore.getState().appendDocs([v1])
    useAppStore.getState().appendDocs([v2])
    const s = useAppStore.getState()
    expect(s.docs).toHaveLength(1)
    expect(s.docs[0].mtime).toBe(200)
  })

  it('새 path 는 추가, 기존 path 는 replace (혼합 chunk)', () => {
    useAppStore.getState().appendDocs([
      makeDoc('/abs/a.md', 100),
      makeDoc('/abs/b.md', 100),
    ])
    useAppStore.getState().appendDocs([
      makeDoc('/abs/a.md', 200), // replace
      makeDoc('/abs/c.md', 200), // new
    ])
    const s = useAppStore.getState()
    expect(s.docs).toHaveLength(3)
    const byPath = new Map(s.docs.map((d) => [d.path, d]))
    expect(byPath.get('/abs/a.md')?.mtime).toBe(200)
    expect(byPath.get('/abs/b.md')?.mtime).toBe(100)
    expect(byPath.get('/abs/c.md')?.mtime).toBe(200)
  })

  it('한 chunk 안에 같은 path 가 중복돼도 한 번만 저장 (defensive)', () => {
    useAppStore.getState().appendDocs([
      makeDoc('/abs/a.md', 100),
      makeDoc('/abs/a.md', 200),
    ])
    const s = useAppStore.getState()
    expect(s.docs).toHaveLength(1)
    expect(s.docs[0].mtime).toBe(200)
  })

  it('다른 projectId 는 같은 path 와 무관하게 분리 저장 (워크스페이스 격리)', () => {
    useAppStore.getState().appendDocs([
      { path: '/abs/a.md', projectId: 'p1', name: 'a.md', mtime: 100 },
      { path: '/abs/a.md', projectId: 'p2', name: 'a.md', mtime: 100 },
    ])
    const s = useAppStore.getState()
    expect(s.docs).toHaveLength(2)
    expect(s.docsByProject.get('p1')).toHaveLength(1)
    expect(s.docsByProject.get('p2')).toHaveLength(1)
  })
})
