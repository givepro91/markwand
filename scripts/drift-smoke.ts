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
  const refs = extractReferences(content, projectRoot, docPath)
  const docMtime = docStat.mtimeMs

  const verified = await Promise.all(
    refs.map(async (ref): Promise<VerifiedReference> => {
      async function tryStat(p: string) {
        try { return { path: p, stat: await fs.promises.stat(p) } } catch { return null }
      }
      const hit = (await tryStat(ref.resolvedPath)) ?? (ref.fallbackPath ? await tryStat(ref.fallbackPath) : null)
      if (!hit) return { ...ref, status: 'missing' }
      const isDirectory = hit.stat.isDirectory()
      const status: DriftStatus = isDirectory ? 'ok' : (hit.stat.mtimeMs > docMtime ? 'stale' : 'ok')
      return { ...ref, resolvedPath: hit.path, status, targetMtime: hit.stat.mtimeMs, isDirectory }
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
    const tgt = path.join(root, 'src', 'utils.ts')
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
        '// src/utils.ts',
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

  // ── 시나리오 7: npm scope 패키지 이름은 path 로 잡지 않는다 ─────
  {
    const root = path.join(tmp, 's7')
    fs.mkdirSync(root, { recursive: true })
    const docPath = path.join(root, 'pkg.md')
    fs.writeFileSync(
      docPath,
      [
        '| 패키지 | 경로 |',
        '|--|--|',
        '| `@swk/design-system` | `packages/design-system` |',
        '| `@auth0/nextjs-auth0` | `node_modules/@auth0/nextjs-auth0` |',
        '',
      ].join('\n')
    )
    const { references } = await verifyDoc(docPath, root)
    const hasScope = references.some((r) => /^@[a-z0-9][^/]*\/[^/]+$/i.test(r.raw.replace(/`/g, '')))
    // 경로(packages/design-system) 는 추출돼도 괜찮지만 @swk/design-system 은 절대 아님.
    const scopeRawsInRefs = references
      .map((r) => r.raw.replace(/`/g, ''))
      .filter((raw) => /^@[a-z0-9][^/]*\/[^/]+$/i.test(raw))
    const pass = !hasScope && scopeRawsInRefs.length === 0
    results.push({
      name: 'npm scope `@swk/design-system` 은 추출에서 제외',
      verdict: pass ? 'PASS' : 'FAIL',
      detail: `scope-as-ref=${JSON.stringify(scopeRawsInRefs)} totalRefs=${references.length}`,
    })
  }

  // ── 시나리오 8: glob/placeholder 는 at-ref 에서도 제외 ─────
  {
    const root = path.join(tmp, 's8')
    fs.mkdirSync(root, { recursive: true })
    const docPath = path.join(root, 'globs.md')
    fs.writeFileSync(
      docPath,
      [
        '# Globs & placeholders',
        '',
        'All files under @/apps/** and @/packages/*.ts should be watched.',
        'Create it at @/apps/<app-name>/README.md.',
        '',
      ].join('\n')
    )
    const { references } = await verifyDoc(docPath, root)
    const unwanted = references.filter((r) => /[*<>]/.test(r.raw))
    const pass = unwanted.length === 0 && references.length === 0
    results.push({
      name: 'glob/placeholder (**,  *, <name>) at-ref 에서 제외',
      verdict: pass ? 'PASS' : 'FAIL',
      detail: `refs=${references.length} unwanted=${unwanted.length}`,
    })
  }

  // ── 시나리오 10: 디렉토리 참조는 stale 대신 항상 ok ─────
  // 디렉토리 mtime 은 내부 파일 추가·삭제로 항상 갱신되기 때문에 파일 stale 기준 적용 시 false positive.
  {
    const root = path.join(tmp, 's10')
    fs.mkdirSync(path.join(root, 'apps', 'landinsight'), { recursive: true })
    const docPath = path.join(root, 'doc.md')
    fs.writeFileSync(docPath, 'See @/apps/landinsight for the app.\n')
    // doc 을 과거로 고정, 디렉토리를 그 뒤에 건드려 mtime 을 doc 이후로 만든다.
    const docTime = new Date(Date.now() - 30_000)
    fs.utimesSync(docPath, docTime, docTime)
    // 디렉토리 내부에 파일을 추가해 디렉토리 mtime 을 현재로 갱신
    fs.writeFileSync(path.join(root, 'apps', 'landinsight', 'x.ts'), '//\n')

    const { references, counts } = await verifyDoc(docPath, root)
    const ref0 = references[0]
    const pass = references.length === 1 && ref0?.isDirectory === true && ref0.status === 'ok' && counts.stale === 0
    results.push({
      name: '디렉토리 참조는 stale 판정 제외 (존재=ok)',
      verdict: pass ? 'PASS' : 'FAIL',
      detail: `refs=${references.length} isDir=${ref0?.isDirectory} status=${ref0?.status} counts=${JSON.stringify(counts)}`,
    })
  }

  // ── 시나리오 11: 사용자가 제보한 실제 false-positive 6건은 전부 추출 제외 ─────
  // (절대 경로·쉘 커맨드·수식 in backtick — 사용자 swk 프로젝트 문서에서 수집한 실제 샘플)
  {
    const root = path.join(tmp, 's11')
    fs.mkdirSync(root, { recursive: true })
    const docPath = path.join(root, 'noise.md')
    fs.writeFileSync(
      docPath,
      [
        '# Noise that must NOT be extracted',
        '',
        '- Absolute path on another machine: `/Users/sue/dev/swk-GH-QA`',
        '- Shell command in backtick: `@/cd apps/lbd && pnpm vitest run`',
        '- Formula 1: `2,096,000원/m² × 0.8 × 면적 + landAppraisalTotal / rentUnits`',
        '- Formula 2: `1,894,000원/m² × 면적`',
        '- Formula 3: `2,096,000원/m² × 80% × 면적 + 세대당 토지감정평가액`',
        '- Inline command (no backtick): @/cd apps/lbd && pnpm vitest run',
        '',
      ].join('\n')
    )
    const { references } = await verifyDoc(docPath, root)
    const pass = references.length === 0
    results.push({
      name: '실제 false-positive 6종 (절대경로·쉘·수식·커맨드) 전부 추출 제외',
      verdict: pass ? 'PASS' : 'FAIL',
      detail: `refs=${references.length} raws=${JSON.stringify(references.map((r) => r.raw))}`,
    })
  }

  // ── 시나리오 12: 단일 2자 이하 세그먼트는 path 아님 ─────
  {
    const root = path.join(tmp, 's12')
    fs.mkdirSync(root, { recursive: true })
    const docPath = path.join(root, 'short.md')
    fs.writeFileSync(docPath, '- `cd` 는 커맨드\n- See @/cd\n- See @/a\n')
    const { references } = await verifyDoc(docPath, root)
    const pass = references.length === 0
    results.push({
      name: '단일 짧은 세그먼트 (@/cd, @/a, `cd`) 는 path 아님',
      verdict: pass ? 'PASS' : 'FAIL',
      detail: `refs=${references.length}`,
    })
  }

  // ── 시나리오 9: 정상 @/ ref 는 여전히 추출 ─────
  {
    const root = path.join(tmp, 's9')
    fs.mkdirSync(path.join(root, 'src', 'lib'), { recursive: true })
    const tgt = path.join(root, 'src', 'lib', 'real.ts')
    fs.writeFileSync(tgt, '//\n')
    const pastMtime = new Date(Date.now() - 60_000)
    fs.utimesSync(tgt, pastMtime, pastMtime)
    const docPath = path.join(root, 'doc.md')
    fs.writeFileSync(docPath, 'See @/src/lib/real.ts for logic.\n')
    const { references, counts } = await verifyDoc(docPath, root)
    const pass = references.length === 1 && references[0].kind === 'at' && counts.ok === 1
    results.push({
      name: '정상 @/src/... 경로는 가드 통과해 추출됨 (회귀 방지)',
      verdict: pass ? 'PASS' : 'FAIL',
      detail: `refs=${references.length} kind=${references[0]?.kind} counts=${JSON.stringify(counts)}`,
    })
  }

  // ── 시나리오 13: 단위 표현 (km/h, m/s, req/s 등) 은 path 아님 ─────
  {
    const root = path.join(tmp, 's13')
    fs.mkdirSync(root, { recursive: true })
    const docPath = path.join(root, 'units.md')
    fs.writeFileSync(docPath, '속도 `km/h`, `m/s`, 처리량 `req/s`, 비율 `N/A`\n')
    const { references } = await verifyDoc(docPath, root)
    const pass = references.length === 0
    results.push({
      name: '단위 표현 (km/h, m/s, req/s, N/A) 추출 제외',
      verdict: pass ? 'PASS' : 'FAIL',
      detail: `refs=${references.length} raws=${JSON.stringify(references.map((r) => r.raw))}`,
    })
  }

  // ── 시나리오 14: 홈 디렉토리 (~/.bashrc, ~/.config/nvim) 은 path 아님 ─────
  {
    const root = path.join(tmp, 's14')
    fs.mkdirSync(root, { recursive: true })
    const docPath = path.join(root, 'home.md')
    fs.writeFileSync(docPath, '편집: `~/.bashrc`\n설정: `~/.config/nvim/init.lua`\n')
    const { references } = await verifyDoc(docPath, root)
    const pass = references.length === 0
    results.push({
      name: '홈 디렉토리 ~/... 추출 제외',
      verdict: pass ? 'PASS' : 'FAIL',
      detail: `refs=${references.length}`,
    })
  }

  // ── 시나리오 15: 날짜/분수/비율 (숫자만 세그먼트) 은 path 아님 ─────
  {
    const root = path.join(tmp, 's15')
    fs.mkdirSync(root, { recursive: true })
    const docPath = path.join(root, 'nums.md')
    fs.writeFileSync(docPath, '날짜 `2024/11/05`, 분수 `1/2`, 점수 `10/10`\n')
    const { references } = await verifyDoc(docPath, root)
    const pass = references.length === 0
    results.push({
      name: '날짜/분수/비율 (숫자만) 추출 제외',
      verdict: pass ? 'PASS' : 'FAIL',
      detail: `refs=${references.length}`,
    })
  }

  // ── 시나리오 16: URL (http/mailto) 은 path 아님 ─────
  {
    const root = path.join(tmp, 's16')
    fs.mkdirSync(root, { recursive: true })
    const docPath = path.join(root, 'urls.md')
    fs.writeFileSync(
      docPath,
      [
        'URL 1: `https://example.com/path/to/page`',
        'URL 2: `http://localhost:3000/api/users`',
        'Email: `mailto:user@example.com`',
        '',
      ].join('\n')
    )
    const { references } = await verifyDoc(docPath, root)
    const pass = references.length === 0
    results.push({
      name: 'URL (http/mailto scheme) 추출 제외',
      verdict: pass ? 'PASS' : 'FAIL',
      detail: `refs=${references.length}`,
    })
  }

  // ── 시나리오 17: 한글 경로·텍스트 추출 제외 ─────
  // 이론적으로 한글 파일명은 macOS에서 가능하지만, 실제 개발 repo 에선 드묾.
  // 실무 false positive 우선 제거 — 한글 포함 경로 거부.
  {
    const root = path.join(tmp, 's17')
    fs.mkdirSync(root, { recursive: true })
    const docPath = path.join(root, 'ko.md')
    fs.writeFileSync(docPath, '설정/값 을 변경하세요. `사용자/홈` 참고.\n')
    const { references } = await verifyDoc(docPath, root)
    const pass = references.length === 0
    results.push({
      name: '한글 포함 경로 표기 추출 제외',
      verdict: pass ? 'PASS' : 'FAIL',
      detail: `refs=${references.length}`,
    })
  }

  // ── 시나리오 18: 정규식 /foo/gi · sed s/a/b/g 는 path 아님 ─────
  {
    const root = path.join(tmp, 's18')
    fs.mkdirSync(root, { recursive: true })
    const docPath = path.join(root, 'regex.md')
    fs.writeFileSync(docPath, '정규식: `/foo/gi`\nsed: `s/old/new/g`\n')
    const { references } = await verifyDoc(docPath, root)
    const pass = references.length === 0
    results.push({
      name: '정규식·sed 스니펫 추출 제외',
      verdict: pass ? 'PASS' : 'FAIL',
      detail: `refs=${references.length} raws=${JSON.stringify(references.map((r) => r.raw))}`,
    })
  }

  // ── 시나리오 19: 코드블록 hint — 이상 라인(주석 없음·수식) 추출 제외 ─────
  {
    const root = path.join(tmp, 's19')
    fs.mkdirSync(root, { recursive: true })
    const docPath = path.join(root, 'fence.md')
    fs.writeFileSync(
      docPath,
      [
        '```ts',
        'export const PI = 3.14',  // 주석 아님 → hint 아님
        '```',
        '',
        '```sh',
        '# chmod +x ./run.sh',      // 주석이지만 쉘 커맨드 전체 pathStr → 공백으로 PATH_CHAR_RE 거부
        '```',
        '',
        '```yaml',
        '# generated from /scripts/build.sh',  // 공백 포함 → 거부
        '```',
        '',
      ].join('\n')
    )
    const { references } = await verifyDoc(docPath, root)
    const pass = references.length === 0
    results.push({
      name: 'code-fence 첫 줄 가이드 부적합 hint 추출 제외',
      verdict: pass ? 'PASS' : 'FAIL',
      detail: `refs=${references.length} raws=${JSON.stringify(references.map((r) => r.raw))}`,
    })
  }

  // ── 시나리오 20: 단일 단어(슬래시 없음) 는 추출 안 함 — 의도된 보수 동작 ─────
  // slash 한 개도 없으면 path 표기로 보지 않음 (isPathLike false). `a.ts`, `tags.yml` 등 단일 단어는
  // drift 추출 대상 아님 — 문서 내 노이즈가 많아 false positive 가 더 큼.
  {
    const root = path.join(tmp, 's20')
    fs.mkdirSync(root, { recursive: true })
    const docPath = path.join(root, 'doc.md')
    fs.writeFileSync(docPath, 'See `a.ts` or `config.yml` single words.\n')
    const { references } = await verifyDoc(docPath, root)
    const pass = references.length === 0
    results.push({
      name: '단일 단어 (a.ts, config.yml) 는 추출 안 함 (보수적)',
      verdict: pass ? 'PASS' : 'FAIL',
      detail: `refs=${references.length}`,
    })
  }

  // ── 시나리오 21: 정상 경로 + sed/regex 혼합 문서에서 정상만 통과 ─────
  {
    const root = path.join(tmp, 's21')
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    const tgt = path.join(root, 'src', 'index.ts')
    fs.writeFileSync(tgt, '//\n')
    const pastMtime = new Date(Date.now() - 60_000)
    fs.utimesSync(tgt, pastMtime, pastMtime)
    const docPath = path.join(root, 'mix.md')
    fs.writeFileSync(
      docPath,
      [
        'Real ref: @/src/index.ts',
        'Regex: `s/old/new/g`',
        'Unit: `req/s`',
        'Date: `2024/01/02`',
        '',
      ].join('\n')
    )
    const { references } = await verifyDoc(docPath, root)
    const pass = references.length === 1 && references[0].raw === '@/src/index.ts' && references[0].status === 'ok'
    results.push({
      name: '혼합 문서: 정상 @/src/index.ts 만 통과, 노이즈 전부 거부',
      verdict: pass ? 'PASS' : 'FAIL',
      detail: `refs=${references.length} raws=${JSON.stringify(references.map((r) => r.raw))}`,
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
