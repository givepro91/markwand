#!/usr/bin/env node
// dev wrapper — pnpm dev 를 실행하면서 Chromium DevTools UI 가 stderr 로 뱉는
// 알려진 노이즈 라인을 걸러낸다. 프로덕션 DMG 빌드는 영향 받지 않는다.
//
// 노이즈 종류 (모두 Electron 33 + 내장 DevTools UI 의 알려진 무해 에러):
//   - "Unknown VE context: language-mismatch" (visual_logging.js)
//   - "Request Autofill.enable failed" / "Autofill.setAddresses failed"
//   - source 가 devtools://devtools/bundled/... 인 모든 라인
//
// 플랫폼: macOS/Linux 검증. Windows 는 Node.js 가 SIGINT 를 child 로 forward
// 하는 데 제약이 있어(libuv #4747) 종료 시그널 처리가 다를 수 있다. 현재
// 프로젝트는 macOS prerelease 만 배포하므로 비-blocking. Windows 지원 시
// `process.platform === 'win32'` 분기로 spawn 옵션 조정 필요.

import { spawn } from 'node:child_process'

const NOISE_PATTERNS = [
  /devtools:\/\/devtools\/bundled\//,
  /Unknown VE context:/,
  /Request Autofill\.(enable|setAddresses) failed/,
]

const child = spawn('pnpm', ['exec', 'electron-vite', 'dev'], {
  stdio: ['inherit', 'inherit', 'pipe'],
  env: {
    ...process.env,
    MARKWAND_DEV_WRAPPER_PID: String(process.pid),
  },
})

let buf = ''
child.stderr.on('data', (chunk) => {
  buf += chunk.toString()
  const lines = buf.split('\n')
  buf = lines.pop() ?? ''
  for (const line of lines) {
    if (NOISE_PATTERNS.some((re) => re.test(line))) continue
    process.stderr.write(line + '\n')
  }
})
child.stderr.on('end', () => {
  if (buf && !NOISE_PATTERNS.some((re) => re.test(buf))) process.stderr.write(buf)
})

const forwardSignal = (sig) => () => {
  if (!child.killed) child.kill(sig)
}
process.on('SIGINT', forwardSignal('SIGINT'))
process.on('SIGTERM', forwardSignal('SIGTERM'))

let fastQuitRequested = false
let fastQuitTimer = null
let forceKillTimer = null
process.on('SIGUSR2', () => {
  fastQuitRequested = true
  if (fastQuitTimer) return
  fastQuitTimer = setTimeout(() => {
    if (!child.killed) child.kill('SIGTERM')
    forceKillTimer = setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL')
    }, 500)
    forceKillTimer.unref?.()
  }, 500)
  fastQuitTimer.unref?.()
})

child.on('exit', (code, signal) => {
  if (fastQuitTimer) clearTimeout(fastQuitTimer)
  if (forceKillTimer) clearTimeout(forceKillTimer)
  if (fastQuitRequested) process.exit(0)
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
