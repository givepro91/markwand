---
slug: md-viewer-mvp
mode: deep
iterations: 1
created: 2026-04-20
status: planned
---

# md-viewer MVP v0.1 — AI 산출물 큐레이터

> **Mode**: deep
> **Iterations**: 1 (Explorer×3 → Synth → Critic → Refiner)
> **Pipeline next**: `/nova:auto`가 이 Plan을 기반으로 Architect → Dev → QA → Fix를 진행한다.

## Context

여러 프로젝트(`~/develop/*`)에서 Claude Code로 작업하며 누적되는 기획·설계·CLAUDE 문서가 폴더마다 흩어져 **있는지조차 잊힌다.** 사용자(jay)는 "문서가 있어도 안 본다 → 결국 Claude한테 또 묻는다"는 페인포인트를 자각했고, VSCode/Obsidian 같은 도구는 단일 vault·편집 중심이라 이 시나리오에 맞지 않는다.

- **사용자 환경**: macOS, Apple Silicon, Claude Code 다중 프로젝트, Nova 워크플로우 사용 중
- **점진적 배포**: v0.1 본인용 → v0.2 팀원 공유(spacewalk) → v1.0 오픈소스
- **비용 제약**: 0원 유지 (코드사이닝 $99/년은 v1.0에서 결정)
- **현재 상태**: `/Users/jay/develop/md-viewer`는 빈 폴더, NOVA-STATE.md만 존재

## Problem

기존 도구가 풀지 못하는 3가지:

1. **발견성** — md가 어디 있는지 모름. 수십 개 프로젝트에 산재.
2. **큐레이션** — 너무 많아서 뭘 봐야 할지 모름. "이번주에 뭐가 새로 생겼지?" 답이 없음.
3. **휘발성** — 한 번 봐도 다시 안 옴. 결국 Claude에게 다시 물어봄.

핵심 가설: **"AI 산출물의 라이프사이클(생성 → 발견 → 소비 → 재진입)을 1급 시민으로 다루는 뷰어"가 없다.**

## Solution

### 정체성

**AI 산출물 큐레이터** — Obsidian이 "내 vault 안에서 글쓰기"라면, 이 앱은 "내 작업 공간 전체의 AI 산출물을 발견·소비·재진입"한다.

### MVP v0.1 기능 (5개)

| # | 기능 | 차별점 |
|---|------|--------|
| F1 | **계층적 워크스페이스** (Workspace > Project > Doc) | 사용자가 등록한 N개 루트, Project는 마커 자동 감지 |
| F2 | **3가지 뷰 모드** (All Projects / Inbox / Project View) | 카드·시간 그룹·트리뷰어를 단일 앱에서 |
| F3 | **Claude로 다시 보내기** (read → re-engage) | 워크플로우 클로저, 의존을 역이용 |
| F4 | **read-only 마크다운 뷰어** (GFM·코드·mermaid·다크모드) | 깔끔하고 가벼운 소비 경험 |
| F5 | **최근 워크스페이스 영속화** | 재실행 즉시 컨텍스트 복원 |

### 기술 스택 (확정)

```
Electron 33 (latest stable, 2026-04, Wave 1 Dev 결정)
  + electron-vite (alex8088, v6 beta)
  + React 19 + TypeScript 5.x
  + electron-builder (macOS unsigned .dmg)

보안:
  contextIsolation: true, sandbox: true,
  nodeIntegration: false, webSecurity: true
  preload + contextBridge + zod 검증된 타입드 IPC

파일시스템:
  fast-glob (초기 스캔, 청크 스트리밍 IPC)
  chokidar v4 (.md 필터, 디바운스 150ms, awaitWriteFinish)
  electron-store v10 (영속화, ESM 동적 import 패턴)

렌더링:
  react-markdown v10 + remark-gfm + remark-breaks + rehype-sanitize
  @shikijs/rehype dual theme (github-light/dark, CSS 변수 즉시 스왑)
  mermaid v11 (lazy + IntersectionObserver)
  vanilla CSS + 변수 (Tailwind 미사용)

UX:
  react-arborist (트리, 15KB gzip, ARIA tree)
  자체 CSS Grid auto-fill (카드)
  Linear식 4단 시간 그룹핑 (인박스)
```

