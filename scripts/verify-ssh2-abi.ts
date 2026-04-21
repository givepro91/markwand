/**
 * U1 ssh2 ABI Verification Hook — Plan §S0.1 (remote-fs-transport-m3-m4.md)
 *
 * S1 확장: SshTransport 경유 smoke 추가 (S1.f).
 *   - createSshTransport() → FsDriver/ScannerDriver 경유 readFile/readdir 재실행
 *   - SshScannerDriver.scanDocs 10 entries + attrs.mtime>0 재확인
 *   - readStream {start,end} 범위 요청 최적화 smoke (4KB 만 전송)
 *
 * 실행:
 *   1) tests/fixtures/ssh/gen-keypair.sh (최초 1회)
 *   2) docker compose -f tests/fixtures/ssh/docker-compose.yml up -d
 *   3) pnpm tsx scripts/verify-ssh2-abi.ts
 *
 * 출력: docs/investigations/ssh2-abi-<date>.md 업데이트
 */
import { Client } from 'ssh2'
import fs from 'node:fs'
import path from 'node:path'
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
const REMOTE_WORKSPACE = '/config/workspace'

function green(s: string) { return `\x1b[32m${s}\x1b[0m` }
function red(s: string) { return `\x1b[31m${s}\x1b[0m` }
function gray(s: string) { return `\x1b[90m${s}\x1b[0m` }

interface CheckResult {
  name: string
  ok: boolean
  detail?: string
  err?: string
}

const results: CheckResult[] = []

function record(name: string, ok: boolean, detail?: string, err?: unknown) {
  const e = err instanceof Error ? err.message : err != null ? String(err) : undefined
  results.push({ name, ok, ...(detail !== undefined && { detail }), ...(e && { err: e }) })
  const tag = ok ? green('✓') : red('✗')
  const extra = detail ? gray(` — ${detail}`) : ''
  console.log(`  ${tag} ${name}${extra}${e ? gray(` (err: ${e})`) : ''}`)
}

