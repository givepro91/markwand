import { execSync } from 'child_process'

/**
 * macOS GUI 앱은 login shell PATH를 상속하지 않는다.
 * 이 함수를 앱 시작 시 1회 호출하여 /usr/local/bin 등의 경로를 PATH에 주입한다.
 * (Plan P1: D1)
 */
export function ensureLoginPath(): void {
  if (process.platform !== 'darwin') return
  if (process.env['_PATH_INJECTED']) return

  try {
    const out = execSync("/bin/bash -lc 'echo $PATH'", { encoding: 'utf8', timeout: 3000 })
    process.env['PATH'] = out.trim()
    process.env['_PATH_INJECTED'] = '1'
  } catch {
    // fallback: 시스템 PATH 그대로 사용
  }
}
