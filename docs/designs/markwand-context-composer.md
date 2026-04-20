---
slug: markwand-context-composer
sprint: P1~P2
created: 2026-04-20
status: draft
plan_ref: docs/plans/markwand-context-composer-mvp.md
---

# Context Composer — CPS 설계서

## 1. Context

markwand v0.2 플래그십 기능. 여러 프로젝트의 `.md` 파일을 체크박스로 전역 선택 → 하단 Composer Tray에서 조합 → `Send to Claude Code` 또는 `Send to Codex (단발 응답)` 버튼으로 터미널 CLI에 전달. Plan 전체 스코프는 P1(필수)+P1.5(마지막 선택 복원)+P2(Codex)이며 이 Design은 MVP 릴리스(v0.2.0)에 해당하는 범위만 다룬다.

**설계 원칙**:
1. **기존 보안 경계 유지**: `assertInWorkspace` 재사용, app:// protocol allowlist는 건드리지 않음.
2. **AppleScript env 패턴 확장**: `TARGET_DIR` 관행 그대로 `CONTEXT_FILE` / `CONTEXT_DIR` env 추가. 쉘 문자열 보간 최소화.
3. **Set 불변 교체 강제**: Zustand shallow equality 리렌더 보장. 핵심 액션에 명시적으로 `new Set(...)` 사용.
4. **새 창 강제 개방**: 동일 터미널의 기존 Claude 대화에 섞이지 않도록 Composer 전용 launcher override.
5. **TTL 600초**: "창 열고 자리 비움" 시나리오 방어.
6. **발견성 우선**: 체크박스는 상시 노출, 온보딩 말풍선 1회 제공.

---

## 2. Problem

### 기술적 과제

| # | 과제 | 복잡도 | 의존성 |
|---|---|---|---|
| T1 | IPC 확장: `composer:send`, `composer:estimate-tokens`, `codex:check` 3채널 | M | validators.ts, preload |
| T2 | Zustand Set 상태 + 불변 교체 + stale cleanup useEffect | M | state/store.ts, workspace refresh |
| T3 | context-builder: 파일 concat + TTL setTimeout + before-quit + 기동 시 선제 cleanup | M | main/index.ts, app.getPath('userData') |
| T4 | claude-launcher 확장: `contextFile?` 옵션, 새 창 강제 AppleScript 분기 | M | 기존 claude-launcher.ts |
| T5 | codex-launcher 신규: `which codex`, `codex exec ... < file` AppleScript | M | claude-launcher 패턴 복제 |
| T6 | 프리미티브 3종: Checkbox, Gauge, Toast — Button 컨벤션 준수 | S | ui/Button.tsx 패턴 |
| T7 | ComposerTray + ComposerChip + ComposerOnboarding | L | Zustand, 프리미티브 |
| T8 | FileTree/ProjectCard/InboxItem 체크박스 통합, react-arborist 이벤트 버블 차단 | M | react-arborist 노드 커스텀 |
| T9 | 토큰 추정 휴리스틱 + 200k 임계 경고 모달(세션 dismiss) | S | lib/tokenEstimate.ts |
| T10 | 실패 시 클립보드 폴백 + UI 카피 | S | `clipboard.writeText` |

### 기존 시스템과의 접점

- **security/validators.ts**: 신규 `parseComposerSendInput`, `parseComposerEstimateInput` 추가.
- **security/protocol.ts**: **변경 없음** (Refiner 철회).
- **main/services/store.ts**: `composerOnboardingSeen`, `composerAutoClear`, `lastSelectedDocPaths` 3개 prefs 키 추가. `ALLOWED_PREFS_KEYS` 에도 추가.
- **main/services/claude-launcher.ts**: `openInClaude(dir, terminal, options?)` 시그니처 확장. 기존 호출부 호환 유지.
- **renderer/state/store.ts**: 4개 필드 + 4개 액션 추가.
- **renderer/App.tsx**: `<main>` 하단에 `<ComposerTray />` + `<ToastHost />`.

---

## 3. Solution

### 3.1 아키텍처

