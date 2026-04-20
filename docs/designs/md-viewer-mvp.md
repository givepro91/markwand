---
slug: md-viewer-mvp-design
sprint: S1~S5
created: 2026-04-20
status: draft
plan_ref: docs/plans/md-viewer-mvp.md
---

# md-viewer MVP v0.1 — CPS 설계서

## 1. Overview

md-viewer는 macOS에서 여러 프로젝트(`~/develop/*`)에 산재한 AI 산출물(기획·설계·CLAUDE.md 등)을
단일 Electron 앱으로 발견·소비·재진입하는 **읽기 전용 큐레이터**다.
MVP v0.1은 Workspace > Project > Doc 계층 구조, 3가지 뷰 모드(All Projects / Inbox / Project View),
Claude CLI 재진입 버튼, GFM+mermaid+다크모드 뷰어, 영속화 5개 기능만 구현한다.
코드사이닝·검색·편집·Windows 빌드는 v0.2 이후로 명시적 보류한다.

---

## 2. Architecture

### 프로세스 모델

| 프로세스 | 역할 | 비고 |
|---------|------|------|
| **main** | BrowserWindow 생성, IPC 핸들러 등록, FS 접근, electron-store, chokidar, Claude CLI 호출 | Node.js 전체 권한 |
| **preload** | contextBridge로 `window.api` 노출. IPC 채널 호출 래퍼만 포함. ipcRenderer 직접 노출 금지 | sandbox:true, contextIsolation:true |
| **renderer** | React 19 SPA. `window.api` 를 통해서만 main과 통신. DOM/CSS 전담 | nodeIntegration:false, webSecurity:true |

### 모듈 구조 (절대 경로 기준: /Users/jay/develop/md-viewer)

```
src/
  main/
    index.ts                  ← BrowserWindow 생성 + protocol 등록 + ipcMain 핸들러 초기화
    ipc/
      fs.ts                   ← fs:read-doc, fs:change(push)
      workspace.ts            ← workspace:list/add/remove/scan, project:scan-docs
      claude.ts               ← claude:check, claude:open
    services/
      scanner.ts              ← scanProjects(마커 8종, depth 2) + scanDocs(fast-glob, 청크)
      watcher.ts              ← chokidar.watch wrapper (debounce 150ms, .md 필터)
      store.ts                ← electron-store 동적 import 패턴 (ESM 호환)
      claude-launcher.ts      ← ensureLoginPath + openInClaude (osascript + execa)
    security/
      validators.ts           ← zod schemas + assertInWorkspace
      protocol.ts             ← custom app:// handler (3단 검증)
      path.ts                 ← ensureLoginPath (login shell PATH 주입)
  preload/
    index.ts                  ← contextBridge.exposeInMainWorld('api', { ...allChannels })
    types.ts                  ← IPC 채널 입출력 타입 (main/renderer 공유)
  renderer/
    main.tsx                  ← ReactDOM.createRoot + App mount
    App.tsx                   ← Router(메모리) + Sidebar + 뷰 전환
    views/
      AllProjectsView.tsx
      InboxView.tsx
      ProjectView.tsx
    components/
      Sidebar.tsx             ← WorkspacePicker + 뷰 모드 스위처
      FileTree.tsx            ← react-arborist 래퍼 (treeExpanded 복원)
      MarkdownViewer.tsx      ← react-markdown v10 파이프라인
      ProjectCard.tsx         ← All Projects 카드 단위
      InboxItem.tsx           ← Inbox 항목 단위
      ThemeToggle.tsx         ← light/dark/system 선택
      WorkspacePicker.tsx     ← 워크스페이스 드롭다운
      ClaudeButton.tsx        ← "Open in Claude" + 미설치 모달
    hooks/
      useWorkspace.ts         ← workspace 목록·등록·제거
      useDocs.ts              ← project docs 스캔·스트림 수신
      useTheme.ts             ← nativeTheme 동기 + html[data-theme] 설정
      useViewMode.ts          ← 뷰 모드 전환 + electron-store 영속
    state/
      store.ts                ← zustand (workspaces, projects, docs, viewMode, sortOrder)
    lib/
      markdown.ts             ← react-markdown 플러그인 조합 (remark-gfm/breaks + rehype-sanitize + shiki)
      mermaid.ts              ← mermaid v11 lazy init + IntersectionObserver 트리거
    styles/
      globals.css             ← reset + base
      themes.css              ← CSS 변수 토큰 (light/dark)
```