### 화면 구조

```
┌─────────────────────────────────────────────────┐
│ [Workspace ▾]  [📊 All|📥 Inbox|📁 Project]  🌓 │
├─────────────────────────────────────────────────┤
│                                                 │
│   (선택한 뷰 모드에 따라 화면 전환)             │
│                                                 │
└─────────────────────────────────────────────────┘
```

- **All Projects**: CSS Grid `auto-fill minmax(280px, 1fr)`. 카드 = 프로젝트명/마커 뱃지/md 개수/최근 수정/상위 3개 md 파일명/[열기]
- **Inbox**: 4단 그룹(Today/Yesterday/This Week/Earlier). 본 항목 opacity 0.6
- **Project View**: 좌측 react-arborist 트리(폴더+md만, ignore 적용) + 우측 뷰어

### 보안 게이트 (Critic P0 반영)

**모든 IPC 핸들러는 다음 3단 검증을 통과해야 한다:**

```ts
// 1. zod schema (사이즈/길이 상한 명시)
const PathInput = z.string().max(512)
const PathArrayInput = z.array(PathInput).max(200)

// 2. path allowlist (등록된 워크스페이스 루트의 하위만)
function assertInWorkspace(p: string, workspaceRoots: string[]) {
  const abs = path.resolve(p)
  if (!workspaceRoots.some(root => abs.startsWith(path.resolve(root) + path.sep)))
    throw new Error('PATH_OUT_OF_WORKSPACE')
}

// 3. custom protocol app:// — normalize → resolve → prefix check 3단
protocol.handle('app', (req) => {
  const url = new URL(req.url)
  const decoded = decodeURIComponent(url.pathname)
  const normalized = path.normalize(decoded)
  const resolved = path.resolve(normalized)
  assertInWorkspace(resolved, workspaceRoots)
  return net.fetch(pathToFileURL(resolved).toString())
})
```

**rehype-sanitize 정책**: mermaid는 remark 단계에서 `<svg>`로 변환 후 sanitize 통과. `<div class="mermaid">`를 sanitize 화이트리스트에 넣지 않는다.

### Claude CLI 호출 안전 패턴 (Critic P0/P1 반영)

```ts
// macOS GUI 앱 PATH 주입 (P1: D1)
function ensureLoginPath() {
  if (process.platform !== 'darwin') return
  if (process.env._PATH_INJECTED) return
  try {
    const out = execSync(`/bin/bash -lc 'echo $PATH'`, { encoding: 'utf8' })
    process.env.PATH = out.trim()
    process.env._PATH_INJECTED = '1'
  } catch { /* fallback to system PATH */ }
}

// AppleScript path escape (P0: D2) — quoted form of POSIX file 사용
async function openInClaude(absDir: string, terminal: string) {
  if (process.platform !== 'darwin') {
    return { ok: false, reason: 'PLATFORM_UNSUPPORTED' }  // v0.2 win/linux 분기 자리
  }
  const claudePath = await which('claude').catch(() => null)
  if (!claudePath) return { ok: false, reason: 'CLAUDE_NOT_FOUND' }

  // execa로 osascript 직접 호출, 인자는 ENV로 전달 (문자열 보간 회피)
  const script = `
    set p to system attribute "TARGET_DIR"
    tell application "${terminal}"
      activate
      do script "cd " & quoted form of p & " && claude"
    end tell
  `
  await execa('osascript', ['-e', script], { env: { ...process.env, TARGET_DIR: absDir } })
  return { ok: true }
}

// 미설치 → 재시도 흐름 (P1: D3)
// UI: "claude를 찾을 수 없습니다 → [설치 가이드] [다시 확인]" 모달
```

