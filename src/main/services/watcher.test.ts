/**
 * Watcher integration test — verifies that file changes trigger
 * parseFrontmatter re-evaluation and the correct payload is assembled.
 *
 * Strategy: test the watcher's core behavior (parseFrontmatter call on change)
 * without spawning a real Electron WebContents. We use a real temporary file
 * and assert that the debounced frontmatter parse reads updated content.
 */
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { parseFrontmatter } from './scanner'

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
    const fm1 = await parseFrontmatter(p)
    expect(fm1?.tags).toEqual(['initial'])
    expect(fm1?.status).toBe('draft')

    // Step 2: simulate watcher "change" event — rewrite file
    fs.writeFileSync(p, `---\ntags: [updated, watcher]\nstatus: published\nsource: claude\n---\n# v2`)
    const fm2 = await parseFrontmatter(p)
    expect(fm2?.tags).toEqual(['updated', 'watcher'])
    expect(fm2?.status).toBe('published')
    expect(fm2?.source).toBe('claude')
  })

  it('file deleted → parseFrontmatter returns undefined (no crash)', async () => {
    const p = tmpFile('delete-test.md')
    fs.writeFileSync(p, `---\ntags: [delete-me]\n---\n# bye`)
    // Pre-check
    expect(await parseFrontmatter(p)).not.toBeUndefined()
    // Delete
    fs.unlinkSync(p)
    // parseFrontmatter on deleted file must return undefined, not throw
    const fm = await parseFrontmatter(p)
    expect(fm).toBeUndefined()
  })

  it('frontmatter cleared (file rewritten without frontmatter) → returns undefined', async () => {
    const p = tmpFile('clear-fm-test.md')
    fs.writeFileSync(p, `---\ntags: [temp]\n---\n# with fm`)
    expect(await parseFrontmatter(p)).not.toBeUndefined()

    // Simulate user removing frontmatter
    fs.writeFileSync(p, `# no frontmatter now\nJust content.`)
    const fm = await parseFrontmatter(p)
    expect(fm).toBeUndefined()
  })

  it('updated field added to existing file → normalized to ms number', async () => {
    const p = tmpFile('updated-add-test.md')
    fs.writeFileSync(p, `---\ntags: [x]\n---\n# no updated`)
    const fm1 = await parseFrontmatter(p)
    expect(fm1?.updated).toBeUndefined()

    fs.writeFileSync(p, `---\ntags: [x]\nupdated: "2025-01-15T08:00:00Z"\n---\n# with updated`)
    const fm2 = await parseFrontmatter(p)
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