```
┌─ Renderer ─────────────────────────────────────────────┐
│  FileTree / ProjectCard / InboxItem                    │
│      └─ <Checkbox onChange={toggleDocSelection}/>      │
│                          │                             │
│                          ▼                             │
│  Zustand store: selectedDocPaths: Set<string>          │
│                 composerCollapsed, composerAutoClear   │
│                          │                             │
│                          ▼                             │
│  <ComposerTray>                                        │
│    <ChipRow/> <Gauge/> [Clear][×접기][Send to Claude]  │
│                                     [Send to Codex]    │
│                          │                             │
└─────────── window.api.composer ────────────────────────┘
                           │
                           ▼ IPC (contextBridge)
┌─ Main ─────────────────────────────────────────────────┐
│  ipc/composer.ts                                       │
│    composer:send       → context-builder → launcher    │
│    composer:estimate   → fs.stat 합산                  │
│    codex:check         → which codex                   │
│                          │                             │
│  services/context-builder.ts                           │
│    assemble(paths, workspaceRoots) → <userData>/…uuid  │
│    TTL setTimeout(600s) + before-quit + boot cleanup   │
│                          │                             │
│  services/claude-launcher.ts  (확장)                   │
│    openInClaude(dir, term, { contextFile })            │
│       AppleScript: 새 창 강제 + @<contextFile>         │
│                                                        │
│  services/codex-launcher.ts   (신규)                   │
│    openInCodex(dir, term, { contextFile, instruction })│
│       AppleScript: codex exec "..." < $CONTEXT_FILE    │
└────────────────────────────────────────────────────────┘
```

### 3.2 IPC 설계

#### 채널 및 시그니처

| 채널 | 입력 | 출력 | 에러 코드 |
|---|---|---|---|
| `composer:send` | `{ paths: string[], target: 'claude'\|'codex', projectDir: string, terminal: TerminalType, instruction?: string }` | `{ ok: boolean, contextFile?: string, reason?: string }` | `CONTEXT_BUILD_FAILED`, `LAUNCH_FAILED`, `PATH_OUT_OF_WORKSPACE`, `NO_PATHS`, `CODEX_NOT_FOUND` |
| `composer:estimate-tokens` | `{ paths: string[] }` | `{ bytes: number, estimatedTokens: number, missing: string[] }` | `PATH_OUT_OF_WORKSPACE` |
| `codex:check` | `{}` | `{ available: boolean, version?: string }` | — |

#### zod 스키마 (validators.ts 추가)

```ts
const ComposerPathList = z.array(PathInput).min(1).max(200)
const ComposerTarget = z.enum(['claude', 'codex'])
const TerminalEnum = z.enum(['Terminal', 'iTerm2', 'Ghostty'])

export function parseComposerSendInput(raw: unknown) {
  return z.object({
    paths: ComposerPathList,
    target: ComposerTarget,
    projectDir: PathInput,
    terminal: TerminalEnum,
    instruction: z.string().max(2048).optional(),
  }).parse(raw)
}

export function parseComposerEstimateInput(raw: unknown) {
  return z.object({ paths: ComposerPathList }).parse(raw)
}
```

**200개 상한**: Plan Risk "선택 폭발"의 하드 상한. UI는 100개에서 경고 모달, 200개에서 IPC 거부.

#### preload 바인딩 (preload/index.ts 추가)

```ts
composer: {
  send: (input) => ipcRenderer.invoke('composer:send', input),
  estimateTokens: (paths: string[]) =>
    ipcRenderer.invoke('composer:estimate-tokens', { paths }),
},
codex: {
  check: () => ipcRenderer.invoke('codex:check'),
},
```

#### preload/types.ts — WindowApi 확장

```ts
composer: {
  send: (input: ComposerSendInput) => Promise<ComposerSendResult>
  estimateTokens: (paths: string[]) => Promise<ComposerEstimate>
}
codex: {
  check: () => Promise<{ available: boolean; version?: string }>
}
```

### 3.3 Zustand Store 명세 (state/store.ts)