### 데이터 흐름

```
[main] electron-store         ← workspaces/preferences 영속화
   ↓
[main] workspace.scanProjects(rootIds)  → 마커 8종 검사, depth=2
   ↓
[main] workspace.scanDocs(projectId)    → fast-glob, 청크 스트리밍 IPC
   ↓
[main] chokidar.watch(workspaceRoots)   → fs:change 디바운스 150ms 후 푸시
   ↓
[renderer] tanstack/zustand 상태 → 뷰 모드별 컴포넌트 → react-markdown 뷰어
```

### electron-store schema

```ts
{
  workspaces: { id, name, root, addedAt, lastOpened }[],
  activeWorkspaceId: string | null,
  viewMode: "all" | "inbox" | "project",
  theme: "light" | "dark" | "system",
  readDocs: { [absPath]: number /* timestamp */ },  // 6개월 이상 GC (v0.2)
  treeExpanded: { [projectId]: string[] },          // depth 2까지만 복원 (P1: B4)
  sortOrder: "recent" | "name" | "count",
  terminal: "Terminal" | "iTerm2" | "Ghostty"
}
```

> **electron-store v10 ESM 호환** (P0: F2): main process에서 `await import('electron-store')` 동적 import 사용. electron-vite config의 `build.rollupOptions.external`에 `electron-store` 명시. 빌드 타임에 `require() of ES module` 에러 회피.

## Risk Map

| ID | 영역 | 위험 | 영향 | 대응 |
|----|------|------|------|------|
| R1 | 보안 | path allowlist 누락 시 임의 파일 읽기 | High | IPC 3단 검증 강제(zod→assertInWorkspace→protocol normalize), Sprint S1에서 utility 모듈로 분리 |
| R2 | 빌드 | electron-store v10 ESM ↔ electron-vite CJS 충돌 | High | 동적 import + rollupOptions.external 명시. Sprint S1 첫 PR에서 빌드 검증 |
| R3 | 보안 | osascript 인자 escape 취약 | High | quoted form of POSIX file + 환경변수 전달 패턴 사용, 직접 보간 금지 |
| R4 | 성능 | 5천+ md 초기 스캔 블로킹 UX | Medium | 청크 스트리밍 IPC, 첫 청크 즉시 렌더, 로딩 인디케이터 |
| R5 | 성능 | chokidar 5천 watch 메모리 미실측 | Medium | v0.1 출시 전 `500dirs×10files` 시나리오 RSS 측정. 초과 시 watch 범위 limit |
| R6 | UX | macOS Sequoia Gatekeeper unsigned dmg 차단 | Medium | README에 "우클릭 → 열기" 또는 `xattr -d` 가이드. 팀원 공유 전 1인 검증 |
| R7 | UX | mermaid 다크 전환 시 큰 다이어그램 깜빡임 | Low | 전환 중 skeleton, 노드 50+ 다이어그램 시 사용자 인지 |
| R8 | UX | claude CLI 미설치/PATH 누락 | Medium | login PATH 주입 + "다시 확인" 버튼 + 설치 가이드 모달 |
| R9 | 일관성 | read-only 강조하면서 readDocs 쓰기 | Low | 명시적 "UI 상태 저장은 별도 범주" 선언, 설정에서 추적 OFF 옵션 (v0.2) |
| R10 | 호환 | v0.2 win/linux 빌드 시 path/터미널 분기 누락 | Medium | v0.1부터 `process.platform === 'darwin'` 가드 + win/linux 스텁 주석 |

## Unknowns

다음은 v0.1 구현 중 실측·검증 후 결정한다:

