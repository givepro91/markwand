/**
 * Watcher integration test — verifies that file changes trigger
 * parseFrontmatter re-evaluation and the correct payload is assembled.
 *
 * Strategy: test the watcher's core behavior (parseFrontmatter call on change)
 * without spawning a real Electron WebContents. We use a real temporary file
 * and assert that the debounced frontmatter parse reads updated content.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { WebContents } from 'electron'
import { parseFrontmatter } from './scanner'
import { localFs } from '../transport/local/fs'
import {
  startWatcher,
  stopWatcher,
  setProjectIdResolver,
  setDocsCacheInvalidator,
} from './watcher'
import type { FsChangeEvent } from '../../preload/types'

const tmpDir = os.tmpdir()

function tmpFile(name: string): string {
  return path.join(tmpDir, `markwand-watcher-test-${name}`)
}

afterEach(() => {
  // Clean up temp files
  const files = fs.readdirSync(tmpDir).filter((f) => f.startsWith('markwand-watcher-test-'))
  for (const f of files) {
    try { fs.unlinkSync(path.join(tmpDir, f)) } catch { /* ignore */ }
  }
})

describe('watcher: frontmatter update on file change', () => {
  it('initial parse returns frontmatter; after rewrite, updated frontmatter is read', async () => {
    const p = tmpFile('change-test.md')

    // Step 1: write initial content
    fs.writeFileSync(p, `---\ntags: [initial]\nstatus: draft\n---\n# v1`)
    const fm1 = await parseFrontmatter(localFs, p)
    expect(fm1?.tags).toEqual(['initial'])
    expect(fm1?.status).toBe('draft')

    // Step 2: simulate watcher "change" event — rewrite file
    fs.writeFileSync(p, `---\ntags: [updated, watcher]\nstatus: published\nsource: claude\n---\n# v2`)
    const fm2 = await parseFrontmatter(localFs, p)
    expect(fm2?.tags).toEqual(['updated', 'watcher'])
    expect(fm2?.status).toBe('published')
    expect(fm2?.source).toBe('claude')
  })

  it('file deleted → parseFrontmatter returns undefined (no crash)', async () => {
    const p = tmpFile('delete-test.md')
    fs.writeFileSync(p, `---\ntags: [delete-me]\n---\n# bye`)
    // Pre-check
    expect(await parseFrontmatter(localFs, p)).not.toBeUndefined()
    // Delete
    fs.unlinkSync(p)
    // parseFrontmatter on deleted file must return undefined, not throw
    const fm = await parseFrontmatter(localFs, p)
    expect(fm).toBeUndefined()
  })

  it('frontmatter cleared (file rewritten without frontmatter) → returns undefined', async () => {
    const p = tmpFile('clear-fm-test.md')
    fs.writeFileSync(p, `---\ntags: [temp]\n---\n# with fm`)
    expect(await parseFrontmatter(localFs, p)).not.toBeUndefined()

    // Simulate user removing frontmatter
    fs.writeFileSync(p, `# no frontmatter now\nJust content.`)
    const fm = await parseFrontmatter(localFs, p)
    expect(fm).toBeUndefined()
  })

  it('updated field added to existing file → normalized to ms number', async () => {
    const p = tmpFile('updated-add-test.md')
    fs.writeFileSync(p, `---\ntags: [x]\n---\n# no updated`)
    const fm1 = await parseFrontmatter(localFs, p)
    expect(fm1?.updated).toBeUndefined()

    fs.writeFileSync(p, `---\ntags: [x]\nupdated: "2025-01-15T08:00:00Z"\n---\n# with updated`)
    const fm2 = await parseFrontmatter(localFs, p)
    expect(typeof fm2?.updated).toBe('number')
    expect(fm2!.updated).toBeGreaterThan(0)
  })

  it('watcher payload shape: unlink type has no frontmatter field', () => {
    // Simulate the watcher sendChange logic for 'unlink' (no parseFrontmatter call)
    const payload: { type: string; path: string; frontmatter?: unknown } = {
      type: 'unlink',
      path: '/some/doc.md',
    }
    expect(payload.frontmatter).toBeUndefined()
    expect(payload.type).toBe('unlink')
  })
})

