import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { findLocalBasenameTarget, findLocalSuffixTarget } from './drift'

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

  it('does not guess when a basename exists in multiple folders', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'markwand-drift-'))
    try {
      const a = path.join(root, 'src', 'components')
      const b = path.join(root, 'src', 'legacy')
      mkdirSync(a, { recursive: true })
      mkdirSync(b, { recursive: true })
      writeFileSync(path.join(a, 'toast-provider.tsx'), 'export function ToastProvider() {}\n')
      writeFileSync(path.join(b, 'toast-provider.tsx'), 'export function LegacyToastProvider() {}\n')

      const found = await findLocalBasenameTarget(root, 'toast-provider.tsx')

      expect(found).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('findLocalSuffixTarget', () => {
  it('finds source-root shorthand paths under nested app folders', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'markwand-drift-'))
    try {
      const screenDir = path.join(root, 'web', 'src', 'screens')
      const seedDir = path.join(root, 'web', 'src', 'lib', 'seed')
      mkdirSync(screenDir, { recursive: true })
      mkdirSync(seedDir, { recursive: true })
      writeFileSync(path.join(screenDir, 'Today.tsx'), 'export function Today() {}\n')
      writeFileSync(path.join(seedDir, 'sessionDetail.ts'), 'export const SESSION_DETAIL = {}\n')

      await expect(findLocalSuffixTarget(root, 'screens/Today.tsx')).resolves.toBe(
        path.join(screenDir, 'Today.tsx')
      )
      await expect(findLocalSuffixTarget(root, 'seed/sessionDetail.ts')).resolves.toBe(
        path.join(seedDir, 'sessionDetail.ts')
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not guess when a shorthand suffix is ambiguous', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'markwand-drift-'))
    try {
      const a = path.join(root, 'apps', 'a', 'src', 'screens')
      const b = path.join(root, 'apps', 'b', 'src', 'screens')
      mkdirSync(a, { recursive: true })
      mkdirSync(b, { recursive: true })
      writeFileSync(path.join(a, 'Today.tsx'), 'export function TodayA() {}\n')
      writeFileSync(path.join(b, 'Today.tsx'), 'export function TodayB() {}\n')

      await expect(findLocalSuffixTarget(root, 'screens/Today.tsx')).resolves.toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