### 데이터 흐름

```
사용자 액션
  │
  ▼
[renderer] React 컴포넌트 이벤트 핸들러
  │  window.api.invoke(채널, 입력)
  ▼
[preload] contextBridge 래퍼
  │  ipcRenderer.invoke(채널, 입력)
  ▼
[main] ipcMain.handle(채널)
  │  1. zod schema 검증
  │  2. assertInWorkspace (path allowlist)
  │  3. service 호출 (scanner / watcher / store / claude-launcher)
  ▼
[main service] FS 접근 또는 electron-store 읽기/쓰기
  │  결과 반환 or 스트림 push
  ▼
[main] ipcMain → ipcRenderer (invoke 응답 or webContents.send)
  │
  ▼
[renderer] zustand store 업데이트 → React 리렌더
  │
  ▼
[renderer] MarkdownViewer / FileTree / 카드 표시
```

---

## 3. IPC 계약 (전체 채널)

> zod 스키마는 `src/main/security/validators.ts`에 집중 정의. 각 IPC 핸들러는 import 후 사용.

| 채널 | 방향 | 입력 zod (1줄) | 출력 타입 | 비고 |
|------|------|----------------|-----------|------|
| `workspace:list` | invoke | `z.void()` | `Workspace[]` | electron-store 직접 반환 |
| `workspace:add` | invoke | `z.object({ root: z.string().max(512) })` | `Workspace` | dialog.showOpenDialog 후 등록, id=nanoid() |
| `workspace:remove` | invoke | `z.object({ id: z.string().uuid() })` | `void` | store에서 제거, watcher 해제 |
| `workspace:scan` | invoke | `z.object({ workspaceId: z.string().uuid() })` | `Project[]` | 마커 8종 검사, depth=2, assertInWorkspace 적용 |
| `project:scan-docs` | invoke + stream | `z.object({ projectId: z.string().uuid() })` | `Doc[]` (청크) | fast-glob, 50개씩 webContents.send('project:docs-chunk') |
| `fs:read-doc` | invoke | `z.object({ path: z.string().max(512) })` | `{ content: string, mtime: number, frontmatter?: Record<string,unknown> }` | assertInWorkspace 필수, gray-matter 파싱 |
| `fs:change` | main→renderer push | — | `{ type: 'add'\|'change'\|'unlink', path: string }` | chokidar debounce 150ms, webContents.send |
| `claude:check` | invoke | `z.void()` | `{ available: boolean, version?: string }` | which('claude') + claude --version |
| `claude:open` | invoke | `z.object({ dir: z.string().max(512), terminal: z.enum(['Terminal','iTerm2','Ghostty']) })` | `{ ok: boolean, reason?: string }` | assertInWorkspace(dir), osascript+execa |
| `shell:open-external` | invoke | `z.object({ url: z.string().url().max(2048) })` | `void` | http/https만 허용 (URL scheme 검사) |
| `theme:set` | invoke | `z.object({ theme: z.enum(['light','dark','system']) })` | `void` | nativeTheme.themeSource 동기 설정 |
| `prefs:get` | invoke | `z.object({ key: z.string().max(64) })` | `unknown` | electron-store proxy |
| `prefs:set` | invoke | `z.object({ key: z.string().max(64), value: z.unknown() })` | `void` | 허용 key 화이트리스트 적용 |

**공통 zod 스키마 (`validators.ts` 상단 상수)**

```ts
// 의사코드 — 구현 참고용
const PathInput = z.string().min(1).max(512)
const UuidInput = z.string().uuid()
const TerminalInput = z.enum(['Terminal', 'iTerm2', 'Ghostty'])
const ThemeInput = z.enum(['light', 'dark', 'system'])
```

---

## 4. 보안 게이트 구체화

### 4-1. `src/main/security/validators.ts` — export 함수 시그니처

