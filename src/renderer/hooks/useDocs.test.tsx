/**
 * @vitest-environment jsdom
 *
 * 자가 검증 (CLAUDE.md "Self-QA First") — Follow-up FS-RT-1.
 *
 * 회귀 차단:
 *  1) 명시/자동 새로고침(refreshKey > 0)이면 main `project:scan-docs` 에 force=true 가 전달돼야 한다.
 *  2) watcher 가 보낸 fs:change 'add' 이벤트는 incremental 로 store 에 추가돼야 한다.
 *  3) projectId/name/mtime 누락된 'add' 는 안전 무시 (Doc 조립 불가).
 *  4) 'change' / 'unlink' 기존 동작 보존.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Doc, FsChangeEvent } from '../../preload/types'
import { useDocs } from './useDocs'
import { useAppStore } from '../state/store'

const PID = 'a1b2c3d4e5f60718'
const ROOT = '/ws/p1'

function makeDoc(name: string, overrides: Partial<Doc> = {}): Doc {
  return {
    path: `${ROOT}/${name}`,
    projectId: PID,
    name,
    mtime: 1700000000000,
    ...overrides,
  }
}

let lastScanCall: { pid: string; opts?: { force?: boolean } } | null = null
let fsChangeListener: ((data: FsChangeEvent) => void) | null = null
let scanResolver: ((docs: Doc[]) => void) | null = null
let scanResolvers: Array<(docs: Doc[]) => void> = []

beforeEach(() => {
  // store 초기화 — 이전 테스트의 docs / refreshKey 격리
  useAppStore.setState({
    refreshKey: 0,
    docs: [],
    docsByProject: new Map(),
    frontmatterIndex: { statuses: new Set(), sources: new Set() },
  })

  lastScanCall = null
  fsChangeListener = null
  scanResolver = null
  scanResolvers = []

  ;(globalThis as unknown as { window: { api: unknown } }).window = {
    api: {
      project: {
        scanDocs: vi.fn((pid: string, opts?: { force?: boolean }) => {
          lastScanCall = { pid, opts }
          return new Promise<Doc[]>((resolve) => {
            scanResolver = resolve
            scanResolvers.push(resolve)
          })
        }),
        onDocsChunk: vi.fn(() => {
          // FileTree 가 직접 chunk 를 흘려넣는 경로는 본 테스트 범위 밖.
          // useDocs 는 onDocsChunk 를 항상 호출하므로 unsubscribe 만 반환.
          return () => {}
        }),
      },
      fs: {
        onChange: vi.fn((cb: (data: FsChangeEvent) => void) => {
          fsChangeListener = cb
          return () => {
            fsChangeListener = null
          }
        }),
      },
    },
  }
})

describe('useDocs — refreshKey → force 전달', () => {
  it('첫 마운트는 force 없이 scanDocs 호출 (cache hit OK)', () => {
    renderHook(() => useDocs(PID))
    expect(lastScanCall?.pid).toBe(PID)
    expect(lastScanCall?.opts).toBeUndefined()
  })

  it('refreshKey 증가 후 재마운트는 force=true 로 scanDocs 호출', () => {
    const { rerender } = renderHook(() => useDocs(PID))
    // mount 직후 첫 scan resolve 시켜 inflight 정리 (테스트 격리)
    act(() => {
      scanResolver?.([])
    })

    act(() => {
      useAppStore.getState().bumpRefreshKey()
    })
    rerender()

    expect(lastScanCall?.opts?.force).toBe(true)
  })

  it('docs-chunk 이벤트가 없어도 최종 scan 결과를 store 에 병합한다', async () => {
    renderHook(() => useDocs(PID))
    const fresh = makeDoc('fresh.md', { mtime: 1700000009000 })

    await act(async () => {
      scanResolver?.([fresh])
      await Promise.resolve()
    })

    const docs = useAppStore.getState().docsByProject.get(PID) ?? []
    expect(docs.find((d) => d.path === fresh.path)).toMatchObject({
      name: 'fresh.md',
      mtime: 1700000009000,
    })
  })

  it('늦게 끝난 이전 스캔 결과가 최신 새로고침 결과와 로딩 상태를 덮지 않는다', async () => {
    const { rerender, result } = renderHook(() => useDocs(PID))
    const stale = makeDoc('stale.md', { mtime: 1 })
    const fresh = makeDoc('fresh.md', { mtime: 2 })

    act(() => {
      useAppStore.getState().bumpRefreshKey()
    })
    rerender()

    expect(scanResolvers).toHaveLength(2)

    await act(async () => {
      scanResolvers[1]([fresh])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.isScanning).toBe(false)
    expect((useAppStore.getState().docsByProject.get(PID) ?? []).map((d) => d.name)).toEqual([
      'fresh.md',
    ])

    await act(async () => {
      scanResolvers[0]([stale])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect((useAppStore.getState().docsByProject.get(PID) ?? []).map((d) => d.name)).toEqual([
      'fresh.md',
    ])
  })

  it('이전 스캔이 먼저 끝나도 최신 스캔이 진행 중이면 로딩 표시를 유지한다', async () => {
    const { rerender, result } = renderHook(() => useDocs(PID))

    act(() => {
      useAppStore.getState().bumpRefreshKey()
    })
    rerender()

    await act(async () => {
      scanResolvers[0]([makeDoc('stale.md')])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.isScanning).toBe(true)

    await act(async () => {
      scanResolvers[1]([makeDoc('fresh.md')])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.isScanning).toBe(false)
  })

  it("스캔 중 도착한 'add' 이벤트가 늦은 스캔 reconcile 에 의해 삭제되지 않는다", async () => {
    renderHook(() => useDocs(PID))
    const existingDoc = makeDoc('existing.md', { mtime: 5 })
    const liveDoc = makeDoc('live.md', { mtime: 10 })

    act(() => {
      fsChangeListener!({
        type: 'add',
        path: liveDoc.path,
        projectId: PID,
        name: liveDoc.name,
        mtime: liveDoc.mtime,
      })
    })

    await act(async () => {
      scanResolvers[0]([existingDoc])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect((useAppStore.getState().docsByProject.get(PID) ?? []).map((d) => d.name).sort()).toEqual([
      'existing.md',
      'live.md',
    ])
  })

  it("스캔 중 도착한 'unlink' 이벤트가 늦은 스캔 결과에 의해 되살아나지 않는다", async () => {
    const seed = makeDoc('deleted.md')
    const kept = makeDoc('kept.md')
    useAppStore.setState((state) => {
      const map = new Map(state.docsByProject)
      map.set(PID, [seed])
      return { docs: [seed], docsByProject: map }
    })

    renderHook(() => useDocs(PID))

    act(() => {
      fsChangeListener!({
        type: 'unlink',
        path: seed.path,
      })
    })

    await act(async () => {
      scanResolvers[0]([seed, kept])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect((useAppStore.getState().docsByProject.get(PID) ?? []).map((d) => d.name)).toEqual([
      'kept.md',
    ])
  })

  it("스캔 중 unknown path 'change' 이벤트가 먼저 와도 스캔 결과의 신규 파일을 버리지 않는다", async () => {
    renderHook(() => useDocs(PID))
    const newDoc = makeDoc('change-before-add.md', { mtime: 11 })

    act(() => {
      fsChangeListener!({
        type: 'change',
        path: newDoc.path,
        mtime: 12,
        size: 100,
      })
    })

    await act(async () => {
      scanResolvers[0]([newDoc])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect((useAppStore.getState().docsByProject.get(PID) ?? []).map((d) => d.name)).toEqual([
      'change-before-add.md',
    ])
  })
})

describe('useDocs — fs:change 처리', () => {
  it("'add' 이벤트는 store 에 incremental append 된다", () => {
    renderHook(() => useDocs(PID))
    expect(fsChangeListener).toBeTruthy()

    act(() => {
      fsChangeListener!({
        type: 'add',
        path: `${ROOT}/new.md`,
        projectId: PID,
        name: 'new.md',
        mtime: 1700000001000,
        size: 42,
      })
    })

    const docs = useAppStore.getState().docsByProject.get(PID) ?? []
    expect(docs.find((d) => d.path === `${ROOT}/new.md`)).toMatchObject({
      name: 'new.md',
      mtime: 1700000001000,
      size: 42,
    })
  })

  it("'add' 이벤트에 projectId 누락 시 무시 (Doc 조립 불가)", () => {
    renderHook(() => useDocs(PID))
    act(() => {
      fsChangeListener!({
        type: 'add',
        path: `${ROOT}/orphan.md`,
        // projectId 없음
        name: 'orphan.md',
        mtime: 1700000001000,
      })
    })
    const docs = useAppStore.getState().docsByProject.get(PID) ?? []
    expect(docs.find((d) => d.path === `${ROOT}/orphan.md`)).toBeUndefined()
  })

  it("'add' 이벤트에 mtime 누락 시 무시", () => {
    renderHook(() => useDocs(PID))
    act(() => {
      fsChangeListener!({
        type: 'add',
        path: `${ROOT}/no-mtime.md`,
        projectId: PID,
        name: 'no-mtime.md',
      })
    })
    const docs = useAppStore.getState().docsByProject.get(PID) ?? []
    expect(docs.find((d) => d.path === `${ROOT}/no-mtime.md`)).toBeUndefined()
  })

  it("'add' 이벤트가 viewable 확장자가 아니면 무시", () => {
    renderHook(() => useDocs(PID))
    act(() => {
      fsChangeListener!({
        type: 'add',
        path: `${ROOT}/script.ts`,
        projectId: PID,
        name: 'script.ts',
        mtime: 1700000001000,
      })
    })
    const docs = useAppStore.getState().docsByProject.get(PID) ?? []
    expect(docs.find((d) => d.path === `${ROOT}/script.ts`)).toBeUndefined()
  })

  it("'unlink' 이벤트는 기존대로 store 에서 제거", () => {
    // 미리 doc 한 개 시드
    useAppStore.setState((state) => {
      const map = new Map(state.docsByProject)
      map.set(PID, [makeDoc('old.md')])
      return { docs: [makeDoc('old.md')], docsByProject: map }
    })

    renderHook(() => useDocs(PID))
    act(() => {
      fsChangeListener!({
        type: 'unlink',
        path: `${ROOT}/old.md`,
      })
    })
    const docs = useAppStore.getState().docsByProject.get(PID) ?? []
    expect(docs.find((d) => d.path === `${ROOT}/old.md`)).toBeUndefined()
  })

  it("'change' 이벤트는 mtime/size 만 patch (path 유지, 타 doc 영향 없음)", () => {
    const seed = makeDoc('a.md', { mtime: 1, size: 100 })
    useAppStore.setState((state) => {
      const map = new Map(state.docsByProject)
      map.set(PID, [seed])
      return { docs: [seed], docsByProject: map }
    })

    renderHook(() => useDocs(PID))
    act(() => {
      fsChangeListener!({
        type: 'change',
        path: `${ROOT}/a.md`,
        size: 250,
        mtime: 1700000005000,
      })
    })
    const docs = useAppStore.getState().docsByProject.get(PID) ?? []
    const a = docs.find((d) => d.path === `${ROOT}/a.md`)!
    expect(a.size).toBe(250)
    expect(a.mtime).toBe(1700000005000)
  })
})