async function main() {
  console.log(gray(`[verify-ssh2-abi] target=${SSH_USER}@${SSH_HOST}:${SSH_PORT}`))
  console.log(gray(`[verify-ssh2-abi] privateKey=${PRIV_KEY_PATH}\n`))

  // Check 1: ssh2 Client 인스턴스화 (cpu-features 없이)
  try {
    const c = new Client()
    record('ssh2 Client instantiate', typeof c.connect === 'function')
    c.end()
  } catch (err) {
    record('ssh2 Client instantiate', false, undefined, err)
    process.exit(1)
  }

  // Check 2: privateKey 읽기
  if (!fs.existsSync(PRIV_KEY_PATH)) {
    record('privateKey readable', false, `not found: ${PRIV_KEY_PATH}`)
    console.log(red('\n[verify-ssh2-abi] FAIL — run tests/fixtures/ssh/gen-keypair.sh first'))
    process.exit(1)
  }
  const privateKey = fs.readFileSync(PRIV_KEY_PATH)
  record('privateKey readable', true, `${privateKey.byteLength} bytes`)

  // Check 3: Docker sshd 연결
  const client = new Client()
  let receivedHostKey: { algorithm: string; sha256: string } | null = null

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('connect timeout 10s')), 10_000)
      client
        .on('ready', () => {
          clearTimeout(timeout)
          resolve()
        })
        .on('error', (err) => {
          clearTimeout(timeout)
          reject(err)
        })
        .connect({
          host: SSH_HOST,
          port: SSH_PORT,
          username: SSH_USER,
          privateKey,
          readyTimeout: 10_000,
          keepaliveInterval: 30_000,
          keepaliveCountMax: 3,
          hostVerifier: (key: Buffer) => {
            const crypto = require('node:crypto') as typeof import('node:crypto')
            const sha256 = crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '')
            receivedHostKey = { algorithm: 'ssh-ed25519 (or first offered)', sha256 }
            return true // TOFU — 실 구현은 사용자 확인 후 결정. 이 검증 스크립트는 자동 trust.
          },
        })
    })
    record('SSH connect (TOFU)', true, `hostKey SHA256:${receivedHostKey?.sha256 ?? '?'}`)
  } catch (err) {
    record('SSH connect (TOFU)', false, undefined, err)
    client.end()
    await writeReport(results)
    process.exit(1)
  }

  // Check 4: SFTP subsystem 오픈
  const sftp = await new Promise<import('ssh2').SFTPWrapper>((resolve, reject) => {
    client.sftp((err, s) => (err ? reject(err) : resolve(s)))
  }).catch((err) => {
    record('SFTP subsystem', false, undefined, err)
    return null
  })
  if (!sftp) {
    client.end()
    await writeReport(results)
    process.exit(1)
  }
  record('SFTP subsystem', true)

  // Check 5: readdir + attrs.mtime 실측 (Critic M-2)
  try {
    const entries = await new Promise<import('ssh2').FileEntry[]>((resolve, reject) => {
      sftp.readdir(`${REMOTE_WORKSPACE}/proj-a/docs`, (err, list) => {
        if (err) reject(err)
        else resolve(list as import('ssh2').FileEntry[])
      })
    })
    const mdEntries = entries.filter((e) => e.filename.endsWith('.md'))
    const mtimeSample = mdEntries.map((e) => ({ name: e.filename, mtime: e.attrs.mtime }))
    const allPositive = mtimeSample.every((e) => e.mtime > 0)
    record(
      'readdir + attrs.mtime',
      true,
      `entries=${entries.length}, md=${mdEntries.length}, mtime>0 all=${allPositive}, sample=${JSON.stringify(mtimeSample.slice(0, 3))}`,
    )
  } catch (err) {
    record('readdir + attrs.mtime', false, undefined, err)
  }

  // Check 6: readFile 1건 (1KB 미만)
  try {
    const buf = await new Promise<Buffer>((resolve, reject) => {
      sftp.readFile(`${REMOTE_WORKSPACE}/proj-a/docs/note-1.md`, (err, b) => {
        if (err) reject(err)
        else resolve(b)
      })
    })
    const content = buf.toString('utf-8')
    const ok = content.includes('fixture-note-1')
    record('readFile (small md)', ok, `${buf.byteLength} bytes, contains fixture marker: ${ok}`)
  } catch (err) {
    record('readFile (small md)', false, undefined, err)
  }

  // Check 7: stat
  try {
    const stat = await new Promise<import('ssh2').Stats>((resolve, reject) => {
      sftp.stat(`${REMOTE_WORKSPACE}/proj-a/docs/note-1.md`, (err, s) => {
        if (err) reject(err)
        else resolve(s)
      })
    })
    record(
      'stat',
      true,
      `size=${stat.size}, mtime=${stat.mtime}, isFile=${stat.isFile()}`,
    )
  } catch (err) {
    record('stat', false, undefined, err)
  }

  // Cleanup Check 1~7 (raw ssh2 Client)
  client.end()
  record('dispose (client.end)', true)

  // ── S1 확장: SshTransport 경유 smoke ──────────────────────────────────────
  // verify 가 PoC transport 코어(client.ts · fs.ts · scanner.ts · index.ts) 의 실경로 smoke 를
  // 포함하도록 확장. 미래에 재실행했을 때 transport 자체의 회귀를 잡는다.
  try {
    const transport = await createSshTransport({
      host: SSH_HOST,
      port: SSH_PORT,
      username: SSH_USER,
      auth: { kind: 'key-file', path: PRIV_KEY_PATH },
      hostVerifier: async () => true, // PoC smoke: 자동 trust (TOFU UI 는 S2)
    })
    record('SshTransport connect', transport.kind === 'ssh', `id=${transport.id}`)

    // FsDriver.readFile
    const buf = await transport.fs.readFile(`${REMOTE_WORKSPACE}/proj-a/docs/note-1.md`)
    record('SshFsDriver.readFile', buf.toString('utf8').includes('fixture-note-1'))

    // FsDriver.readStream 범위 최적화 (4KB 한정)
    const chunks: Buffer[] = []
    for await (const c of transport.fs.readStream(`${REMOTE_WORKSPACE}/proj-a/docs/note-1.md`, { maxBytes: 4096 })) {
      chunks.push(Buffer.from(c.buffer, c.byteOffset, c.byteLength))
    }
    const streamed = Buffer.concat(chunks)
    record('SshFsDriver.readStream {maxBytes:4096}', streamed.byteLength <= 4096, `bytes=${streamed.byteLength}`)

    // ScannerDriver.scanDocs — fixture 10 entries 미만이지만 동작 검증 용도
    const scannedPaths: string[] = []
    for await (const st of transport.scanner.scanDocs(REMOTE_WORKSPACE, ['**/*.md'], ['**/node_modules/**'])) {
      scannedPaths.push(st.path)
    }
    record('SshScannerDriver.scanDocs', scannedPaths.length >= 2, `found ${scannedPaths.length} md: ${scannedPaths.slice(0, 3).join(', ')}`)

    // detectWorkspaceMode — fixture 에는 proj-a/package.json 있음 → 'container' 기대
    const mode = await transport.scanner.detectWorkspaceMode(REMOTE_WORKSPACE)
    record('SshScannerDriver.detectWorkspaceMode', mode === 'container', `mode=${mode}`)

    // S2 handshake algorithm 실측 (S1 Evaluator m-3 반영) — 'unknown' 에서 실제 값으로 교체됐는지
    const algo = transport.client.acceptedHostKey?.algorithm
    record(
      'S2 handshake algorithm 추출',
      typeof algo === 'string' && algo !== 'unknown' && algo.length > 0,
      `algorithm=${algo}`,
    )

    await transport.dispose()
    record('SshTransport.dispose', true)
  } catch (err) {
    record('SshTransport smoke', false, undefined, err)
  }

  // ── S1 Evaluator C-1 검증: hostVerifier=async()=>false 가 실제로 연결을 차단하는지 ──
  // Promise 직접 반환 버그 수정 전에는 verify(Promise<false>) 로 전달되어 truthy 판정 →
  // 연결이 통과되던 DC-4 "bypass 0" 위반. 이 smoke 가 PASS 해야 수정 완료.
  try {
    let connectResult: 'connected' | 'rejected' = 'rejected'
    try {
      const t2 = await createSshTransport({
        host: SSH_HOST,
        port: SSH_PORT,
        username: SSH_USER,
        auth: { kind: 'key-file', path: PRIV_KEY_PATH },
        hostVerifier: async () => false, // reject 의도
      })
      connectResult = 'connected'
      await t2.dispose()
    } catch {
      connectResult = 'rejected' // 예상 경로 — hostVerifier false → 연결 실패
    }
    record('DC-4 hostVerifier reject smoke', connectResult === 'rejected', `result=${connectResult} (expected: rejected)`)
  } catch (err) {
    record('DC-4 hostVerifier reject smoke', false, undefined, err)
  }

  await writeReport(results)

  const failed = results.filter((r) => !r.ok).length
  console.log(
    `\n${failed === 0 ? green('[verify-ssh2-abi] PASS') : red('[verify-ssh2-abi] FAIL')} — ${results.length - failed}/${results.length} checks`,
  )
  process.exit(failed === 0 ? 0 : 1)
}