```ts
// 의사코드
export function parsePathInput(raw: unknown): string
  // z.string().max(512).parse(raw)

export function assertInWorkspace(absPath: string, workspaceRoots: string[]): void
  // path.resolve(absPath) 가 workspaceRoots 중 하나의 하위인지 확인
  // 실패 시 throw new Error('PATH_OUT_OF_WORKSPACE')

export function parseWorkspaceAddInput(raw: unknown): { root: string }
export function parseScanInput(raw: unknown): { workspaceId: string }
export function parseReadDocInput(raw: unknown): { path: string }
export function parseClaudeOpenInput(raw: unknown): { dir: string, terminal: TerminalType }
export function parseThemeInput(raw: unknown): { theme: ThemeType }
export function parsePrefsGetInput(raw: unknown): { key: string }
export function parsePrefsSetInput(raw: unknown): { key: string, value: unknown }
  // key가 ALLOWED_PREFS_KEYS 화이트리스트에 포함되는지 추가 검증
```

### 4-2. `src/main/security/protocol.ts` — `app://` 핸들러 의사코드

```
protocol.handle('app', async (request) => {
  1. URL 파싱: const url = new URL(request.url)
  2. decodeURIComponent(url.pathname) → decoded
  3. path.normalize(decoded) → normalized  (.. 제거)
  4. path.resolve(normalized) → resolved    (절대 경로 확정)
  5. assertInWorkspace(resolved, workspaceRoots)  (등록 루트 하위인지 확인)
  6. 확장자 검사: ['.md','.png','.jpg','.svg','.gif','.webp'] 만 허용
  7. net.fetch(pathToFileURL(resolved).toString()) 반환
  실패 시 → Response(403)
})
```

### 4-3. `src/main/services/claude-launcher.ts` — osascript 호출 의사코드

```
function ensureLoginPath():
  if platform !== 'darwin' → return
  if process.env._PATH_INJECTED → return
  execSync("/bin/bash -lc 'echo $PATH'") → loginPath
  process.env.PATH = loginPath.trim()
  process.env._PATH_INJECTED = '1'

async function openInClaude(absDir, terminal):
  assertInWorkspace(absDir, workspaceRoots)  ← 보안 검증 선행
  if platform !== 'darwin' → return { ok:false, reason:'PLATFORM_UNSUPPORTED' }
  claudePath = await which('claude').catch(→ null)
  if !claudePath → return { ok:false, reason:'CLAUDE_NOT_FOUND' }

  script = """
    set p to system attribute "TARGET_DIR"
    tell application "{terminal}"
      activate
      do script "cd " & quoted form of p & " && claude"
    end tell
  """
  // TARGET_DIR을 ENV로 전달 — 문자열 직접 보간 금지
  await execa('osascript', ['-e', script], { env: { ...process.env, TARGET_DIR: absDir } })
  return { ok: true }
```

### 4-4. preload `contextBridge` 노출 API 목록

`src/preload/index.ts` 에서 `ipcRenderer.invoke` 래퍼만 노출. 직접 `ipcRenderer` 객체 노출 금지.

```ts
// 의사코드 — 노출 키 목록
contextBridge.exposeInMainWorld('api', {
  workspace: {
    list:   () => invoke('workspace:list'),
    add:    (root) => invoke('workspace:add', { root }),
    remove: (id) => invoke('workspace:remove', { id }),
    scan:   (workspaceId) => invoke('workspace:scan', { workspaceId }),
  },
  project: {
    scanDocs: (projectId) => invoke('project:scan-docs', { projectId }),
  },
  fs: {
    readDoc:   (path) => invoke('fs:read-doc', { path }),
    onChange:  (cb) => { ipcRenderer.on('fs:change', cb); return () => ipcRenderer.off('fs:change', cb) },
  },
  claude: {
    check: () => invoke('claude:check'),
    open:  (dir, terminal) => invoke('claude:open', { dir, terminal }),
  },
  shell: {
    openExternal: (url) => invoke('shell:open-external', { url }),
  },
  theme: {
    set: (theme) => invoke('theme:set', { theme }),
  },
  prefs: {
    get: (key) => invoke('prefs:get', { key }),
    set: (key, value) => invoke('prefs:set', { key, value }),
  },
})
```

---

## 5. UI 컴포넌트 명세