```ts
interface AppState {
  // ... 기존 필드 ...

  // Composer — 전역 선택 상태
  selectedDocPaths: Set<string>
  composerCollapsed: boolean
  composerAutoClear: boolean  // Send 후 자동 Clear (prefs 동기화)
  composerOnboardingSeen: boolean

  // 액션
  toggleDocSelection: (absPath: string) => void
  clearDocSelection: () => void
  setComposerCollapsed: (collapsed: boolean) => void
  pruneStaleDocSelection: (availablePaths: Set<string>) => void
}
```

**핵심 — Set 불변 교체 패턴 (리렌더 보장)**:

```ts
toggleDocSelection: (absPath) =>
  set((s) => {
    const next = new Set(s.selectedDocPaths)
    next.has(absPath) ? next.delete(absPath) : next.add(absPath)
    return { selectedDocPaths: next }
  }),

clearDocSelection: () => set({ selectedDocPaths: new Set() }),

pruneStaleDocSelection: (available) =>
  set((s) => {
    const next = new Set(Array.from(s.selectedDocPaths).filter((p) => available.has(p)))
    return next.size === s.selectedDocPaths.size ? {} : { selectedDocPaths: next }
  }),
```

**Selector 컨벤션**: `useAppStore((s) => s.selectedDocPaths)`. 크기만 필요하면 `useAppStore((s) => s.selectedDocPaths.size)`로 낭비 리렌더 방지.

### 3.4 context-builder.ts 명세

```
<userData>/context/ctx-<uuid>.md
  perm 0600
  포맷:
    <!-- markwand composer context — generated {ISO8601} — {N} files -->

    ---

    # <workspace-rel-path-1>

    <file 1 content, frontmatter 포함 그대로>

    ---

    # <workspace-rel-path-2>

    ...
```

**TTL 관리 3단**:

| 트리거 | 동작 | 위치 |
|---|---|---|
| Send 성공 시 | `setTimeout(() => fs.unlink(path).catch(()=>{}), 600_000)` | context-builder.ts:assemble 반환 직전 |
| before-quit | `<userData>/context/*.md` 전량 삭제 (동기 `fs.rmSync`, 실패 무시) | main/index.ts `app.on('before-quit', ...)` |
| 앱 기동 | `readdir + stat` → mtime 기준 1시간 이상 파일 선제 삭제 | main/index.ts whenReady 후 |

**경로 검증**: 각 path마다 `assertInWorkspace(path, workspaceRoots)` 호출. 실패 시 `PATH_OUT_OF_WORKSPACE` throw → IPC 핸들러가 reject → renderer가 Toast.

**워크스페이스 상대 경로 계산**: `path.relative(matchingWorkspace.root, absPath)` — 어느 워크스페이스 하위인지 순차 탐색.

### 3.5 Claude Launcher 확장 (claude-launcher.ts)

```ts
export interface OpenInClaudeOptions {
  contextFile?: string  // 있으면 Composer 모드
  forceNewWindow?: boolean  // Composer는 항상 true
}

export async function openInClaude(
  absDir: string,
  terminal: TerminalType,
  options: OpenInClaudeOptions = {}
): Promise<LaunchResult>
```

**AppleScript 템플릿 — 기본(기존 유지)**:
```
set p to system attribute "TARGET_DIR"
tell application "${terminal}"
  activate
  if (count of windows) is 0 then
    do script "cd " & quoted form of p & " && claude"
  else
    do script "cd " & quoted form of p & " && claude" in front window
  end if
end tell
```

**AppleScript 템플릿 — Composer 모드 (새 창 강제)**:
```
set p to system attribute "TARGET_DIR"
set ctx to system attribute "CONTEXT_FILE"
tell application "${terminal}"
  activate
  do script "cd " & quoted form of p & " && claude " & quoted form of ("@" & ctx)
end tell
```
> `in front window` 생략 → Terminal.app이 새 창 생성. iTerm2는 `create window with default profile` 필요 — 분기 유지.

