/**
 * SSH 통합 테스트 — Plan §S4 R11 (MVP 6 케이스).
 * 실행:
 *   ./tests/fixtures/ssh/gen-keypair.sh
 *   docker compose -f tests/fixtures/ssh/docker-compose.yml up -d
 *   pnpm tsx scripts/test-integration-ssh.ts
 *   docker compose -f tests/fixtures/ssh/docker-compose.yml down
 *
 * 각 테스트는 독립 connect/dispose. 실패 시 exit 1.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { createSshTransport } from '../src/main/transport/ssh'

const SSH_HOST = process.env['SSH_HOST'] ?? '127.0.0.1'
const SSH_PORT = parseInt(process.env['SSH_PORT'] ?? '2222', 10)
const SSH_USER = process.env['SSH_USER'] ?? 'markwand'
const PRIV_KEY_PATH = path.resolve(
  __dirname,
  '..',
  'tests',
  'fixtures',
  'ssh',
  'keys',
  'id_ed25519',
)
const REMOTE_WS = '/config/workspace'

function green(s: string) { return `\x1b[32m${s}\x1b[0m` }
function red(s: string) { return `\x1b[31m${s}\x1b[0m` }
function gray(s: string) { return `\x1b[90m${s}\x1b[0m` }

interface TestResult {
  name: string
  ok: boolean
  detail?: string
  error?: string
}

const results: TestResult[] = []

async function runTest(name: string, fn: () => Promise<string | void>): Promise<void> {
  const start = Date.now()
  try {
    const detail = await fn()
    results.push({ name, ok: true, ...(detail && { detail }) })
    console.log(`  ${green('✓')} ${name} ${gray(`(${Date.now() - start}ms)`)}${detail ? gray(' — ' + detail) : ''}`)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    results.push({ name, ok: false, error })
    console.log(`  ${red('✗')} ${name} ${gray(`(${Date.now() - start}ms)`)} — ${error}`)
  }
}

function defaultAuth() {
  return { kind: 'key-file' as const, path: PRIV_KEY_PATH }
}

async function main() {
  if (!fs.existsSync(PRIV_KEY_PATH)) {
    console.error(red('[test-integration-ssh] keypair not found. Run gen-keypair.sh first.'))
    process.exit(1)
  }

  console.log(gray(`[test-integration-ssh] target=${SSH_USER}@${SSH_HOST}:${SSH_PORT}`))
  console.log()

  // T-conn-001: TOFU 최초 연결 + SFTP subsystem 오픈
  await runTest('T-conn-001 TOFU 최초 연결', async () => {
    const t = await createSshTransport({
      host: SSH_HOST,
      port: SSH_PORT,
      username: SSH_USER,
      auth: defaultAuth(),
      hostVerifier: async () => true,
    })
    if (t.kind !== 'ssh') throw new Error('not ssh transport')
    const algo = t.client.acceptedHostKey?.algorithm
    await t.dispose()
    return `algorithm=${algo}, id=${t.id}`
  })

  // T-sftp-readFile-001: 작은 md readFile
  await runTest('T-sftp-readFile-001 readFile small md', async () => {
    const t = await createSshTransport({
      host: SSH_HOST,
      port: SSH_PORT,
      username: SSH_USER,
      auth: defaultAuth(),
      hostVerifier: async () => true,
    })
    try {
      const buf = await t.fs.readFile(`${REMOTE_WS}/proj-a/docs/note-1.md`)
      if (!buf.toString('utf8').includes('fixture-note-1')) {
        throw new Error('marker missing')
      }
      return `${buf.byteLength} bytes`
    } finally {
      await t.dispose()
    }
  })

  // T-fs-too-large-001: FILE_TOO_LARGE 경로
  await runTest('T-fs-too-large-001 FILE_TOO_LARGE', async () => {
    const t = await createSshTransport({
      host: SSH_HOST,
      port: SSH_PORT,
      username: SSH_USER,
      auth: defaultAuth(),
      hostVerifier: async () => true,
    })
    try {
      // 88-byte 파일에 maxBytes=10 을 걸어 FILE_TOO_LARGE 유도 (size-first 가드 실증).
      let thrown: Error | null = null
      try {
        await t.fs.readFile(`${REMOTE_WS}/proj-a/docs/note-1.md`, { maxBytes: 10 })
      } catch (err) {
        thrown = err as Error
      }
      if (thrown?.message !== 'FILE_TOO_LARGE') {
        throw new Error(`expected FILE_TOO_LARGE, got: ${thrown?.message}`)
      }
      return 'size-first 가드 동작'
    } finally {
      await t.dispose()
    }
  })

  // T-scanner-001: scanDocs + detectWorkspaceMode
  await runTest('T-scanner-001 scanDocs + detectWorkspaceMode', async () => {
    const t = await createSshTransport({
      host: SSH_HOST,
      port: SSH_PORT,
      username: SSH_USER,
      auth: defaultAuth(),
      hostVerifier: async () => true,
    })
    try {
      const scanned: string[] = []
      for await (const stat of t.scanner.scanDocs(REMOTE_WS, ['**/*.md'], [])) {
        scanned.push(stat.path)
      }
      const mode = await t.scanner.detectWorkspaceMode(REMOTE_WS)
      if (scanned.length < 2) throw new Error(`expected ≥2 md, got ${scanned.length}`)
      if (mode !== 'container') throw new Error(`expected container, got ${mode}`)
      return `${scanned.length} md, mode=${mode}`
    } finally {
      await t.dispose()
    }
  })

  // T-hostkey-reject-001: hostVerifier false 반환 → 연결 차단 (DC-4 bypass 0)
  await runTest('T-hostkey-reject-001 hostVerifier false → 연결 차단 (DC-4)', async () => {
    let connected = false
    try {
      const t = await createSshTransport({
        host: SSH_HOST,
        port: SSH_PORT,
        username: SSH_USER,
        auth: defaultAuth(),
        hostVerifier: async () => false,
      })
      connected = true
      await t.dispose()
    } catch {
      // 예상 경로 — 연결 실패
    }
    if (connected) throw new Error('DC-4 위반: hostVerifier false 인데 연결 성공')
    return 'rejected 확인'
  })

  // T-watcher-manual-001: SshPoller manual 모드 smoke (실제 tick 대기 없이 handle 생성 + close)
  await runTest('T-watcher-manual-001 SshPoller manual 기본 동작', async () => {
    const t = await createSshTransport({
      host: SSH_HOST,
      port: SSH_PORT,
      username: SSH_USER,
      auth: defaultAuth(),
      hostVerifier: async () => true,
    })
    try {
      if (!t.watcher) throw new Error('watcher 미주입')
      const handle = t.watcher.watch([REMOTE_WS], {
        ignored: () => false,
        debounceMs: 100,
      } as unknown as Parameters<typeof t.watcher.watch>[1])
      await new Promise((r) => setTimeout(r, 200))
      await handle.close()
      return 'watch→close 정상'
    } finally {
      await t.dispose()
    }
  })

  const failed = results.filter((r) => !r.ok).length
  const passed = results.length - failed
  console.log()
  console.log(
    failed === 0
      ? green(`[test-integration-ssh] PASS — ${passed}/${results.length}`)
      : red(`[test-integration-ssh] FAIL — ${passed}/${results.length}`),
  )
  if (failed > 0) {
    for (const r of results.filter((x) => !x.ok)) {
      console.log(red(`  - ${r.name}: ${r.error}`))
    }
  }

  // 결과 json 기록 (CI · 감사용)
  const reportPath = path.resolve(
    __dirname,
    '..',
    'docs',
    'verifications',
    `ssh-integration-${new Date().toISOString().slice(0, 10)}.json`,
  )
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      { timestamp: new Date().toISOString(), target: `${SSH_USER}@${SSH_HOST}:${SSH_PORT}`, results },
      null,
      2,
    ) + '\n',
  )
  console.log(gray(`[test-integration-ssh] report → ${reportPath}`))

  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(red('[test-integration-ssh] FATAL'), err)
  process.exit(1)
})

// execSync unused 를 명시적으로 사용 방지
void execSync