### AllProjectsView

- 레이아웃: `display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px`
- 정렬 토글: `recent | name | count` — `useViewMode` 훅의 `sortOrder` 상태, electron-store 영속
- `ProjectCard` props:

```ts
interface ProjectCardProps {
  id: string
  name: string
  markerBadges: string[]     // 감지된 마커 종류 (예: ['package.json','CLAUDE.md'])
  docCount: number
  lastModified: number       // mtime timestamp
  topDocs: string[]          // 최대 3개 파일명
  onOpen: () => void         // ProjectView로 전환
}
```

### InboxView

- 4단 시간 그룹 분류 함수: `groupByDate(mtime: number): 'today' | 'yesterday' | 'thisWeek' | 'earlier'`
- 읽은 항목: `opacity: 0.6` (readDocs[absPath] 존재 시)
- `InboxItem` props:

```ts
interface InboxItemProps {
  path: string
  projectName: string
  title: string              // frontmatter.title 또는 파일명
  mtime: number
  isRead: boolean
  onClick: () => void        // readDocs 기록 + doc 열기
}
```

### ProjectView

- 좌측: `FileTree` (react-arborist, 폴더+.md만, ignore 14종 적용)
  - 초기 expand: electron-store `treeExpanded[projectId]` — depth 2까지만 복원
  - 트리 변경 시 debounce 500ms 후 store에 저장
- 우측: `MarkdownViewer`
- `FileTree` props:

```ts
interface FileTreeProps {
  projectId: string
  rootPath: string
  docs: Doc[]
  onSelect: (doc: Doc) => void
  initialExpanded: string[]  // electron-store에서 복원
  onExpandChange: (expanded: string[]) => void
}
```

### MarkdownViewer

react-markdown v10 플러그인 파이프라인:
1. `remark-gfm` — 테이블, 체크박스, strikethrough
2. `remark-breaks` — 단일 줄바꿈 처리
3. `rehype-sanitize` — XSS 차단 (defaultSchema 기반, mermaid는 remark 단계에서 `<svg>` 변환 후 통과)
4. `@shikijs/rehype` — dual theme `{ light: 'github-light', dark: 'github-dark' }` + CSS 변수 즉시 스왑
5. 외부 링크: href가 `http://` 또는 `https://` → `window.api.shell.openExternal(href)`
6. 내부 `.md` 링크: 상대 경로 → `window.api.fs.readDoc` 호출 후 뷰어 내 교체
7. 이미지 src: 상대 경로 → `app://` 프로토콜로 교체

```ts
interface MarkdownViewerProps {
  content: string
  basePath: string           // 이미지/내부링크 상대경로 해석 기준
  onDocNavigate: (absPath: string) => void
}
```

### ThemeToggle

```ts
interface ThemeToggleProps {
  value: 'light' | 'dark' | 'system'
  onChange: (theme: 'light' | 'dark' | 'system') => void
}
```

- onChange 시 `window.api.theme.set(theme)` 호출 → nativeTheme.themeSource 동기
- renderer: `html` 엘리먼트의 `data-theme` 속성을 `'light' | 'dark'`로 설정 (system은 OS 감지 후 결정)
- Shiki 코드블록: dual theme CSS 변수가 `data-theme` 셀렉터로 자동 스왑
- mermaid: theme 변경 시 `mermaid.initialize({ theme: isDark ? 'dark' : 'default' })` 후 전체 재렌더

---

## 6. 디자인 토큰 (themes.css)

```css
/* src/renderer/styles/themes.css */
:root,
[data-theme="light"] {
  --bg:            #ffffff;
  --bg-elev:       #f6f8fa;
  --bg-hover:      #eaeef2;
  --text:          #1f2328;
  --text-muted:    #59636e;
  --border:        #d1d9e0;
  --border-muted:  #eaeef2;
  --accent:        #0969da;
  --accent-hover:  #0550ae;
  --code-bg:       #f6f8fa;
  --badge-bg:      #ddf4ff;
  --badge-text:    #0550ae;
  --shadow:        0 1px 3px rgba(31,35,40,0.12);

  /* Shiki dual theme CSS 변수 (github-light) */
  --shiki-foreground:   #24292e;
  --shiki-background:   #f6f8fa;
}

[data-theme="dark"] {
  --bg:            #0d1117;
  --bg-elev:       #161b22;
  --bg-hover:      #21262d;
  --text:          #e6edf3;
  --text-muted:    #7d8590;
  --border:        #30363d;
  --border-muted:  #21262d;
  --accent:        #388bfd;
  --accent-hover:  #58a6ff;
  --code-bg:       #161b22;
  --badge-bg:      #388bfd1a;
  --badge-text:    #79c0ff;
  --shadow:        0 1px 3px rgba(0,0,0,0.4);

  /* Shiki dual theme CSS 변수 (github-dark) */
  --shiki-foreground:   #c9d1d9;
  --shiki-background:   #161b22;
}
```