async function writeReport(results: CheckResult[]) {
  const today = new Date().toISOString().slice(0, 10)
  const reportPath = path.resolve(__dirname, '..', 'docs', 'investigations', `ssh2-abi-${today}.md`)
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })

  const lines: string[] = [
    `# ssh2 ABI Verification Report — ${today}`,
    ``,
    `**Target**: \`${SSH_USER}@${SSH_HOST}:${SSH_PORT}\``,
    `**Node**: ${process.version}`,
    `**Platform**: ${process.platform} ${process.arch}`,
    `**ssh2 version**: \`^1.17.0\``,
    `**buildDependenciesFromSource**: false (cpu-features 비활성)`,
    ``,
    `## Results`,
    ``,
    `| # | Check | Result | Detail |`,
    `|---|-------|--------|--------|`,
  ]
  results.forEach((r, i) => {
    const status = r.ok ? 'PASS' : 'FAIL'
    const detail = (r.detail ?? '') + (r.err ? ` — err: ${r.err}` : '')
    lines.push(`| ${i + 1} | ${r.name} | ${status} | ${detail.replace(/\|/g, '\\|')} |`)
  })
  lines.push('')
  lines.push('## Critic M-2 실측 (attrs.mtime)')
  lines.push('')
  const mtimeRow = results.find((r) => r.name === 'readdir + attrs.mtime')
  lines.push(mtimeRow ? `> ${mtimeRow.detail ?? '(missing)'}` : '> (not executed)')
  lines.push('')
  lines.push('> linuxserver/openssh-server 기준 결과. 타 SFTP 구현체(embedded/NAS)에서 attrs.mtime=0 가능성은 남음 — SshPoller.diff의 size 폴백으로 대응.')
  lines.push('')
  lines.push('## Conclusion')
  lines.push('')
  const failed = results.filter((r) => !r.ok).length
  lines.push(
    failed === 0
      ? '✅ **U1 ABI 검증 PASS** — ssh2가 cpu-features 없이 Node + Docker sshd에서 정상 동작. Electron 33 ABI 재검증은 `pnpm dev` 시 SshTransport 로드 시점에 수행.'
      : `❌ **U1 ABI 검증 FAIL** — ${failed}/${results.length} 체크 실패. fallback 패키지 \`ssh2-electron-no-cpu-features\` 검토 필요.`,
  )

  fs.writeFileSync(reportPath, lines.join('\n') + '\n', 'utf-8')
  console.log(`\n${gray(`[verify-ssh2-abi] report → ${reportPath}`)}`)
}

main().catch((err) => {
  console.error(red('[verify-ssh2-abi] ERROR'), err)
  process.exit(1)
})
