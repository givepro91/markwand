import { app, BrowserWindow, protocol, ipcMain, shell } from 'electron'
// find:in-page IPC는 v0.1에서 제거됨.
// Electron native findInPage는 매 네비게이션 ~400ms 지연 + 매치 DOM으로 포커스 탈취 문제가 있어
// renderer 측 TreeWalker + CSS Highlight API 기반 커스텀 구현으로 대체.
import { join } from 'path'
import { ensureLoginPath } from './security/path'
import { registerAppProtocol, setProtocolWorkspaceRoots } from './security/protocol'
import { getLocalWorkspaceRoots } from './ipc/workspace'
import { registerWorkspaceHandlers } from './ipc/workspace'
import { registerFsHandlers } from './ipc/fs'
import { registerPrefsHandlers } from './ipc/prefs'
import { registerClaudeHandlers } from './ipc/claude'
import { registerProjectOpenerHandlers } from './ipc/projectOpeners'
import { registerComposerHandlers } from './ipc/composer'
import { registerDriftHandlers } from './ipc/drift'
import { registerAnnotationHandlers } from './ipc/annotation'
import { registerSearchHandlers } from './ipc/search'
import { registerGitHandlers } from './ipc/git'
import { registerUpdateHandlers } from './ipc/updates'
import { registerSshIpcHandlers } from './ipc/ssh'
import { setActiveWebContents as setSshActiveWebContents } from './transport/ssh/hostKeyPromptBridge'
import { getStore } from './services/store'
import { startWatcher, stopWatcher } from './services/watcher'
import { hideWindowsForFastQuit, runQuitCleanup } from './services/quitCleanup'
import { getDevRendererUrl, shouldAutoOpenDevTools } from './services/runtimeMode'
import { shouldStartStartupWatcher } from './services/startupWatchPolicy'
import { parseShellShowItemInput } from './security/validators'

// app:// 프로토콜을 privileged로 등록해야 한다 (보안 정책상 secure 처리)
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true } },
])

if (process.env.MARKWAND_USER_DATA_DIR) {
  app.setPath('userData', process.env.MARKWAND_USER_DATA_DIR)
}

// chokidar/IPC 비동기 에러가 process를 죽이지 않도록 글로벌 핸들러.
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason)
  if (msg.includes('EMFILE') || msg.includes('ENOSPC')) return
  console.error('[unhandledRejection]', msg)
})
process.on('uncaughtException', (err) => {
  if (err.message.includes('EMFILE') || err.message.includes('ENOSPC')) return
  console.error('[uncaughtException]', err.message)
})