---

## 7. 구현 순서 (Sprint별 파일 체크리스트)

### S1 — Foundation (셋업 + 보안 게이트, ~10개 파일)

```
  □ package.json
      deps: electron@39, electron-vite@6-beta, react@19, react-dom@19,
            typescript@5.x, zod@3, electron-store@10, zustand@5,
            fast-glob@3, chokidar@4, execa@9, which@4, gray-matter@4,
            react-arborist@3, react-markdown@10, remark-gfm@4,
            remark-breaks@4, rehype-sanitize@6, @shikijs/rehype@1,
            mermaid@11
      devDeps: @types/react, @types/react-dom, eslint, electron-builder

  □ electron.vite.config.ts
      main entry:     src/main/index.ts
      preload entry:  src/preload/index.ts
      renderer entry: src/renderer/main.tsx
      rollupOptions.external: ['electron-store']  ← ESM 호환 핵심

  □ tsconfig.json
      target: ES2022, moduleResolution: Bundler, strict: true,
      paths: { '@/*': ['src/*'] }

  □ tsconfig.node.json
      main/preload 전용, module: Node16

  □ src/main/index.ts
      BrowserWindow({ contextIsolation:true, sandbox:true,
                       nodeIntegration:false, webSecurity:true,
                       preload: join(__dirname, 'preload/index.js') })
      protocol.registerSchemesAsPrivileged([{ scheme:'app', privileges:{secure:true,standard:true} }])
      import security/protocol.ts (app:// 핸들러 등록)
      import ipc/* (핸들러 초기화)

  □ src/main/security/validators.ts
      parsePathInput / assertInWorkspace / parse* 함수 전체

  □ src/main/security/protocol.ts
      protocol.handle('app', ...) — 3단 검증 의사코드 구현

  □ src/preload/index.ts
      contextBridge.exposeInMainWorld('api', ...) — 전 채널 래퍼

  □ src/preload/types.ts
      Workspace, Project, Doc, ThemeType, TerminalType 등 공유 타입

  □ src/renderer/main.tsx + App.tsx
      빈 플레이스홀더 + "md-viewer" h1 렌더

  □ README.md
      개발 명령, Gatekeeper 우회 가이드 자리
```

Verdict 기준: `pnpm build` 통과, dmg 생성, IPC 보안 단위 테스트 통과, 빈 앱 실행 OK

---

### S2 — Workspace & Filesystem (~8개 파일)