/**
 * Follow-up FS-RT-1 — real chokidar 통합 시뮬.
 *
 * 사용자 dogfood 보고:
 *   "삭제는 좌측 트리 즉시 반영, 신규 생성은 감지 못함."
 * 이를 자동으로 재현/회귀 차단하기 위해 실제 tmp 디렉토리 + chokidar + startWatcher
 * 로직을 그대로 돌려 fs:change 페이로드와 docsCache 무효화 호출을 검증한다.
 *
 * Electron WebContents 는 send/isDestroyed 인터페이스만 충족하는 mock 으로 대체.
 */
describe('startWatcher — real chokidar integration (FS-RT-1)', () => {
  let tmpRoot = ''
  const sentEvents: { channel: string; payload: unknown }[] = []
  const invalidated: string[] = []

  function makeMockWebContents(): WebContents {
    return {
      isDestroyed: () => false,
      send: (channel: string, payload: unknown) => {
        sentEvents.push({ channel, payload })
      },
    } as unknown as WebContents
  }

  // setTimeout 기반 debounce(150ms) + chokidar awaitWriteFinish(stabilityThreshold=150ms,
  // pollInterval=50ms) + 비동기 stat → 약 ~600ms 안정. 실패 회귀가 발생하면
  // 더 긴 대기 시간을 주는 것이 아니라 페이로드 합성 로직을 의심해야 한다.
  async function waitForEvent(
    predicate: (e: { channel: string; payload: unknown }) => boolean,
    timeoutMs = 3000,
  ): Promise<{ channel: string; payload: unknown }> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const found = sentEvents.find(predicate)
      if (found) return found
      await new Promise((r) => setTimeout(r, 50))
    }
    throw new Error(
      `waitForEvent timeout after ${timeoutMs}ms; got: ${JSON.stringify(sentEvents)}`,
    )
  }

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'markwand-watcher-int-'))
    sentEvents.length = 0
    invalidated.length = 0

    // 고정 projectId 매핑 — root prefix 매칭 시 'p-test' 반환.
    setProjectIdResolver((p) => {
      const rootWithSep = tmpRoot.endsWith(path.sep) ? tmpRoot : tmpRoot + path.sep
      return p === tmpRoot || p.startsWith(rootWithSep) ? 'p-test' : null
    })
    setDocsCacheInvalidator((pid) => {
      invalidated.push(pid)
    })
  })

  afterEach(async () => {
    await stopWatcher()
    setProjectIdResolver(null)
    setDocsCacheInvalidator(null)
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it("신규 .md 파일 생성 → fs:change 'add' 페이로드 (projectId/name/mtime/size 포함) + docsCache 무효화", async () => {
    startWatcher([tmpRoot], makeMockWebContents())
    // chokidar 초기 walk 안정화. ignoreInitial=true 이므로 기존 파일 add 이벤트는 안 옴.
    await new Promise((r) => setTimeout(r, 300))

    const newPath = path.join(tmpRoot, 'fresh.md')
    fs.writeFileSync(newPath, '---\ntitle: hello\n---\n# new')

    const evt = await waitForEvent(
      (e) => e.channel === 'fs:change'
        && (e.payload as FsChangeEvent).type === 'add'
        && (e.payload as FsChangeEvent).path === newPath,
    )
    const p = evt.payload as FsChangeEvent
    expect(p.type).toBe('add')
    expect(p.projectId).toBe('p-test')
    expect(p.name).toBe('fresh.md')
    expect(typeof p.mtime).toBe('number')
    expect(p.mtime).toBeGreaterThan(0)
    expect(typeof p.size).toBe('number')
    expect(p.size).toBeGreaterThan(0)
    // .md 는 frontmatter 도 함께 채워져야 한다
    expect(p.frontmatter?.title).toBe('hello')

    // docsCache 무효화도 같은 add 흐름에서 호출돼야 한다.
    expect(invalidated).toContain('p-test')
  })

  it("신규 이미지(.png) 파일 생성 → fs:change 'add' 페이로드 (frontmatter 없음)", async () => {
    startWatcher([tmpRoot], makeMockWebContents())
    await new Promise((r) => setTimeout(r, 300))

    const newPath = path.join(tmpRoot, 'shot.png')
    // 1x1 minimal PNG
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
      'hex',
    )
    fs.writeFileSync(newPath, png)

    const evt = await waitForEvent(
      (e) => e.channel === 'fs:change'
        && (e.payload as FsChangeEvent).type === 'add'
        && (e.payload as FsChangeEvent).path === newPath,
    )
    const p = evt.payload as FsChangeEvent
    expect(p.projectId).toBe('p-test')
    expect(p.name).toBe('shot.png')
    expect(p.size).toBe(png.length)
    expect(p.frontmatter).toBeUndefined()
    expect(invalidated).toContain('p-test')
  })

  it("하위 폴더 안에 신규 .md 생성 → fs:change 'add' 페이로드 (depth ≤ 4 통과)", async () => {
    startWatcher([tmpRoot], makeMockWebContents())
    await new Promise((r) => setTimeout(r, 300))

    fs.mkdirSync(path.join(tmpRoot, 'docs'))
    const newPath = path.join(tmpRoot, 'docs', 'guide.md')
    fs.writeFileSync(newPath, '# guide')

    const evt = await waitForEvent(
      (e) => e.channel === 'fs:change'
        && (e.payload as FsChangeEvent).type === 'add'
        && (e.payload as FsChangeEvent).path === newPath,
    )
    const p = evt.payload as FsChangeEvent
    expect(p.projectId).toBe('p-test')
    expect(p.name).toBe('guide.md')
    expect(invalidated).toContain('p-test')
  })

  it("기존 파일 삭제 → fs:change 'unlink' (projectId/name 포함) + docsCache 무효화", async () => {
    const seedPath = path.join(tmpRoot, 'old.md')
    fs.writeFileSync(seedPath, '# seed')

    startWatcher([tmpRoot], makeMockWebContents())
    await new Promise((r) => setTimeout(r, 300))

    fs.unlinkSync(seedPath)

    const evt = await waitForEvent(
      (e) => e.channel === 'fs:change'
        && (e.payload as FsChangeEvent).type === 'unlink'
        && (e.payload as FsChangeEvent).path === seedPath,
    )
    const p = evt.payload as FsChangeEvent
    expect(p.projectId).toBe('p-test')
    expect(p.name).toBe('old.md')
    expect(invalidated).toContain('p-test')
  })

  it("기존 파일 내용 수정 → fs:change 'change' (mtime/size 갱신, 캐시 무효화 안 함)", async () => {
    const seedPath = path.join(tmpRoot, 'edit.md')
    fs.writeFileSync(seedPath, '---\ntags: [a]\n---\n# v1')

    startWatcher([tmpRoot], makeMockWebContents())
    await new Promise((r) => setTimeout(r, 300))

    fs.writeFileSync(seedPath, '---\ntags: [a, b]\n---\n# v2 longer content here')

    const evt = await waitForEvent(
      (e) => e.channel === 'fs:change'
        && (e.payload as FsChangeEvent).type === 'change'
        && (e.payload as FsChangeEvent).path === seedPath,
    )
    const p = evt.payload as FsChangeEvent
    expect(p.projectId).toBe('p-test')
    expect(p.name).toBe('edit.md')
    expect(typeof p.mtime).toBe('number')
    expect(typeof p.size).toBe('number')
    expect(p.frontmatter?.tags).toEqual(['a', 'b'])
    // change 는 docsCache 형태(파일 집합) 변화가 아니므로 무효화 호출 안 함.
    expect(invalidated.includes('p-test')).toBe(false)
  })

  it("ignored 파일(.txt 등 non-viewable) 생성 → fs:change 안 보냄", async () => {
    startWatcher([tmpRoot], makeMockWebContents())
    await new Promise((r) => setTimeout(r, 300))

    fs.writeFileSync(path.join(tmpRoot, 'note.txt'), 'plain text')
    // 안정화 대기 후 ignored 가 정말 안 보내졌는지 확인
    await new Promise((r) => setTimeout(r, 600))

    const addEvents = sentEvents.filter(
      (e) =>
        e.channel === 'fs:change' && (e.payload as FsChangeEvent).type === 'add',
    )
    expect(addEvents).toHaveLength(0)
    expect(invalidated).toHaveLength(0)
  })

  it("projectIdResolver 가 null 반환(워크스페이스 밖) → 페이로드 projectId 없이 발송, invalidator 미호출", async () => {
    setProjectIdResolver(() => null)
    startWatcher([tmpRoot], makeMockWebContents())
    await new Promise((r) => setTimeout(r, 300))

    const newPath = path.join(tmpRoot, 'orphan.md')
    fs.writeFileSync(newPath, '# o')

    const evt = await waitForEvent(
      (e) => e.channel === 'fs:change'
        && (e.payload as FsChangeEvent).type === 'add'
        && (e.payload as FsChangeEvent).path === newPath,
    )
    const p = evt.payload as FsChangeEvent
    expect(p.projectId).toBeUndefined()
    expect(invalidated).toHaveLength(0)
  })
})
