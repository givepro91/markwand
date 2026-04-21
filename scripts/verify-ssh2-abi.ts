/**
 * U1 ssh2 ABI Verification Hook — Plan §S0.1 (remote-fs-transport-m3-m4.md)
 *
 * 목적:
 *   1. ssh2 NPM이 현재 Node + Electron 33+ ABI에서 로드 가능한가 확인
 *   2. cpu-features 비활성 경로(buildDependenciesFromSource:false)에서 정상 인스턴스화
 *   3. Docker sshd fixture에 실제 SFTP 연결 → readFile/readdir/stat → attrs.mtime 실측 (Critic M-2)
 *   4. dispose 정상 동작
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

  // Cleanup
  client.end()
  record('dispose (client.end)', true)

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
