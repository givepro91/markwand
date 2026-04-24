/**
 * bench-renderer-chunks.ts — Plan §S4 Performance Verification
 *
 * 목적: appendDocs O(N) 최적화(C7) 이후 2377 docs × 60 chunks 시뮬레이션에서
 *   누적 appendDocs 시간 p50/p95/p99 측정.
 *
 * store.ts는 React/Zustand 의존성으로 Node에서 직접 import 불가.
 * → store의 핵심 로직(Map 버킷 + cachedFlat)만 인라인 재현한다.
 *
 * 실행: node --expose-gc --import tsx/esm scripts/bench-renderer-chunks.ts
 * (package.json: "bench:renderer-chunks": "npx tsx --expose-gc scripts/bench-renderer-chunks.ts")
 */

import fs from 'node:fs'
import path from 'node:path'

const BASELINE_PATH = path.join(process.cwd(), 'scripts', 'bench-renderer-chunks.baseline.json')

// ──────────────────────────────────────────────
// 파라미터
// ──────────────────────────────────────────────
const TOTAL_DOCS = 2377
const TOTAL_CHUNKS = 60
const CHUNK_SIZE = Math.ceil(TOTAL_DOCS / TOTAL_CHUNKS)  // ~39.6 → 40
const WARMUP = 3
const RUNS = 10

// ──────────────────────────────────────────────
// Doc fixture 생성
// ──────────────────────────────────────────────
interface MockDoc {
  path: string
  projectId: string
  name: string
  mtime: number
  frontmatter?: { status?: string; source?: string }
}

const STATUSES = ['draft', 'published', 'archived', undefined]
const SOURCES = ['claude', 'codex', 'design', 'review', undefined]
const PROJECT_COUNT = 10

function makeDocs(total: number): MockDoc[] {
  const docs: MockDoc[] = []
  for (let i = 0; i < total; i++) {
    const pid = `proj-${i % PROJECT_COUNT}`
    const status = STATUSES[i % STATUSES.length]
    const source = SOURCES[i % SOURCES.length]
    docs.push({
      path: `/workspace/${pid}/doc-${i}.md`,
      projectId: pid,
      name: `doc-${i}.md`,
      mtime: Date.now() - i * 1000,
      frontmatter: status || source ? { status, source } : undefined,
    })
  }
  return docs
}

// ──────────────────────────────────────────────
// store 핵심 로직 인라인 재현 (Zustand/React 없이)
// ──────────────────────────────────────────────
interface StoreState {
  docs: MockDoc[]
  docsByProject: Map<string, MockDoc[]>
  frontmatterIndex: { statuses: Set<string>; sources: Set<string> }
}

function createMockStore(): StoreState & {
  appendDocs: (newDocs: MockDoc[]) => void
  setDocs: (docs: MockDoc[]) => void
} {
  let cachedFlat: MockDoc[] = []
  const state: StoreState = {
    docs: [],
    docsByProject: new Map(),
    frontmatterIndex: { statuses: new Set(), sources: new Set() },
  }

  return {
    get docs() { return state.docs },
    get docsByProject() { return state.docsByProject },
    get frontmatterIndex() { return state.frontmatterIndex },

    appendDocs(newDocs: MockDoc[]) {
      const map = state.docsByProject
      for (const doc of newDocs) {
        const bucket = map.get(doc.projectId)
        if (bucket) bucket.push(doc)
        else map.set(doc.projectId, [doc])
        if (doc.frontmatter?.status) state.frontmatterIndex.statuses.add(doc.frontmatter.status)
        if (doc.frontmatter?.source) state.frontmatterIndex.sources.add(doc.frontmatter.source)
      }
      cachedFlat = Array.from(map.values()).flat()
      state.docs = cachedFlat
      // Zustand shallow-equality 보장을 위한 Map 복사 시뮬
      state.docsByProject = new Map(map)
    },

    setDocs(docs: MockDoc[]) {
      const map = new Map<string, MockDoc[]>()
      for (const doc of docs) {
        const bucket = map.get(doc.projectId)
        if (bucket) bucket.push(doc)
        else map.set(doc.projectId, [doc])
      }
      state.frontmatterIndex.statuses.clear()
      state.frontmatterIndex.sources.clear()
      for (const bucket of map.values()) {
        for (const doc of bucket) {
          if (doc.frontmatter?.status) state.frontmatterIndex.statuses.add(doc.frontmatter.status)
          if (doc.frontmatter?.source) state.frontmatterIndex.sources.add(doc.frontmatter.source)
        }
      }
      cachedFlat = Array.from(map.values()).flat()
      state.docs = cachedFlat
      state.docsByProject = map
    },
  }
}

