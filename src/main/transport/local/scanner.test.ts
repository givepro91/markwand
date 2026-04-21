import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { localScanner } from './scanner'

// LocalScannerDriver 단위 테스트 — ScannerDriver 계약 (설계서 §2.2 rev. M1).
// 초점: countDocs · scanDocs(FileStat AsyncIterable) · detectWorkspaceMode.

let tmp: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'markwand-scanner-'))
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('LocalScannerDriver.countDocs', () => {
  it('빈 디렉토리 = 0', async () => {
    const n = await localScanner.countDocs(tmp, ['**/*.md'], [])
    expect(n).toBe(0)
  })

  it('md/이미지 파일 수 카운트, ignore 패턴 존중', async () => {
    fs.writeFileSync(path.join(tmp, 'a.md'), '#')
    fs.writeFileSync(path.join(tmp, 'b.md'), '#')
    fs.writeFileSync(path.join(tmp, 'c.png'), Buffer.from([0]))
    fs.mkdirSync(path.join(tmp, 'node_modules'))
    fs.writeFileSync(path.join(tmp, 'node_modules/d.md'), '#') // 무시 대상
    const n = await localScanner.countDocs(
      tmp,
      ['**/*.md', '**/*.png'],
      ['**/node_modules/**']
    )
    expect(n).toBe(3)
  })

  it('case-insensitive 매칭 — .PNG 대문자도 포함', async () => {
    fs.writeFileSync(path.join(tmp, 'A.MD'), '#')
    fs.writeFileSync(path.join(tmp, 'b.PNG'), Buffer.from([0]))
    const n = await localScanner.countDocs(tmp, ['**/*.md', '**/*.png'], [])
    expect(n).toBe(2)
  })
})

describe('LocalScannerDriver.scanDocs', () => {
  it('FileStat 스트림 — path/size/mtimeMs/isDirectory=false', async () => {
    fs.writeFileSync(path.join(tmp, 'a.md'), 'alpha')
    fs.writeFileSync(path.join(tmp, 'b.md'), 'beta-body')
    const stats = []
    for await (const st of localScanner.scanDocs(tmp, ['**/*.md'], [])) {
      stats.push(st)
    }
    expect(stats).toHaveLength(2)
    for (const st of stats) {
      expect(path.isAbsolute(st.path)).toBe(true)
      expect(st.size).toBeGreaterThan(0)
      expect(typeof st.mtimeMs).toBe('number')
      expect(st.isDirectory).toBe(false)
      expect(st.isSymlink).toBe(false)
    }
  })

  it('ignore 패턴 — node_modules 하위 제외', async () => {
    fs.writeFileSync(path.join(tmp, 'a.md'), 'x')
    fs.mkdirSync(path.join(tmp, 'node_modules'))
    fs.writeFileSync(path.join(tmp, 'node_modules/ignored.md'), 'y')
    const stats = []
    for await (const st of localScanner.scanDocs(tmp, ['**/*.md'], ['**/node_modules/**'])) {
      stats.push(st)
    }
    expect(stats).toHaveLength(1)
    expect(stats[0].path).toMatch(/a\.md$/)
  })

  it('stat 실패 파일 — silent skip (크래시 없음)', async () => {
    // fast-glob 이 발견한 뒤 stat 직전 삭제하는 레이스는 재현 어려우므로
    // 빈 디렉토리 케이스로 "크래시 없음" 만 확인.
    const stats = []
    for await (const st of localScanner.scanDocs(tmp, ['**/*.md'], [])) {
      stats.push(st)
    }
    expect(stats).toHaveLength(0)
  })
})

describe('LocalScannerDriver.detectWorkspaceMode', () => {
  it('하위에 프로젝트 마커 존재 → container', async () => {
    const sub = path.join(tmp, 'proj-a')
    fs.mkdirSync(sub)
    fs.writeFileSync(path.join(sub, 'package.json'), '{}')
    const mode = await localScanner.detectWorkspaceMode(tmp)
    expect(mode).toBe('container')
  })

  it('하위에 마커 없음 → single', async () => {
    fs.mkdirSync(path.join(tmp, 'random-dir'))
    const mode = await localScanner.detectWorkspaceMode(tmp)
    expect(mode).toBe('single')
  })

  it('hidden/무시 디렉토리만 존재 → single', async () => {
    fs.mkdirSync(path.join(tmp, '.git'))
    fs.mkdirSync(path.join(tmp, 'node_modules'))
    const mode = await localScanner.detectWorkspaceMode(tmp)
    expect(mode).toBe('single')
  })
})