```
  □ src/main/services/store.ts
      const Store = await import('electron-store')  ← 동적 import
      schema 정의 (workspaces/activeWorkspaceId/viewMode/theme/readDocs/
                    treeExpanded/sortOrder/terminal)
      export: getStore(), 마이그레이션 버전 0→1 자리

  □ src/main/services/scanner.ts
      scanProjects(rootPath, depth=2): 마커 8종 검사
        마커: package.json / pyproject.toml / Cargo.toml / go.mod /
              CLAUDE.md / .git / README.md / Makefile
      scanDocs(projectRootPath): fast-glob('**/*.md')
        ignore: node_modules / .git / dist / .next / build /
                __pycache__ / target / vendor /
                .venv / coverage / .cache / out / .nuxt / .turbo

  □ src/main/services/watcher.ts
      chokidar.watch(roots, { persistent:true, awaitWriteFinish:{ stabilityThreshold:150 } })
      이벤트 add/change/unlink → debounce 150ms → webContents.send('fs:change', {type, path})
      watch/unwatch API export

  □ src/main/ipc/workspace.ts
      handle('workspace:list') → store.get('workspaces')
      handle('workspace:add') → dialog.showOpenDialog({properties:['openDirectory']})
                                → scanner.scanProjects 즉시 호출
                                → store push + return Workspace
      handle('workspace:remove') → store filter + watcher.unwatch
      handle('workspace:scan') → scanner.scanProjects(workspaceRoot)
      handle('project:scan-docs') → scanner.scanDocs 청크 50개씩
                                   → webContents.send('project:docs-chunk', chunk)

  □ src/main/ipc/fs.ts
      handle('fs:read-doc') → validatePath → fs.readFile → gray-matter → return

  □ src/renderer/hooks/useWorkspace.ts
      useEffect → api.workspace.list() on mount
      add/remove 액션

  □ src/renderer/hooks/useDocs.ts
      invoke project:scan-docs + listen project:docs-chunk + listen fs:change

  □ src/renderer/state/store.ts (zustand)
      workspaces, activeWorkspaceId, projects, docs, viewMode, sortOrder
      + setters

  □ (벤치) scripts/bench-watcher.ts
      500 dirs × 10 files 생성 → watcher RSS 측정 → U1 기록
```

Verdict 기준: 워크스페이스 등록 → 프로젝트 N개 감지 → md 리스트 IPC 청크 수신 OK

---

### S3 — Project View + Markdown Viewer (~10개 파일)

```
  □ src/renderer/views/ProjectView.tsx
      2-pane 레이아웃: FileTree(left 260px) + MarkdownViewer(right flex-1)

  □ src/renderer/components/FileTree.tsx
      react-arborist, 폴더+.md 노드만, treeExpanded depth 2 복원
      onSelect → api.fs.readDoc → 뷰어 업데이트
      onExpandChange → debounce 500ms → api.prefs.set('treeExpanded', ...)

  □ src/renderer/components/MarkdownViewer.tsx
      react-markdown v10 + remark-gfm + remark-breaks + rehype-sanitize
      + @shikijs/rehype(dual theme) + 외부링크/내부md/이미지 app:// 처리

  □ src/renderer/lib/markdown.ts
      remark/rehype 플러그인 조합 export
      sanitize schema: defaultSchema + mermaid svg 허용 설정

  □ src/renderer/lib/mermaid.ts
      mermaid.initialize({ startOnLoad:false })
      renderMermaid(id, code): Promise<string>  ← svg string 반환
      IntersectionObserver로 viewport 진입 시점에 렌더 트리거

  □ src/renderer/styles/globals.css
      reset, body 기본 스타일, scrollbar, selection

  □ src/renderer/styles/themes.css
      섹션 6의 토큰 전체

  □ src/renderer/hooks/useTheme.ts
      초기값 api.prefs.get('theme')
      onChange → api.theme.set + html[data-theme] 업데이트
      prefers-color-scheme 감지 (system 옵션)
```

Verdict 기준: 트리 클릭 → 코드/mermaid 정상 렌더, 5k 노드 시뮬 초기 렌더 < 500ms

---

### S4 — All Projects + Inbox + Dark Mode (~7개 파일)

```
  □ src/renderer/views/AllProjectsView.tsx
      CSS Grid auto-fill minmax(280px,1fr)
      정렬 토글 (recent/name/count) → zustand sortOrder
      ProjectCard 목록 렌더

  □ src/renderer/components/ProjectCard.tsx
      props: ProjectCardProps (섹션 5 참고)
      마커 뱃지: 최대 3개 표시 + "+N" 더보기

  □ src/renderer/views/InboxView.tsx
      groupByDate 함수로 4단 분류
      InboxItem 목록 + group 헤더

  □ src/renderer/components/InboxItem.tsx
      props: InboxItemProps (섹션 5 참고)
      isRead → opacity 0.6 + transition

  □ src/renderer/components/Sidebar.tsx
      WorkspacePicker 드롭다운 + 뷰 모드 스위처 (All|Inbox|Project) + ThemeToggle

  □ src/renderer/components/ThemeToggle.tsx
      light/dark/system 버튼 그룹, useTheme 훅 연결

  □ src/renderer/hooks/useViewMode.ts
      viewMode state + api.prefs.set('viewMode') 영속
```

