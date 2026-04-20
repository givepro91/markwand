import { app, BrowserWindow, protocol, ipcMain, shell } from 'electron'
// find:in-page IPC는 v0.1에서 제거됨.
// Electron native findInPage는 매 네비게이션 ~400ms 지연 + 매치 DOM으로 포커스 탈취 문제가 있어
// renderer 측 TreeWalker + CSS Highlight API 기반 커스텀 구현으로 대체.
import { join } from 'path'
import { ensureLoginPath } from './security/path'
import { registerAppProtocol, setProtocolWorkspaceRoots } from './security/protocol'
import { registerWorkspaceHandlers } from './ipc/workspace'
import { registerFsHandlers } from './ipc/fs'
import { registerPrefsHandlers } from './ipc/prefs'
import { registerClaudeHandlers } from './ipc/claude'
import { registerComposerHandlers } from './ipc/composer'
import { getStore } from './services/store'
import { parseShellShowItemInput } from './security/validators'
import { cleanupOldContextFiles, cleanupAllContextFilesSync } from './services/context-builder'

// app:// 프로토콜을 privileged로 등록해야 한다 (보안 정책상 secure 처리)
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true } },
])

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

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 진단용: dev/디버그 모드에서 DevTools 자동 오픈 + console 캡처
  if (process.env['ELECTRON_RENDERER_URL'] || process.env['MD_VIEWER_DEBUG']) {
    win.webContents.openDevTools({ mode: 'detach' })
  }
  win.webContents.on('console-message', (_event, level, message, line, source) => {
    const lvl = ['VERBOSE', 'INFO', 'WARN', 'ERROR'][level] ?? 'LOG'
    process.stderr.write(`[renderer ${lvl}] ${message} (${source}:${line})\n`)
  })

  mainWindow = win
  win.on('closed', () => { mainWindow = null })

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
  registerComposerHandlers()
  registerShellHandlers()

  // Composer — 지난 실행 잔해 선제 삭제 (block 하지 않고 fire-and-forget)
  cleanupOldContextFiles().catch(() => {
    // ignore
  })

  // 저장된 워크스페이스 루트로 프로토콜 allowlist 초기화
  const store = await getStore()
  const workspaces = store.get('workspaces')
  const roots = workspaces.map((w) => w.root)
  setProtocolWorkspaceRoots(roots)

  await createWindow()

  // v0.1: chokidar 자동 watch는 disable.
  // ~/develop 같은 큰 워크스페이스를 watch 시작하면 메인 스레드 점유 + IPC 폭발로 UI freeze 유발.
  // 새 파일 감지는 v0.2의 명시적 새로고침 버튼 또는 좁은 watch 범위로 재도입.
  void roots
}

let mainWindow: BrowserWindow | null = null

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
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Composer 임시 파일 정리 — 앱 종료 전 동기 삭제 (AppleScript TTL unlink 타이머와 무관)
app.on('before-quit', () => {
  cleanupAllContextFilesSync()
})