**iTerm2 분기**:
```
tell application "iTerm2"
  set newWindow to (create window with default profile)
  tell current session of newWindow
    write text "cd " & quoted form of p & " && claude " & quoted form of ("@" & ctx)
  end tell
end tell
```

**Ghostty**: AppleScript 지원 불안정. `do script` 시도 → 실패 시 **클립보드 폴백**(§3.10).

**execa 호출**:
```ts
await execa('osascript', ['-e', script], {
  env: { ...process.env, TARGET_DIR: absDir, CONTEXT_FILE: contextFile },
  timeout: 10_000,
})
```

### 3.6 Codex Launcher (codex-launcher.ts 신규)

```ts
export async function checkCodex(): Promise<{ available: boolean; version?: string }> {
  ensureLoginPath()
  const { default: which } = await import('which')
  const codexPath = await which('codex').catch(() => null)
  if (!codexPath) return { available: false }
  try {
    const { execa } = await import('execa')
    const { stdout } = await execa(codexPath, ['--version'], { timeout: 5000 })
    return { available: true, version: stdout.trim().split('\n')[0] }
  } catch { return { available: true } }
}

export async function openInCodex(
  absDir: string,
  terminal: TerminalType,
  opts: { contextFile: string; instruction: string }
): Promise<LaunchResult>
```

**AppleScript 템플릿**:
```
set p to system attribute "TARGET_DIR"
set ctx to system attribute "CONTEXT_FILE"
set ins to system attribute "CODEX_INSTRUCTION"
tell application "${terminal}"
  activate
  do script "cd " & quoted form of p & " && codex exec " & quoted form of ins & " < " & quoted form of ctx
end tell
```

**기본 instruction**: `"다음 문서들을 바탕으로 작업해줘"` (사용자가 입력창에서 편집 가능하면 더 좋으나 MVP는 고정).

### 3.7 ComposerTray 컴포넌트 구조

```
<ComposerTray>  — App.tsx의 <main> 하단, flexShrink:0
  { composerCollapsed
      ? <CollapsedPill>  — 우측 하단 작은 pill "3 docs 선택됨 ▲"
      : <ExpandedBar>
          <ChipRow>
            <ComposerChip doc={d}/> × N  — overflow scroll-x
          </ChipRow>
          <Gauge value={estTokens} max={200_000} warn={200_000} crit={1_000_000}/>
          <Actions>
            <Button variant="ghost" onClick={clearDocSelection}>Clear</Button>
            <IconButton aria-label="접기" onClick={collapse}><XIcon/></IconButton>
            <Button variant="primary" onClick={handleSendClaude}>Send to Claude Code</Button>
            <Button variant="secondary" disabled={!codexAvailable} onClick={handleSendCodex}
                    title="대화형 세션이 아닌 비대화형 codex exec 단발 실행">
              Send to Codex (단발 응답)
            </Button>
          </Actions>
      </ExpandedBar>
  }
</ComposerTray>
```

**가시성 규칙**:
- `selectedDocPaths.size === 0` → 전체 숨김
- `composerCollapsed === true` → `<CollapsedPill>`만 표시
- 아니면 `<ExpandedBar>`
- 첫 선택 시 `composerCollapsed = false` 자동

**ComposerOnboarding**: `composerOnboardingSeen === false && workspaces.length > 0`일 때 FileTree 상단에 말풍선 1회. 닫기 → `composerOnboardingSeen = true` prefs 저장.

**Send 후 동작**:
- `composerAutoClear === true` → `clearDocSelection()` + Toast 성공
- 아니면 선택 유지 + Toast "Claude Code로 전송됨 — 선택 유지 중"

### 3.8 프리미티브 API

**Checkbox**:
```ts
interface CheckboxProps {
  checked: boolean
  onChange: (next: boolean) => void
  size?: 'sm' | 'md'  // default 'md'
  'aria-label'?: string
  disabled?: boolean
}
```
구현: `<button role="checkbox" aria-checked={checked}>` + space/enter 키 지원. variant는 Button 컨벤션 차용.

