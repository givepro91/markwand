import { vi } from 'vitest'
import type { Doc, ReadDocResult, UpdateCheckResult } from '../../preload/types'

type AnyFn = (...args: unknown[]) => unknown

/**
 * renderer 컴포넌트 테스트용 window.api surface 기본 mock.
 * 필요한 서브영역만 override 해서 사용한다.
 */
export function createApiMock(overrides: Record<string, unknown> = {}) {
  const ok = <T = undefined>(value?: T) => Promise.resolve(value as T)
  const unsubscribe = () => {}

  const api = {
    prefs: {
      get: vi.fn(() => ok()),
      set: vi.fn(() => ok()),
    },
    workspace: {
      list: vi.fn(() => ok([])),
      add: vi.fn(() => ok()),
      addSsh: vi.fn(() => ok()),
      remove: vi.fn(() => ok()),
      scan: vi.fn(() => ok([])),
      refresh: vi.fn(() => ok([])),
      setActive: vi.fn(() => ok()),
      browseFolder: vi.fn(() => ok(null)),
    },
    project: {
      scan: vi.fn(() => ok([])),
      scanDocs: vi.fn(() => ok<Doc[]>([])),
      getDocCount: vi.fn(() => ok(0)),
      gitSummary: vi.fn(() => ok({ available: false, reason: 'not-git' })),
      onDocsChunk: vi.fn(() => unsubscribe),
    },
    fs: {
      readDoc: vi.fn(() => ok<ReadDocResult>({ content: '', mtime: 0 })),
      createMarkdown: vi.fn(() => ok({ path: '/project/untitled.md', name: 'untitled.md', mtime: 1, size: 12 })),
      createFolder: vi.fn(() => ok({ path: '/project/docs', name: 'docs', mtime: 1, size: 64 })),
      rename: vi.fn(() => ok({ path: '/project/renamed.md', name: 'renamed.md', mtime: 1, size: 12 })),
      trash: vi.fn(() => ok({ path: '/project/old.md', name: 'old.md', mtime: 1, size: 12 })),
      readImage: vi.fn(() => ok({ data: '', mime: 'image/png' })),
      onChange: vi.fn(() => unsubscribe),
      onProjectChange: vi.fn(() => unsubscribe),
      onDocsChunk: vi.fn(() => unsubscribe),
    },
    drift: {
      verify: vi.fn(() => ok({ refs: [], summary: { ok: 0, stale: 0, missing: 0 } })),
    },
    ssh: {
      browseFolder: vi.fn(() => ok(null)),
      loadConfig: vi.fn(() => ok([])),
      readImage: vi.fn(() => ok({ data: '', mime: 'image/png' })),
      purgeAll: vi.fn(() => ok()),
      onHostKeyPrompt: vi.fn(() => unsubscribe),
      onTransportStatus: vi.fn(() => unsubscribe),
      verifyHostKey: vi.fn(() => ok()),
    },
    projectOpeners: {
      list: vi.fn(() => ok([{ id: 'finder', label: 'Finder', available: true }])),
      open: vi.fn(() => ok({ ok: true })),
    },
    updates: {
      check: vi.fn(() => ok<UpdateCheckResult>({
        status: 'up-to-date',
        currentVersion: '0.0.0',
        latestVersion: '0.0.0',
        checkedAt: 0,
      })),
    },
    annotation: {
      load: vi.fn(() => ok({ version: 1 as const, annotations: [] })),
      save: vi.fn(() => ok()),
    },
    shell: {
      openExternal: vi.fn(() => ok()),
      showItemInFolder: vi.fn(() => ok()),
      revealInFinder: vi.fn(() => ok()),
    },
    clipboard: {
      writeText: vi.fn(() => ok()),
    },
    search: {
      query: vi.fn(() => ok({ results: [] })),
    },
    ...overrides,
  } satisfies Record<string, Record<string, AnyFn | unknown>>

  return api
}

/**
 * window.api 를 정적으로 주입한다. 각 테스트 파일에서 beforeEach 로 호출.
 * 반환된 mock 을 재사용해 호출 인자 검증 가능.
 *
 * 주의: jsdom 환경 전용 — node 환경에서 호출하면 `window` 전역을 임시 생성한다.
 * renderer 컴포넌트 테스트(.test.tsx) 에서만 사용.
 */
export function installApiMock(overrides: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') {
    throw new Error('installApiMock: jsdom 환경에서만 사용 가능합니다. renderer *.test.tsx 파일에서 호출하세요.')
  }
  const mock = createApiMock(overrides)
  ;(globalThis as { window: { api?: unknown } }).window.api = mock
  return mock
}
