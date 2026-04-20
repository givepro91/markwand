/**
 * Drift Verifier — headless smoke test
 *
 * drift:verify IPC 핸들러의 핵심 로직 (extractor → fs.stat → ok/missing/stale 판정) 을
 * Electron 외부에서 실행 검증한다. GUI E2E 는 별도(수동)이며, 이 스크립트는
 * 순수 로직 계약 검증용.
 *
 * 실행: pnpm exec tsx scripts/drift-smoke.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { extractReferences } from '../src/lib/drift/extractor'
import type { DriftStatus, VerifiedReference } from '../src/lib/drift/types'

const MAX_DRIFT_FILE_BYTES = 2 * 1024 * 1024

type Verdict = 'PASS' | 'FAIL'
interface Case {
  name: string
  verdict: Verdict
  detail: string
}

function green(s: string) { return `\x1b[32m${s}\x1b[0m` }
function red(s: string) { return `\x1b[31m${s}\x1b[0m` }
function yellow(s: string) { return `\x1b[33m${s}\x1b[0m` }

async function verifyDoc(docPath: string, projectRoot: string): Promise<{
  references: VerifiedReference[]
  counts: Record<DriftStatus, number>
  empty: boolean
}> {
  const docStat = await fs.promises.stat(docPath)
  if (docStat.size > MAX_DRIFT_FILE_BYTES) {
    return { references: [], counts: { ok: 0, missing: 0, stale: 0 }, empty: true }
  }
  const content = await fs.promises.readFile(docPath, 'utf-8')
  const refs = extractReferences(content, projectRoot)
  const docMtime = docStat.mtimeMs

  const verified = await Promise.all(
    refs.map(async (ref): Promise<VerifiedReference> => {
      try {
        const s = await fs.promises.stat(ref.resolvedPath)
        const status: DriftStatus = s.mtimeMs > docMtime ? 'stale' : 'ok'
        return { ...ref, status, targetMtime: s.mtimeMs }
      } catch {
        return { ...ref, status: 'missing' }
      }
    })
  )

  const counts: Record<DriftStatus, number> = { ok: 0, missing: 0, stale: 0 }
  for (const v of verified) counts[v.status]++
  return { references: verified, counts, empty: false }
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-smoke-'))
  console.log(`[smoke] tmp=${tmp}`)

  const results: Case[] = []

  // ── 시나리오 1: 혼합 (ok + missing + stale) ─────────────
  {
    const root = path.join(tmp, 's1')
    fs.mkdirSync(root, { recursive: true })
    // ok 대상: doc 이전 mtime
    const okPath = path.join(root, 'ok.ts')
    fs.writeFileSync(okPath, 'export const x = 1\n')
    const pastMtime = new Date(Date.now() - 60_000)
    fs.utimesSync(okPath, pastMtime, pastMtime)

    // stale 대상: 문서보다 나중 mtime (문서 먼저 쓴 뒤 대상 touch 하도록 순서 주의)
    const stalePath = path.join(root, 'stale.ts')
    fs.writeFileSync(stalePath, 'export const y = 2\n')
    // missing 대상: 아예 안 만듦
    // doc 파일 생성 — 3개 참조
    const docPath = path.join(root, 'doc.md')
    fs.writeFileSync(
      docPath,
      [
        '# Sample',
        '',
        'See @/ok.ts for the ok side.',
        'And @/stale.ts should be stale.',
        'Also @/missing.ts is gone.',
        '',
      ].join('\n')
    )
    // doc mtime을 과거로 고정하고 stale 대상을 현재로 touch → stale > doc mtime 보장
    const docTime = new Date(Date.now() - 30_000)
    fs.utimesSync(docPath, docTime, docTime)
    fs.utimesSync(stalePath, new Date(), new Date())

    const { counts, references, empty } = await verifyDoc(docPath, root)
    const expect = { ok: 1, stale: 1, missing: 1 }
    const pass =
      !empty &&
      references.length === 3 &&
      counts.ok === expect.ok &&
      counts.stale === expect.stale &&
      counts.missing === expect.missing
    results.push({
      name: 'mixed: ok + stale + missing',
      verdict: pass ? 'PASS' : 'FAIL',
      detail: `got counts=${JSON.stringify(counts)} refs=${references.length}`,
    })
  }

  // ── 시나리오 2: workspace 밖 경로는 extractor 가 받지 않는다 (경계 확인) ─────
  // drift.ts IPC 핸들러의 assertInWorkspace 는 외부에서 검증되므로 여기선 생략.
  // 대신 projectRoot-relative @/foo 가 projectRoot 하위로 resolve 되는지 확인.
  {
    const root = path.join(tmp, 's2')
    fs.mkdirSync(path.join(root, 'deep', 'nested'), { recursive: true })
    const tgt = path.join(root, 'deep', 'nested', 'file.ts')
    fs.writeFileSync(tgt, '//\n')
    const pastMtime = new Date(Date.now() - 60_000)
    fs.utimesSync(tgt, pastMtime, pastMtime)
    const docPath = path.join(root, 'doc.md')
    fs.writeFileSync(docPath, 'See @/deep/nested/file.ts\n')
    const { references, counts } = await verifyDoc(docPath, root)
    const resolved = references[0]?.resolvedPath
    const pass =
      references.length === 1 &&
      resolved === tgt &&
      counts.ok === 1
    results.push({
      name: 'resolve: @/ 가 projectRoot 기반으로 정확히 풀림',
      verdict: pass ? 'PASS' : 'FAIL',
      detail: `resolved=${resolved} counts=${JSON.stringify(counts)}`,
    })
  }

  // ── 시나리오 3: 거대 파일 (>2MB) 은 빈 리포트 ────────────
  {
    const root = path.join(tmp, 's3')
    fs.mkdirSync(root, { recursive: true })
    const docPath = path.join(root, 'big.md')
    const chunk = 'x'.repeat(1024) + '\n'
    const stream = fs.createWriteStream(docPath)
    for (let i = 0; i < 2100; i++) stream.write(chunk) // ~2.1MB
    await new Promise<void>((r) => stream.end(() => r()))
    const { empty } = await verifyDoc(docPath, root)
    results.push({
      name: 'file-too-large (>2MB) → 빈 리포트',
      verdict: empty ? 'PASS' : 'FAIL',
      detail: `empty=${empty}`,
    })
  }

  // ── 시나리오 4: 코드 블록 힌트 주석 ────────────
  {
    const root = path.join(tmp, 's4')
    fs.mkdirSync(root, { recursive: true })
    const tgt = path.join(root, 'a', 'b.ts')
    fs.mkdirSync(path.dirname(tgt), { recursive: true })
    fs.writeFileSync(tgt, 'export const z = 3\n')
    const pastMtime = new Date(Date.now() - 60_000)
    fs.utimesSync(tgt, pastMtime, pastMtime)

    const docPath = path.join(root, 'doc.md')
    fs.writeFileSync(
      docPath,
      [
        '# Hint block',
        '',
        '```ts',
        '// a/b.ts',
        'export const z: number',
        '```',
        '',
      ].join('\n')
    )
    const { references, counts } = await verifyDoc(docPath, root)
    const hint = references.find((r) => r.kind === 'hint')
    const pass = hint != null && hint.status === 'ok' && counts.ok === 1
    results.push({
      name: 'code-block hint (// path) 추출 + ok 판정',
      verdict: pass ? 'PASS' : 'FAIL',
      detail: `hint=${hint?.resolvedPath ?? 'none'} status=${hint?.status} counts=${JSON.stringify(counts)}`,
    })
  }

  // ── 시나리오 5: 인라인 백틱 경로 ────────────
  // extractor는 path separator(/, \) 가 없는 단순 단어는 path로 보지 않음 (의도된 동작).
  // 따라서 `utils/helper.ts` 같은 경로형만 추출된다.
  {
    const root = path.join(tmp, 's5')
    fs.mkdirSync(path.join(root, 'utils'), { recursive: true })
    const tgt = path.join(root, 'utils', 'helper.ts')
    fs.writeFileSync(tgt, '//\n')
    const pastMtime = new Date(Date.now() - 60_000)
    fs.utimesSync(tgt, pastMtime, pastMtime)
    const docPath = path.join(root, 'doc.md')
    fs.writeFileSync(docPath, 'Check `utils/helper.ts` for details.\n')
    const { references, counts } = await verifyDoc(docPath, root)
    const inline = references.find((r) => r.kind === 'inline')
    const pass = inline != null && inline.status === 'ok' && counts.ok === 1
    results.push({
      name: 'inline backtick path 추출 + ok 판정',
      verdict: pass ? 'PASS' : 'FAIL',
      detail: `inline=${inline?.resolvedPath ?? 'none'} status=${inline?.status}`,
    })
  }

  // ── 시나리오 6: 참조 없는 문서 → 빈 refs, 모든 카운트 0 ─────
  {
    const root = path.join(tmp, 's6')
    fs.mkdirSync(root, { recursive: true })
    const docPath = path.join(root, 'plain.md')
    fs.writeFileSync(docPath, '# No refs\n\nJust text with no paths.\n')
    const { references, counts, empty } = await verifyDoc(docPath, root)
    const pass = !empty && references.length === 0 && counts.ok === 0 && counts.missing === 0 && counts.stale === 0
    results.push({
      name: 'no-references doc → 빈 refs',
      verdict: pass ? 'PASS' : 'FAIL',
      detail: `refs=${references.length} counts=${JSON.stringify(counts)}`,
    })
  }

  // 결과 출력
  console.log('\n=== Drift Verifier Smoke Test ===')
  let passCount = 0
  for (const r of results) {
    const tag = r.verdict === 'PASS' ? green('PASS') : red('FAIL')
    console.log(`  [${tag}] ${r.name}  —  ${r.detail}`)
    if (r.verdict === 'PASS') passCount++
  }
  console.log(`\n${passCount}/${results.length} ${passCount === results.length ? green('OK') : yellow('FAIL')}\n`)

  // cleanup
  fs.rmSync(tmp, { recursive: true, force: true })

  if (passCount !== results.length) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