**Gauge**:
```ts
interface GaugeProps {
  value: number      // 현재 토큰
  max: number        // 게이지 만선 기준 (기본 200_000)
  warn?: number      // 노랑 임계 (기본 max*0.8)
  crit?: number      // 빨강 임계 (기본 max)
  label?: string     // "120k / 200k tokens"
}
```
색상: `var(--color-success-bg)` / `--color-warning-bg` / `--color-danger-bg`.

**Toast**:
```ts
interface Toast {
  id: string
  variant: 'success' | 'error' | 'info'
  message: string
  durationMs?: number  // default 3500
  action?: { label: string; onClick: () => void }
}
```
`ToastHost`는 App.tsx 레벨, `useToast()` 훅으로 push. `--z-toast` 활용.

### 3.9 UI 카피 (확정)

| 위치 | 문구 |
|---|---|
| 버튼 — Send to Claude | `Send to Claude Code` |
| 버튼 — Send to Codex | `Send to Codex (단발 응답)` |
| Codex 툴팁 | `대화형 세션이 아닌 비대화형 codex exec으로 단발 실행됩니다` |
| Codex 비활성 툴팁 | `codex CLI가 설치되어 있지 않습니다 — https://github.com/openai/codex` |
| 온보딩 말풍선 | `☑ 체크박스로 여러 파일을 선택한 뒤 하단의 Composer로 AI에 한 번에 전달하세요` |
| 온보딩 닫기 | `확인했어요` |
| Clear 버튼 | `Clear` |
| 접힌 pill | `{N} docs 선택됨 ▲` |
| 토큰 초과 모달 제목 | `큰 컨텍스트 전송 확인` |
| 토큰 초과 모달 본문 | `예상 {N} 토큰 ({기준} 초과). 계속하시겠습니까?` |
| 토큰 초과 모달 체크 | `이번 세션에서 다시 묻지 않기` |
| 토큰 초과 모달 버튼 | `[취소] [계속 전송]` |
| 토스트 — 성공 Claude | `Claude Code로 전송됨 — 터미널 확인` |
| 토스트 — 성공 Codex | `Codex 실행 — 터미널에서 응답 확인` |
| 토스트 — 폴백 | `터미널 실행 실패. 명령어를 클립보드에 복사했습니다 — 터미널에 붙여넣기` |
| 토스트 — stale | `{N}개 문서가 더 이상 존재하지 않아 선택에서 제거되었습니다` |
| 토스트 — 워크스페이스 밖 | `워크스페이스 외부 경로는 추가할 수 없습니다` |
| 토스트 — 200개 상한 | `최대 200개까지 선택할 수 있습니다` |

### 3.10 에러 처리 & 폴백 전략

**AppleScript 런칭 실패 시 (execa timeout/throw)**:
1. 조립된 쉘 명령 문자열을 `clipboard.writeText(...)` (main 프로세스 `clipboard` 모듈)
2. renderer로 결과 반환: `{ ok: false, reason: 'LAUNCH_FAILED', fallbackCopied: true }`
3. Renderer는 Toast "터미널 실행 실패. 명령어를 클립보드에 복사했습니다" + 액션 "OK"

클립보드에 복사되는 문자열 예시:
```
cd "/Users/keunsik/develop/foo" && claude "@/Users/keunsik/Library/Application Support/markwand/context/ctx-abc.md"
```

**IPC 에러 매핑**:
| 에러 코드 | UI 처리 |
|---|---|
| `CONTEXT_BUILD_FAILED` | Toast error "컨텍스트 파일 생성 실패" + 상세 로그 |
| `LAUNCH_FAILED` | 클립보드 폴백 Toast |
| `PATH_OUT_OF_WORKSPACE` | Toast "워크스페이스 외부 경로는 추가할 수 없습니다" + 해당 path 선택 해제 |
| `NO_PATHS` | 버튼 자체 disabled (발생 불가하나 방어) |
| `CODEX_NOT_FOUND` | 버튼 disabled + 툴팁 설치 안내 |

### 3.11 Stale 경로 Cleanup 훅

**위치**: `src/renderer/App.tsx` 내부 useEffect.

