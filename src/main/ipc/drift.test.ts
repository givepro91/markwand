import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { findLocalBasenameTarget } from './drift'

describe('findLocalBasenameTarget', () => {
  it('finds code files that are not part of the markdown document list', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'markwand-drift-'))
    try {
      const codeDir = path.join(root, 'src', 'components')
      mkdirSync(codeDir, { recursive: true })
      writeFileSync(path.join(codeDir, 'toast-provider.tsx'), 'export function ToastProvider() {}\n')

      const found = await findLocalBasenameTarget(root, 'toast-provider.tsx')

      expect(found).toBe(path.join(codeDir, 'toast-provider.tsx'))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects unsafe glob-like basenames', async () => {
    const found = await findLocalBasenameTarget('/tmp/project', '*.tsx')
    expect(found).toBeNull()
  })
})