Verdict 기준: 3가지 뷰 전환 OK, 다크 토글 시 코드블록/mermaid 동기화 확인

---

### S5 — Claude CLI + Polish + Release Prep (~5개 파일)

```
  □ src/main/security/path.ts
      ensureLoginPath() 구현 (S1에 stub 있으면 완성)

  □ src/main/services/claude-launcher.ts
      ensureLoginPath 호출 + openInClaude 완성
      terminal enum 분기 (Terminal/iTerm2/Ghostty)
      platform !== 'darwin' → PLATFORM_UNSUPPORTED 반환

  □ src/main/ipc/claude.ts
      handle('claude:check') → which('claude') + claude --version
      handle('claude:open') → assertInWorkspace + claude-launcher.openInClaude

  □ src/renderer/components/ClaudeButton.tsx
      마운트 시 api.claude.check() → available 상태
      unavailable → "claude를 찾을 수 없습니다" 모달 + [설치 가이드] + [다시 확인] 버튼
      클릭 → api.claude.open(projectDir, terminal)

  □ README.md (완성)
      개발 환경 설정, pnpm dev/build/dist:mac 명령
      macOS Gatekeeper 우회: "우클릭 → 열기" 또는
        xattr -d com.apple.quarantine "/Applications/md-viewer.app"
      Claude CLI 미설치 시 안내 링크
```

Verdict 기준: 워크스페이스 → 프로젝트 → 문서 → "Open in Claude" → 터미널 claude 실행 골든 패스 통과

---

## 8. 빌드/검증 명령

```json
{
  "scripts": {
    "dev":        "electron-vite dev",
    "build":      "electron-vite build",
    "typecheck":  "tsc --noEmit",
    "lint":       "eslint src --ext .ts,.tsx",
    "dist:mac":   "pnpm build && electron-builder --mac --publish never"
  }
}
```

```bash
# Gatekeeper 우회 (첫 실행)
xattr -d com.apple.quarantine "/Applications/md-viewer.app"
# 또는 우클릭 → 열기 → "그래도 열기"
```

---

## 9. 검증 기준 (Verification Hooks per Sprint)

| Sprint | 빌드 | 타입 | 보안 | 동작 | 성능 |
|--------|------|------|------|------|------|
| S1 | `pnpm build` 통과, dmg 생성 | tsc strict, no any | preload IPC zod·allowlist 단위 테스트 통과 | 빈 워크스페이스로 앱 실행 OK | — |
| S2 | 동일 | 동일 | path traversal 시도 5건 차단 확인 (../../../etc/passwd 등) | 워크스페이스 등록 → 프로젝트 자동 감지 → md 리스트 IPC 청크 수신 OK | 500dirs×10files RSS 측정 기록 (U1) |
| S3 | 동일 | 동일 | rehype-sanitize XSS 시도 차단 (`<script>`, `onerror=`) | Project View 트리 + 뷰어, mermaid·코드블록 정상 렌더 | 5k 노드 트리 초기 렌더 < 500ms (U2), Shiki 번들 크기 측정 (U3) |
| S4 | 동일 | 동일 | — | All Projects 카드 + Inbox 4단 그룹 + 다크 토글 동작 OK | — |
| S5 | dmg 첫 실행 OK, Gatekeeper 우회 확인 (U4) | — | osascript escape 단위 테스트 (특수문자 dir명) | 골든 패스 전체 통과, claude 미설치 폴백 모달 동작 | — |

### e2e 시나리오 요약 (Sprint별 1줄)

- **S1**: 앱 실행 후 빈 화면 렌더, DevTools 콘솔 에러 0건
- **S2**: `~/develop` 등록 → 3개 이상 프로젝트 카드 감지 → md 파일명 목록 표시
- **S3**: 프로젝트 선택 → 트리 펼치기 → md 클릭 → 코드블록+mermaid 렌더 확인
- **S4**: All → Inbox → Project 뷰 전환 → 다크 모드 토글 → 재시작 후 상태 복원 확인
- **S5**: Project View에서 "Open in Claude" 클릭 → iTerm2/Terminal에서 `claude` 실행 확인