```ts
// workspaces 또는 projects 스캔 결과가 바뀔 때마다 실행
useEffect(() => {
  const available = new Set<string>()
  for (const doc of docs) available.add(doc.path)
  if (available.size === 0) return  // 아직 스캔 중

  const before = selectedDocPaths.size
  pruneStaleDocSelection(available)
  const after = useAppStore.getState().selectedDocPaths.size
  if (after < before) {
    toast.info(`${before - after}개 문서가 더 이상 존재하지 않아 선택에서 제거되었습니다`)
  }
}, [docs, workspaces])
```

**마지막 선택 복원 (P1.5)**:
- 앱 종료 전(beforeunload) 또는 Send 성공 직후: `prefs.lastSelectedDocPaths = Array.from(selectedDocPaths)`
- 앱 기동 useEffect: `prefs.lastSelectedDocPaths`를 읽고, 첫 workspace 스캔 완료 후 stale 필터링한 뒤 복원. `Toast "마지막 선택 N개 복원됨 [Clear]"` 표시.

### 3.12 데이터 계약 (Data Contract)

| 필드 | 타입 | 단위 / 포맷 | 변환 규칙 |
|---|---|---|---|
| `selectedDocPaths` | `Set<string>` | **절대 경로** (posix, macOS 기준) | IPC 전송 시 `Array.from(...)` |
| `ComposerSendInput.paths` | `string[]` | 절대 경로, 1~200개 | 각 요소 `assertInWorkspace` |
| `ComposerSendInput.projectDir` | `string` | 절대 경로 (터미널 `cd` 대상) | activeProject 있으면 project.root, 없으면 첫 workspace.root |
| `ComposerEstimate.bytes` | `number` | UTF-8 byte 합 (fs.stat.size 합산) | — |
| `ComposerEstimate.estimatedTokens` | `number` | `Math.ceil(bytes / 3.5) * 1.35` 정수 | 휴리스틱, ±30% 오차 허용 |
| `context file path` | `string` | 절대 경로 `<userData>/context/ctx-<uuid>.md` | electron `app.getPath('userData')` |
| `ctx file header` | text | `<!-- markwand composer context — generated {ISO8601} — {N} files -->\n\n---\n\n` | concat 선두 고정 |
| `ctx file per-doc block` | text | `# {workspace-rel-path}\n\n{content}\n\n---\n\n` | workspace 상대 경로 계산 후 삽입 |
| `TTL` | number | **milliseconds = 600_000** (10분) | `setTimeout` 기본값 |
| `boot cleanup age` | number | ms. 1시간 = 3_600_000 | mtime 기준 선제 삭제 |
| `토큰 경고 임계` | number | 200_000 | 하드코딩, 추후 prefs 전환 가능 |
| `200개 상한` | number | 선택 개수 | zod min(1).max(200) |
| `AppleScript env var` | string | `TARGET_DIR`, `CONTEXT_FILE`, `CODEX_INSTRUCTION` | `system attribute` 로 AppleScript 내부 참조 |
| `프리셋 저장 위치 (Phase3)` | JSON | electron-store `composerPresets: Preset[]` | MVP 범위 외 |

---

## 4. Sprint Contract (스프린트별 검증 계약)

Plan Phase에 맞춰 3 스프린트로 운영. 각 Done 조건은 Evaluator가 PASS/FAIL 판정.

