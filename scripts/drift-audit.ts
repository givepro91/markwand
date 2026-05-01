/**
 * Drift Verifier — 실제 워크스페이스 전수 audit
 *
 * 지정된 디렉토리 하위의 모든 .md 파일을 extractor 로 돌리고,
 * 추출된 raw 의 분포·missing 비율·의심스러운 패턴을 리포트한다.
 * 목적: smoke 커버리지 밖의 실세계 false-positive 패턴 발굴.
 *
 * 실행: pnpm exec tsx scripts/drift-audit.ts <absolute-dir>
 */
import fs from 'node:fs'
import path from 'node:path'
import { extractReferences } from '../src/lib/drift/extractor'
import type { Reference } from '../src/lib/drift/types'

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'out', 'build', '.next', '.turbo', '.cache',
  '.venv', '__pycache__', 'coverage', 'vendor', 'target', '.nuxt', '.svelte-kit',
])

async function* walkMd(dir: string): AsyncGenerator<string> {
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue
      yield* walkMd(path.join(dir, e.name))
    } else if (e.isFile() && e.name.endsWith('.md')) {
      yield path.join(dir, e.name)
    }
  }
}

function findProjectRoot(docPath: string, workspaceRoot: string): string {
  // 가까운 package.json / .git / CLAUDE.md 를 프로젝트 루트로 간주. 없으면 workspaceRoot.
  let cur = path.dirname(docPath)
  while (cur.startsWith(workspaceRoot) && cur !== workspaceRoot) {
    for (const marker of ['package.json', '.git', 'CLAUDE.md']) {
      if (fs.existsSync(path.join(cur, marker))) return cur
    }
    cur = path.dirname(cur)
  }
  return workspaceRoot
}

async function main() {
  const target = process.argv[2]
  if (!target || !path.isAbsolute(target)) {
    console.error('Usage: tsx scripts/drift-audit.ts <absolute-dir>')
    process.exit(1)
  }
  if (!fs.existsSync(target)) {
    console.error(`Not found: ${target}`)
    process.exit(1)
  }

  let docCount = 0
  let refCount = 0
  let missingCount = 0
  let okCount = 0
  let staleCount = 0
  const byKind: Record<string, number> = { at: 0, inline: 0, hint: 0 }
  const missingSamples: Array<{ doc: string; raw: string; resolved: string }> = []
  const allRaws: Array<{ doc: string; raw: string; kind: string }> = []

  for await (const docPath of walkMd(target)) {
    docCount++
    let content: string
    try {
      const stat = await fs.promises.stat(docPath)
      if (stat.size > 2 * 1024 * 1024) continue
      content = await fs.promises.readFile(docPath, 'utf-8')
    } catch {
      continue
    }

    const projectRoot = findProjectRoot(docPath, target)
    let refs: Reference[]
    try {
      refs = extractReferences(content, projectRoot, docPath)
    } catch {
      continue
    }

    const docMtime = (await fs.promises.stat(docPath)).mtimeMs
    for (const ref of refs) {
      refCount++
      byKind[ref.kind] = (byKind[ref.kind] ?? 0) + 1
      allRaws.push({ doc: path.relative(target, docPath), raw: ref.raw, kind: ref.kind })
      async function tryStat(p: string) {
        try { return { path: p, stat: await fs.promises.stat(p) } } catch { return null }
      }
      const hit = (await tryStat(ref.resolvedPath)) ?? (ref.fallbackPath ? await tryStat(ref.fallbackPath) : null)
      if (!hit) {
        if (ref.reportMissing === false) continue
        missingCount++
        if (missingSamples.length < 50) {
          missingSamples.push({
            doc: path.relative(target, docPath),
            raw: ref.raw,
            resolved: ref.fallbackPath ? `${ref.resolvedPath} | ${ref.fallbackPath}` : ref.resolvedPath,
          })
        }
      } else if (hit.stat.isDirectory() || hit.stat.mtimeMs <= docMtime) okCount++
      else staleCount++
    }
  }

  console.log('=== Drift Audit ===')
  console.log(`Target     : ${target}`)
  console.log(`Docs       : ${docCount}`)
  console.log(`References : ${refCount} (ok=${okCount}, stale=${staleCount}, missing=${missingCount})`)
  console.log(`By kind    : at=${byKind.at}, inline=${byKind.inline}, hint=${byKind.hint}`)
  console.log(`\nMissing 샘플 (최대 50):`)
  for (const s of missingSamples) {
    console.log(`  [${s.doc}] ${s.raw}`)
    console.log(`      → ${s.resolved}`)
  }

  // 의심 패턴: 공백·수식기호·숫자만 세그먼트 — 이미 거부되어야 하는데 뚫렸다면 버그.
  // hint 는 raw 가 전체 코멘트 라인이므로 `// `, `# `, `/* ` prefix 를 먼저 스트립 후 검사.
  const suspicious = allRaws.filter((r) => {
    let raw = r.raw.replace(/^`|`$/g, '').replace(/^@\//, '')
    if (r.kind === 'hint') {
      raw = raw.replace(/^\s*\/\/\s*|^\s*#\s*|^\s*\/\*\s*|\s*\*\/\s*$/g, '').trim()
    }
    return /\s/.test(raw) || /[×÷±%&|=$(){}<>"';,]/.test(raw) || /[가-힣]/.test(raw)
  })
  if (suspicious.length > 0) {
    console.log(`\n⚠ 가드를 뚫은 의심 패턴 (${suspicious.length}건):`)
    for (const s of suspicious.slice(0, 20)) {
      console.log(`  [${s.doc}] (${s.kind}) ${s.raw}`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