- **U1**: chokidar v4 + macOS FSEvents에서 `500 dirs × 10 files` 시 RSS 증가량. (S2 종료 전 벤치마크)
- **U2**: react-arborist의 5천 노드 + treeExpanded 복원 시 초기 렌더 시간. (S3 중반 측정)
- **U3**: Shiki dual theme fine-grained bundle의 실제 번들 크기 (~50KB 목표 vs 1.2MB full). (S3 시점)
- **U4**: macOS Sequoia에서 unsigned dmg가 "우클릭→열기"로 통과하는지 vs `xattr` 필요 여부. (v0.1 빌드 직후 1차 검증)
- **U5**: electron-vite v6 beta + electron-store v10 ESM 빌드 안정성. (S1 첫 끝에 PoC)

## Verification Hooks

각 스프린트 종료 시 다음을 확인한다:

| Sprint | 빌드 | 타입 | 보안 | 동작 | 성능 |
|--------|------|------|------|------|------|
| S1 | `pnpm build` 통과, dmg 생성 | tsc strict, no any | preload IPC zod·allowlist 단위 테스트 | 빈 워크스페이스로 앱 실행 OK | — |
| S2 | 동일 | 동일 | path traversal 시도 5건 차단 확인 | 워크스페이스 등록 → 프로젝트 자동 감지 → md 리스트 | 500dirs×10files RSS 측정 (U1) |
| S3 | 동일 | 동일 | rehype-sanitize XSS 시도 차단 | Project View 트리 + 뷰어, mermaid·코드 렌더 | 5k 노드 트리 초기 렌더 < 500ms (U2) |
| S4 | 동일 | 동일 | — | All Projects 카드 + Inbox 4단 그룹 + 다크 토글 | — |
| S5 | dmg 첫 실행 OK (U4) | — | osascript escape 단위 테스트 | "Open in Claude" 골든 패스 + 미설치 폴백 | — |

## Sprint 분할

복잡(8+ 파일, 새 프로젝트 셋업) → 5개 스프린트. 각 스프린트 종료 시 Evaluator(독립 서브에이전트) 필수.

### S1 — Foundation (셋업 + 보안 게이트)
**파일 수**: ~10
- electron-vite 프로젝트 셋업, package.json/tsconfig/vite.config
- main/preload/renderer 3-entry 구조
- 보안 설정 (contextIsolation/sandbox/CSP) 명시
- IPC utility (zod schemas, assertInWorkspace, custom `app://` 핸들러)
- electron-store 동적 import PoC
- README 초안 + macOS Gatekeeper 우회 가이드 자리

**Verdict 기준**: 빈 앱 실행, IPC 보안 단위 테스트 통과, dmg 빌드 성공

### S2 — Workspace & Filesystem
**파일 수**: ~8
- workspace.scanProjects (마커 8종, depth 2)
- workspace.scanDocs (fast-glob, ignore 14종, 청크 스트리밍)
- chokidar.watch (디바운스 150ms, .md 필터)
- 워크스페이스 등록 UI (dialog.showOpenDialog)
- electron-store schema·마이그레이션
- (벤치) U1 측정 스크립트

**Verdict 기준**: 워크스페이스 등록 → 프로젝트 N개 자동 감지 → md 리스트 IPC 청크 수신 OK

### S3 — Project View + Markdown Viewer (핵심 가치)
**파일 수**: ~10
- react-arborist 트리 (treeExpanded 복원, depth 2 제한)
- react-markdown v10 + remark-gfm/breaks + rehype-sanitize
- @shikijs/rehype dual theme (CSS 변수 셀렉터)
- mermaid v11 lazy + IntersectionObserver
- 외부 링크 shell.openExternal, 내부 .md 라우팅, 이미지 `app://`

**Verdict 기준**: 단일 프로젝트 트리 + md 클릭 → 코드/머메이드 정상 렌더, 5k 노드 시뮬 초기 렌더 < 500ms