| Sprint | Done 조건 | 검증 방법 | 검증 명령 | 우선순위 |
|--------|----------|----------|----------|---------|
| **S-P1** | 사용자가 FileTree에서 체크박스 3개 클릭 → Composer Tray에 칩 3개 + 토큰 게이지 렌더 | UI 렌더 + store 상태 | `pnpm typecheck && pnpm build` + 수동 UI 확인 | Critical |
| **S-P1** | `Send to Claude Code` 클릭 → 터미널 새 창 + Claude가 `@{contextFile}` 프롬프트 수신 | 실기 수동 | V1 수동 테스트(Plan) | Critical |
| **S-P1** | `<userData>/context/ctx-*.md` 생성 + perm 0600 + 600s 경과 후 삭제 | 유닛 테스트 | `pnpm vitest run context-builder` | Critical |
| **S-P1** | `parseComposerSendInput` zod 검증이 200개 초과, 워크스페이스 밖 경로 거부 | 유닛 테스트 | `pnpm vitest run validators` | Critical |
| **S-P1** | 동일 세션 2회 Send → 각각 **새 창** 개방 (기존 대화 섞이지 않음) | 실기 수동 | V9 수동 테스트 | Critical |
| **S-P1** | 첫 실행 시 온보딩 말풍선 1회 표시, 닫기 후 재실행 시 미노출 | 실기 수동 | V11 수동 테스트 | Critical |
| **S-P1** | workspace refresh 후 존재하지 않는 파일 선택이 자동 제거 + Toast | 실기 수동 + 유닛 | V6 | Critical |
| **S-P1** | Zustand `toggleDocSelection` 호출 시 `selectedDocPaths` 레퍼런스 변경 | 유닛 테스트 | `pnpm vitest run store.composer` | Critical |
| **S-P1** | AppleScript 런칭 실패 → 클립보드 복사 + Toast 폴백 | mock 실기 | V8 수동 테스트 | Nice-to-have |
| **S-P1.5** | Send 성공 후 앱 재시작 → `prefs.lastSelectedDocPaths` 자동 복원 + Toast | 실기 수동 | 수동 | Critical |
| **S-P1.5** | 복원 시점에 stale 경로(삭제된 파일)는 필터링 | 실기 수동 | 수동 | Critical |
| **S-P2** | Codex 미설치 상태 → `Send to Codex` 비활성 + 설치 안내 툴팁 | 실기 수동 | `which codex` 제거 후 확인 | Critical |
| **S-P2** | Codex 설치 상태 → 클릭 시 `codex exec "..." < $CONTEXT_FILE` 실행 + 응답이 문서 내용 기반 | 실기 수동 | V2 수동 테스트 | Critical |

**작성 원칙 반영**: 각 조건은 테스트 가능. 검증 명령 컬럼에 `pnpm vitest`, 수동 시나리오 ID(V1~V11)를 명시. "동작한다"가 아니라 "사용자가 쓸 수 있다" 기준.

---

## 5. 관통 검증 조건 (End-to-End)

| # | 시작점 (사용자 행동) | 종착점 (결과 확인) | 우선순위 |
|---|---------------------|-------------------|---------|
| 1 | 2개 프로젝트의 `.md`를 각 1개씩 체크 | Composer Tray 칩 2개 + 토큰 게이지 반영 + Send 버튼 활성 | Critical |
| 2 | `Send to Claude Code` 클릭 | 터미널 새 창에 Claude 실행 + 2개 파일 내용 기반 응답 | Critical |
| 3 | Send 후 Composer Tray 표시 상태 | 선택 유지(기본) 또는 Clear(prefs 토글) 둘 다 정상 동작 | Critical |
| 4 | 앱 재시작 | `lastSelectedDocPaths` 복원 + stale 필터링 + Toast 안내 | Critical |
| 5 | 큰 파일 10개 선택(합 300k+ 토큰) | Gauge 빨강 + "큰 컨텍스트 전송 확인" 모달 + 세션 dismiss 동작 | Critical |
| 6 | 선택 파일 FS 실삭제 후 markwand 새로고침 | selectedDocPaths에서 자동 제거 + Toast "N개 제거됨" | Critical |
| 7 | `Send to Codex` 클릭(설치됨) | 터미널 새 창 + `codex exec` 응답 + 종료 후 터미널 유지 | Critical |
| 8 | AppleScript mock 실패 | 클립보드에 완성된 명령 복사 + Toast 폴백 | Nice-to-have |

---

## 6. 평가 기준 (Evaluation Criteria)

- **기능**: Sprint Contract 13개 조건 전부 PASS.
- **설계 품질**:
  - `openInClaude` 시그니처 확장이 기존 호출부(`ClaudeButton`)와 호환되는가?
  - IPC 채널이 `workspace:*`, `claude:*` 컨벤션과 일관되는가(`composer:*`, `codex:*`)?
  - Set 불변 교체가 모든 액션에서 강제되었는가?