// ──────────────────────────────────────────────
// 단일 iteration 실행
// ──────────────────────────────────────────────
function runIteration(allDocs: MockDoc[]): { totalMs: number; chunkTimes: number[] } {
  const store = createMockStore()
  // setDocs([]) 리셋
  store.setDocs([])

  const chunkTimes: number[] = []
  const chunks: MockDoc[][] = []
  for (let i = 0; i < allDocs.length; i += CHUNK_SIZE) {
    chunks.push(allDocs.slice(i, i + CHUNK_SIZE))
  }

  const start = performance.now()
  for (const chunk of chunks) {
    const t0 = performance.now()
    store.appendDocs(chunk)
    chunkTimes.push(performance.now() - t0)
  }
  const totalMs = performance.now() - start

  return { totalMs, chunkTimes }
}

// ──────────────────────────────────────────────
// 통계 계산
// ──────────────────────────────────────────────
function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const sum = sorted.reduce((a, b) => a + b, 0)
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    mean: sum / sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  }
}

function green(s: string) { return `\x1b[32m${s}\x1b[0m` }
function yellow(s: string) { return `\x1b[33m${s}\x1b[0m` }
function gray(s: string) { return `\x1b[90m${s}\x1b[0m` }

// ──────────────────────────────────────────────
// main
// ──────────────────────────────────────────────
const allDocs = makeDocs(TOTAL_DOCS)
console.log(`\nbench:renderer-chunks — ${TOTAL_DOCS} docs / ${TOTAL_CHUNKS} chunks (~${CHUNK_SIZE} docs/chunk)`)
console.log(gray(`Warm-up ${WARMUP} × / Measure ${RUNS} ×\n`))

// warm-up
for (let i = 0; i < WARMUP; i++) {
  runIteration(allDocs)
  if (typeof global.gc === 'function') global.gc()
}

// measurement
const totalMsList: number[] = []
const allChunkTimes: number[] = []

for (let i = 0; i < RUNS; i++) {
  const { totalMs, chunkTimes } = runIteration(allDocs)
  totalMsList.push(totalMs)
  allChunkTimes.push(...chunkTimes)
  if (typeof global.gc === 'function') global.gc()
}

const totalStats = stats(totalMsList)
const chunkStats = stats(allChunkTimes)

console.log('=== Cumulative appendDocs (all chunks per iteration) ===')
console.table({
  'total ms': {
    p50: totalStats.p50.toFixed(2),
    p95: totalStats.p95.toFixed(2),
    p99: totalStats.p99.toFixed(2),
    mean: totalStats.mean.toFixed(2),
    min: totalStats.min.toFixed(2),
    max: totalStats.max.toFixed(2),
  },
})

console.log('\n=== Per-chunk appendDocs time (all chunks × all iterations) ===')
console.table({
  'chunk ms': {
    p50: chunkStats.p50.toFixed(3),
    p95: chunkStats.p95.toFixed(3),
    p99: chunkStats.p99.toFixed(3),
    mean: chunkStats.mean.toFixed(3),
    min: chunkStats.min.toFixed(3),
    max: chunkStats.max.toFixed(3),
  },
})

// baseline 비교 / 저장
interface Baseline {
  total_p50_ms: number
  total_p95_ms: number
  chunk_p95_ms: number
  measured_at: string
}

let exitCode = 0
if (fs.existsSync(BASELINE_PATH)) {
  const baseline: Baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
  const delta_p95 = (totalStats.p95 - baseline.total_p95_ms) / baseline.total_p95_ms

  console.log(`\n=== Baseline comparison (${baseline.measured_at}) ===`)
  console.log(`  total p95: ${baseline.total_p95_ms.toFixed(2)} ms → ${totalStats.p95.toFixed(2)} ms  (Δ ${(delta_p95 * 100).toFixed(1)}%)`)

  if (delta_p95 > 0.05) {
    console.log(yellow(`  WARN: total p95 regression > 5%`))
    exitCode = 1
  } else {
    console.log(green(`  OK: within 5% regression gate`))
  }
} else {
  const baseline: Baseline = {
    total_p50_ms: totalStats.p50,
    total_p95_ms: totalStats.p95,
    chunk_p95_ms: chunkStats.p95,
    measured_at: new Date().toISOString(),
  }
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2))
  console.log(green(`\nBaseline saved → ${BASELINE_PATH}`))
}

console.log('')
process.exit(exitCode)