### S4 — All Projects + Inbox + Dark Mode
**파일 수**: ~7
- All Projects 카드 그리드 (CSS Grid auto-fill, 정렬 토글)
- Inbox 4단 시간 그룹 + readDocs dim
- 다크/라이트 토글 (nativeTheme.themeSource + html[data-theme] + Shiki/mermaid 테마 동기)
- 뷰 모드 스위처 + URL/state 영속

**Verdict 기준**: 3가지 뷰 전환 OK, 다크 토글 시 코드/머메이드 동기화

### S5 — Claude CLI + Polish + Release Prep
**파일 수**: ~5
- ensureLoginPath (macOS shell PATH 주입)
- openInClaude (osascript + execa + quoted form, 터미널 선택)
- "claude not found" 모달 + 다시 확인 버튼
- platform guard 주석 (win/linux 스텁 자리)
- README 완성 + scripts: `dev`, `build`, `dist:mac`
- 첫 unsigned dmg 1인 실행 검증 (U4)

**Verdict 기준**: 골든 패스 (워크스페이스 → 프로젝트 → 문서 → "Open in Claude" → 터미널에서 claude 실행) 통과

## 구현 순서 (DAG)

```
S1 (Foundation) ───┬─→ S2 (Workspace/FS)
                   │
                   └─→ S3 (Viewer) ──→ S4 (All/Inbox/Dark)
                                   │
                                   └─→ S5 (Claude CLI/Release)
```

S2와 S3는 IPC 계약 합의 후 병렬 가능. v0.1은 순차 진행 (단일 Dev 에이전트).

## 빌드/검증 명령

```bash
# 개발
pnpm dev                # electron-vite dev (HMR)

# 빌드
pnpm build              # main + preload + renderer 번들
pnpm typecheck          # tsc --noEmit
pnpm lint               # eslint

# 배포 (macOS unsigned)
pnpm dist:mac           # electron-builder --mac --publish never

# 첫 실행 (Gatekeeper 우회)
xattr -d com.apple.quarantine "/Applications/md-viewer.app"
# 또는 우클릭 → 열기 → "그래도 열기"
```

## v0.2+ 보류 항목 (명시)

| 항목 | 이유 |
|------|------|
| 글로벌 풀텍스트 검색 | 인덱싱 비용·UX 별도 설계 필요 |
| frontmatter 자동 태깅 | v0.1 인박스만으로 발견성 충분 가설 검증 후 |
| 문서↔코드 sync 체크 | 별도 인프라(git diff 분석) |
| .gitignore 존중 (다단계 머지) | ignore 패키지 통합·테스트 비용 |
| Windows/Linux 빌드 | osascript/path 분기 추가, GitHub Actions matrix |
| 코드사이닝 ($99/년) | v1.0 오픈소스 시점 결정 |
| 모노레포 정밀 인지 (turbo/lerna) | v0.1 마커 기반으로 충분 |
| KaTeX 수학식 | 번들 비용 vs 사용 빈도 |
| Claude `--resume` 세션 복원 | claude CLI API 안정화 후 |
| readDocs GC + 추적 OFF 옵션 | 일관성 모순 피드백 수용 |
| 설정 export/import | 팀원 온보딩 단계에서 |

## 참고 (Critic 우선순위 매핑)

- **P0 반영**: A1·A2·A3 (IPC 3단 검증), D2 (osascript escape), F2 (electron-store ESM)
- **P1 반영**: B2·B3 (청크 스트리밍), B4 (treeExpanded depth 제한), D1 (PATH 주입), D3 (다시 확인 버튼), F1 (Gatekeeper README)
- **P1 부분 보류**: E1 (3가지 뷰 동시 구현 유지 — 정체성 핵심이라 양보 불가, 대신 S3에서 Project View를 먼저 완성), E2 (Open in Claude 유지 — 사용자가 v0.1 차별화로 명시)
- **P2 (v0.2)**: B1 (chokidar 벤치는 U1로 추적), C 시리즈, E3, F3·F4