- **단순성**:
  - MCP 미포함(`v2 이월` 근거 명시).
  - Preset 저장 미포함(Phase3 분리).
  - 링크 재귀 미포함(Phase4 분리).
  - 불필요한 protocol allowlist 확장 없음(Refiner 철회).
- **보안**:
  - 모든 path 입력이 `assertInWorkspace` 통과.
  - 쉘 문자열 직접 보간 없음(전부 `system attribute` env 경유).
  - context 파일 perm 0600.

---

## 7. 역방향 검증 체크리스트

- [x] Plan P1: 체크박스 선택 + Composer Tray + Send to Claude → §3.7, §3.8, §3.5, S-P1
- [x] Plan P1.5: 마지막 선택 복원 → §3.11, S-P1.5
- [x] Plan P2: Send to Codex 비대화형 → §3.6, §3.9, S-P2
- [x] Critic #1 (protocol allowlist 철회) → §2 기존 시스템 접점, §3 설계 원칙
- [x] Critic #2 (TTL 600초) → §3.4, Data Contract
- [x] Critic (ComposerTray 접기/Send 후 동작) → §3.7, UI 카피
- [x] Critic (Codex 단발 응답 레이블/툴팁) → §3.9
- [x] Critic (동일 세션 중복 Send 새 창) → §3.5, S-P1 Critical 항목
- [x] Critic (Set 불변 교체) → §3.3, 평가 기준
- [x] Critic (첫 사용자 온보딩) → §3.7, §3.9
- [x] Critic (토큰 초과 세션 dismiss) → §3.9, E2E #5
- [x] Plan Risk "AppleScript 이스케이프" → §3.5 env 패턴 재사용
- [x] Plan Risk "Ghostty env 전파" → §3.5 Ghostty 폴백 명시
- [x] Plan Risk "stale 경로 cleanup" → §3.11
- [x] Plan Risk "선택 폭발" → zod 200개 상한 + UI 100개 경고
- [ ] Plan Unknown #1 (`@file` 참조 Read 호출) — V1 실기 검증 필요
- [ ] Plan Unknown #8 (`--add-dir` 필요성) — V1 검증 후 결정
- [ ] Plan Unknown #10 (Ghostty env 전파) — V8 수동 검증

**미해결 3건은 Plan Unknowns에 명시되어 있으며 V1/V8 실기 테스트에서 확정**.

---

## 부록 A. 구현 시작 순서 (Plan 체크리스트 대응)

1. `src/preload/types.ts` — 타입 먼저
2. `src/main/security/validators.ts` — zod 추가
3. `src/renderer/state/store.ts` — Composer 필드/액션
4. `src/preload/index.ts` — `composer`, `codex` 네임스페이스
5. `src/main/services/context-builder.ts` — 신규
6. `src/main/services/codex-launcher.ts` — 신규
7. `src/main/services/claude-launcher.ts` — `openInClaude` 옵션 확장
8. `src/main/ipc/composer.ts` — 신규 핸들러
9. `src/main/index.ts` — 등록 + before-quit + 기동 cleanup + prefs 키
10. `src/renderer/components/ui/{Checkbox,Gauge,Toast}.tsx` — 프리미티브 3종
11. `src/renderer/components/ComposerChip.tsx`, `ComposerTray.tsx`, `ComposerOnboarding.tsx`
12. `src/renderer/components/FileTree.tsx` + `ProjectCard.tsx` + `InboxItem.tsx` 체크박스 통합
13. `src/renderer/App.tsx` — `<ComposerTray/>`, `<ToastHost/>`, stale cleanup useEffect, 온보딩 렌더
14. V1~V11 수동 검증 + `pnpm vitest` 통과 + Nova Evaluator PASS 후 커밋

---

**Next**: `/nova:auto "markwand-context-composer"` 또는 Sprint별 `/nova:run` 수동 운영.