async function createWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })

  const devRendererUrl = getDevRendererUrl(app.isPackaged, process.env)
  if (devRendererUrl) {
    win.loadURL(devRendererUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 진단용: dev/디버그 모드에서 DevTools 자동 오픈 + console 캡처
  if (shouldAutoOpenDevTools(app.isPackaged, process.env)) {
    win.webContents.openDevTools({ mode: 'detach' })
  }
  win.webContents.on('console-message', (_event, level, message, line, source) => {
    // DevTools UI 자체에서 발생한 노이즈(Autofill CDP 미구현 · VE language-mismatch 등) 는 무시.
    // source 가 `devtools://...` 인 경우는 우리 앱이 아닌 Chromium DevTools UI 내부 에러.
    if (source.startsWith('devtools://')) return
    const lvl = ['VERBOSE', 'INFO', 'WARN', 'ERROR'][level] ?? 'LOG'
    process.stderr.write(`[renderer ${lvl}] ${message} (${source}:${line})\n`)
  })

  mainWindow = win
  // M3 S2 — SSH host key prompt / transport status 이벤트 대상 webContents 주입.
  setSshActiveWebContents(win.webContents)
  win.on('closed', () => {
    mainWindow = null
    setSshActiveWebContents(null)
  })

  return win
}

async function initializeApp(): Promise<void> {
  // macOS GUI 앱 login shell PATH 주입 (Plan P1: D1)
  ensureLoginPath()

  // app:// 프로토콜 핸들러 등록
  registerAppProtocol()

  // IPC 핸들러 등록
  registerWorkspaceHandlers()
  registerFsHandlers()
  registerPrefsHandlers()
  registerClaudeHandlers()
  registerProjectOpenerHandlers()
  registerComposerHandlers()
  registerDriftHandlers()
  registerAnnotationHandlers()
  registerSearchHandlers()
  registerGitHandlers()
  registerUpdateHandlers()
  registerShellHandlers()
  registerSshIpcHandlers()

  // 저장된 워크스페이스 루트로 프로토콜 allowlist 초기화 (로컬만 — SSH 제외)
  const store = await getStore()
  const workspaces = store.get('workspaces')
  const roots = getLocalWorkspaceRoots(workspaces)
  setProtocolWorkspaceRoots(roots)

  const win = await createWindow()

  // v0.4.0-beta.10 — startup watcher는 명시 opt-in으로만 켠다.
  // 2026-04-25 회귀 fix: chokidar 초기 walk 가 libuv 스레드풀(4) 을 점거해 첫
  // workspace:scan 의 fs.access 가 4500배 느려지던 문제(swk 15k 디렉토리에서 131s 측정).
  // 사용자 로컬에서도 quit AppleEvent가 watcher 초기 crawl 뒤에 밀리는 문제가 재현되어
  // 상용 배포 기본값은 안정성 우선으로 둔다. 필요 시 MARKWAND_ENABLE_STARTUP_WATCH=1.
  if (roots.length > 0 && win && shouldStartStartupWatcher(process.env)) {
    startupWatcherTimer = setTimeout(() => {
      if (!win.isDestroyed()) startWatcher(roots, win.webContents)
    }, 5_000)
    startupWatcherTimer.unref()
  }
}

let mainWindow: BrowserWindow | null = null
let startupWatcherTimer: ReturnType<typeof setTimeout> | null = null

function registerShellHandlers(): void {
  ipcMain.handle('shell:reveal', async (_event, raw: unknown) => {
    const { path: itemPath } = parseShellShowItemInput(raw)
    shell.showItemInFolder(itemPath)
  })
}

app.whenReady().then(async () => {
  await initializeApp()

  // macOS dock 아이콘 클릭 / 알트탭 복귀 — 창이 없으면 만들고, 있으면 강제 표시·포커스.
  // 사용자가 다른 앱 보고 돌아왔을 때 창이 안 보이는 문제 fix.
  app.on('activate', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
      return
    }
    const { BrowserWindow: BW } = await import('electron')
    if (BW.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

// macOS Dock 아이콘 클릭 시 항상 창 표시 보장.
app.on('browser-window-blur', () => {
  // 백그라운드 시 IPC/타이머는 그대로. 창 표시만 신경.
})

app.on('window-all-closed', () => {
  // Markwand는 백그라운드 상주 앱이 아니므로 macOS에서도 마지막 창을 닫으면 종료한다.
  app.quit()
})

// M3 S3 — 앱 종료 시 SSH transport pool 전체 정리 (dispose 역순) + local watcher 종료.
let quitCleanupStarted = false
app.on('before-quit', (event) => {
  if (quitCleanupStarted) return
  quitCleanupStarted = true
  event.preventDefault()
  if (startupWatcherTimer) {
    clearTimeout(startupWatcherTimer)
    startupWatcherTimer = null
  }
  hideWindowsForFastQuit(BrowserWindow.getAllWindows())

  void (async () => {
    try {
      const { disposeAll } = await import('./transport/pool')
      await runQuitCleanup({ disposeAll, stopWatcher })
    } catch (err) {
      process.stderr.write(`[main] before-quit cleanup setup error: ${String(err)}\n`)
    } finally {
      app.exit(0)
    }
  })()
})
