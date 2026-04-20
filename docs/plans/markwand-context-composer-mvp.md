---
slug: markwand-context-composer-mvp
mode: deep
iterations: 1
created: 2026-04-20
refined: 2026-04-20
status: planned
---

# Context Composer MVP — markwand v0.2 플래그십

> **Mode**: deep
> **Iterations**: 1 (Explorer×3 → Synth → Critic → Refiner)
> **Refiner 반영**: Critic(CONDITIONAL PASS) Top-5 지적 + 관련 MINOR 수렴.
> **Design**: designs/markwand-context-composer.md
> **Pipeline next**: `/nova:auto` 또는 Sprint별 `/nova:run`으로 구현 진입.

## Context

markwand v0.1은 "AI 산출물 뷰어"로 포지셔닝했다. 여러 프로젝트에 흩어진 `.md`를 발견·소비하는 기능은 이미 동작한다. 하지만 사용자는 읽은 뒤 **"이걸 어떻게 다시 Claude에 물려서 작업을 이어가지"** 라는 지점에서 반복적으로 컨텍스트를 수동 조립하고 있다. plan.md 하나, design.md 하나, NOVA-STATE.md 하나를 `cat` 또는 복사-붙여넣기로 조합해서 `claude` CLI에 전달하는 루틴이 사용자의 하루에 수십 번 반복된다.

이 페인포인트는 시장 전체의 공백이기도 하다. 리서치 결과:

- **Cursor**: `@file` 멘션은 있지만 "Context Groups"(여러 파일 번들 저장) 요청이 4년째 미해결. 에디터 안에 갇힘.
- **ChatGPT Projects**: 파일 업로드형 RAG. 10~20개 상한, 단일 프로젝트 감옥, 로컬 FS 단절.
- **aider / Claude Code CLI**: `/add` 명령, `@path` 참조는 있지만 터미널 텍스트 UI라 여러 파일 훑으며 고르는 UX는 없음.
- **Repomix / files-to-prompt**: CLI 기반 조합기. "무엇이 들어갔는지" 시각 피드백 없음.

markwand의 포지션은 **"로컬 파일 시스템 전역을 가로지르는 뷰어 + Composer Tray + CLI 런처"**. Cursor가 포기한 multi-project context, Claude Projects가 포기한 로컬 파일, CLI 도구가 포기한 GUI 피드백을 동시에 차지할 수 있는 자리다.

- **사용자 환경**: macOS, Apple Silicon, Claude Code + Codex 이중 사용, 42개 이상의 `~/develop/*` 프로젝트
- **현재 markwand 상태**: v0.1 MVP 배포 완료(`db75280`), workspace container/single 모드 추가(`73863cd`), ClaudeButton으로 단일 프로젝트 디렉토리만 Claude에 전달 가능
- **제품 변곡점**: 이 기능 이후 markwand는 "뷰어"가 아니라 **"AI 작업의 엔트리 포인트"**로 재포지셔닝된다. 사용자가 하루를 markwand를 열며 시작하게 만드는 것이 v0.2의 목표.

## Problem

뷰어에 머무르는 한 markwand는 "한 번 쓰고 잊는 도구"다. 해결해야 할 구체적 문제:

1. **컨텍스트 조립 노동**: 사용자가 plan.md + design.md + NOVA-STATE.md를 매번 수동으로 AI에 먹임. 복사, 창 전환, 붙여넣기, 따옴표 깨짐, 파일 경로 누락 등 마이크로 에러가 반복.
2. **투명성 부재**: 선택한 파일이 **얼마나 큰 컨텍스트**인지 실행 전에 모름. Claude 200k/1M 임계를 맞았는지 응답이 끊어져야 알게 됨.
3. **번들 재사용 불가**: "스프린트 회고용 3개 세트", "Nova 온보딩용 5개 세트" 같은 반복 조합을 매번 새로 만들어야 함. Cursor의 4년 묵은 요청과 동일한 페인.
4. **크로스 프로젝트 단절**: `project-A/plan.md` + `project-B/design.md`를 한 컨텍스트로 묶고 싶은 시나리오가 어떤 도구에도 없음.
5. **Codex 2중 지원 결여**: Claude Code와 Codex를 병행하는 사용자가 동일 컨텍스트로 두 도구에 대칭적으로 접근할 UX가 없음.

### 명시적 비목표 (Non-goals)

- **WYSIWYG 편집**: markwand는 read-only 뷰어 포지션 유지. 편집은 Cursor/Zed 영역.
- **AI 응답을 markwand 내부 표시**: Composer는 **런처**다. 응답은 터미널에서 본다. 인터페이스를 추가하지 않음 — MVP 범위 폭발 방지.
- **웹/클라우드 동기화**: 로컬 전용. Preset 파일도 로컬 electron-store.
- **링크 재귀 자동 확장**: 선택 파일이 참조하는 `[](../other.md)`를 자동으로 포함하지 않음. 1-depth **프롬프트** UI만 제공(Phase 4).
- **MCP 서버 노출**: 기술적으로 더 깔끔하지만 MVP 대비 구현 비용 과다. v2로 이월.
- **토큰 정확 카운트**: tiktoken/API 호출 없이 `ceil(bytes/3.5) × 1.35`(Opus 4.7 토크나이저 증가율 보정) 휴리스틱만.

## Solution

### 정체성

**"선택 → 조합 → 발사"**. markwand의 파일 트리와 프로젝트 뷰에 체크박스를 얹고, 하단에 항상 떠 있는 **Composer Tray**가 선택된 파일들을 칩 + 토큰 게이지로 보여준다. 한 번 누르면 임시 `.md`로 concat되어 `claude "@/path/to/ctx.md" --add-dir <ctx-dir>` 또는 `codex exec "..." < /path/to/ctx.md` 형태로 터미널에 발사된다.

### 핵심 설계 결정

| 결정 | 근거 |
|---|---|
| **전역 선택 상태** (Zustand `selectedDocPaths: Set<string>`) | 크로스 프로젝트가 차별점이다. 프로젝트별 스코프는 기능을 죽인다. |
| **Set 불변 교체** (`set((s) => ({ selectedDocPaths: new Set([...s.selectedDocPaths, path]) }))`) | Zustand shallow equality는 reference로 비교. `.add()` mutate 시 리렌더 실패. 구현 시 이 패턴 강제. |
| **Composer Tray는 항상 하단 고정 + 수동 접기** (selectedCount > 0일 때 노출, × 버튼으로 collapse, 선택은 유지) | 뷰가 바뀌어도 선택이 유지됨을 가시화. Send 후에도 자동으로 닫지 않음 — 이어지는 선택 가능. |
| **Send 후 선택 유지(기본) + "전송 후 자동 Clear" 설정 토글** | 두 워크플로(연속 조합 / 한 번 보내고 끝)을 모두 커버. 기본은 유지, prefs로 반전 가능. |
| **동일 세션 중복 Send = 새 창 강제 개방** | AppleScript `do script`에 `activate new window` 플래그 명시. 기존 Claude 대화에 초기 프롬프트 섞여 들어가는 사고 방지. |
| **임시 파일 + `@` 참조 주입** (AppleScript 초기 프롬프트 확장) | 리서치 결론. `--context` 플래그 없음, stdin은 TUI 충돌, `@file`이 공식 안정 경로. |
| **`--add-dir` 포함 여부는 V1 검증 후 결정** | `@/absolute/path.md`만으로 Claude Read 툴이 접근 가능한지(Unknown #8) 불확정. V1에서 `--add-dir` 없이 시도 → 실패 시만 추가. |
| **임시 파일 TTL 기본 600초(10분) + 앱 종료 시 전량 삭제** | 120초는 "창 열고 자리 비움" 시나리오에서 `@` 참조 실패. Claude가 Read는 사용자 첫 입력 시점에 일어나므로 여유 필요. Critic CRITICAL 반영. |
| **stdin 파이프는 Codex `exec` 비대화형 전용** (`codex exec "..." < tmp.md`) | Claude는 대화형 TUI에서 stdin 불가. Codex `exec`는 비대화형으로 stdin 공식 지원. **UI 레이블 "Send to Codex (단발 응답)"**, 툴팁 "대화형 세션이 아닌 비대화형 `codex exec` 단발 실행". |
| **토큰 추정은 휴리스틱** (`ceil(bytes/3.5) × 1.35`) | tiktoken은 Claude에 부정확, API는 네트워크 비용. MVP는 상한 추정으로 충분. |
| **토큰 초과 모달에 "이번 세션에서 다시 묻지 않음" 체크박스** | 대용량 컨텍스트를 자주 쓰는 파워 유저 마찰 감소. sessionStorage로 유지. |
| **Preset은 electron-store에 로컬 저장** | `Workspace.mode` 추가와 동일 migration 패턴. 외부 동기화 제외. |
| **링크 확장은 1-depth 프롬프트만** | 자동 재귀는 워크스페이스 폭발 위험. 사용자가 명시적으로 승인. |
| **MCP 경로 v2 이월 근거**: MVP 대비 MCP 서버 스폰 + `resources/read` 구현 + 핸드셰이크 + 자식 프로세스 관리 약 +400~600 LOC 추가. AppleScript 경로는 기존 launcher 확장 +50 LOC. 10배 이상 비용 차이. | 리서치 결과 정량 비교. MVP 검증 후 v2에서 MCP가 UX를 의미있게 개선하는지 재판단. |

### 기능 범위 (Phase 1~4)

MVP는 **Phase 1 + Phase 2**. Phase 3·4는 v0.2.1/v0.2.2로 분리한다.

| Phase | 기능 | 사용자 가치 | 릴리스 | T-shirt |
|---|---|---|---|---|
| **P1** | 체크박스 선택 + Composer Tray(칩·게이지·Clear·접기) + Send to Claude Code + **온보딩(첫 실행 툴팁)** | 하루에 수십 번 반복되는 컨텍스트 조립 노동 제거 | **v0.2.0 MVP** | L(2~3일) |
| **P1.5** | **"마지막 선택 복원"** (앱 재시작 시 직전 선택 복구, prefs로 저장) | Preset 전면 없이도 재사용 UX 한 단계 개선. Critic "반쪽 MVP" 우려 완화의 최소 조치. | **v0.2.0 MVP** | XS(0.5일) |
| **P2** | Send to Codex (비대화형 `codex exec` 파이프) + UI 단발 응답 레이블 | 이중 도구 사용자 대칭 지원 | **v0.2.0 MVP** | S(1일) |
| P3 | Preset 저장/불러오기 (electron-store `composerPresets`) | 반복 조합 재사용 ("sprint-retro" 한 클릭) | v0.2.1 | M(1.5일) |
| P4 | 링크 1-depth 자동 확장 프롬프트 ("3 linked docs detected — include?") | Obsidian 선행 UX 이식 | v0.2.2 | S(1일) |

MVP(P1+P1.5+P2) 총 예상: **3.5~4.5일**. Evaluator 검증 루프 포함 시 5~6일.

### 아키텍처 — 데이터 흐름

```
[User] FileTree checkbox → store.toggleDocSelection(absPath)
                        ↓  (Set 불변 교체: new Set([...prev, path]))
[Store] selectedDocPaths: Set<string> (renderer/state/store.ts)
                        ↓
[UI] ComposerTray: chips + Math.ceil(Σbytes/3.5)×1.35 게이지 표시 + [×접기][Clear][Send]
                        ↓
[User] Send to Claude / Send to Codex (단발 응답) 버튼
                        ↓
[IPC] window.api.composer.send({ paths, target: 'claude'|'codex', projectDir })
                        ↓
[Main] src/main/ipc/composer.ts:
        1. 각 path validators.assertInWorkspace (workspace 밖 거부)
        2. fs.readFile 병렬 → frontmatter + 본문 + "---\n\n# <rel-path>\n\n" 헤더로 concat
        3. writeFile(<userData>/context/ctx-<uuid>.md), perm 0600
        4. launcher에 { cwd: projectDir, contextFile: path, target } 전달
        5. TTL 타이머 등록 (600초 후 unlink, 실패 무시)
                        ↓
[Launcher] src/main/services/claude-launcher.ts 확장:
        - Claude: TARGET_DIR + CONTEXT_FILE env, do script "cd $TARGET_DIR && claude \"@$CONTEXT_FILE\""
                  (필요 시 `--add-dir $CONTEXT_DIR` 추가 — V1 검증 후 결정)
        - Codex:  do script "cd $TARGET_DIR && codex exec \"이 파일 기반으로 작업해줘\" < $CONTEXT_FILE"
        - AppleScript: Terminal.app `do script` without `in window 1` → **새 창** 강제
                       (기존 front window 주입 패턴을 Composer 전용으로 override)
                        ↓
[Terminal] Terminal.app / iTerm2 / Ghostty 새 창에서 AI 실행
                        ↓
[Cleanup paths]
        - 정상: 600초 TTL setTimeout → unlink
        - 앱 종료: before-quit 훅에서 <userData>/context/*.md 전량 삭제
        - 앱 기동: 1시간 이상 묵은 파일 선제 삭제 (지난 크래시 잔해)
```

**Protocol allowlist 주석(Critic CRITICAL #1 반영)**: 애초에 context 파일은 markwand가 app:// 으로 서빙하지 않는다(Claude가 fs로 직접 Read). 따라서 `protocol.ts`의 `workspaceRoots` 확장은 **불필요**. Plan 초안의 `setProtocolContextRoot` / `context-allowlist.ts` 제안은 철회. workspace allowlist는 그대로 두고 context 디렉토리는 별도 관리.

### 컴포넌트 인벤토리

**신규 파일 (10개)**

| 파일 | 책임 |
|---|---|
| `src/main/ipc/composer.ts` | `composer:send`, `composer:estimate-tokens` IPC 핸들러. before-quit 훅으로 잔해 cleanup |
| `src/main/services/context-builder.ts` | 선택 파일 읽고 concat → `<userData>/context/ctx-<uuid>.md` 반환. 600s TTL setTimeout. 기동 시 1h+ 파일 선제 삭제. |
| `src/main/services/codex-launcher.ts` | `openInCodex(ctxFile, projectDir, terminal)` — claude-launcher 대칭. `which codex` 검출. |
| `src/renderer/components/ComposerTray.tsx` | 하단 고정 bar. 칩·게이지·Send·**×접기**·Clear. selectedCount===0일 때 collapse. |
| `src/renderer/components/ComposerChip.tsx` | 선택된 단일 문서 칩 (파일명, × 제거, 호버 시 절대경로 툴팁) |
| `src/renderer/components/ComposerOnboarding.tsx` | 첫 실행 시 FileTree 위에 "☑ 체크박스로 여러 파일 선택 → AI에 전송" 말풍선. prefs로 1회만. |
| `src/renderer/components/ui/Checkbox.tsx` | 체크박스 프리미티브 (Button 스타일 컨벤션, aria-checked, space 키) |
| `src/renderer/components/ui/Gauge.tsx` | 토큰 게이지 (0~200k 녹색, 200k~1M 노랑, >1M 빨강) |
| `src/renderer/components/ui/Toast.tsx` | 일시 알림 (런칭 성공, stale 경로 알림) `--z-toast` 활용 |
| `src/renderer/lib/tokenEstimate.ts` | `estimateTokens(bytes: number): number` 순수 함수. `ceil(bytes/3.5)*1.35`. |

**수정 파일 (9개)**

| 파일 | 변경 |
|---|---|
| `src/preload/types.ts` | `WindowApi.composer` 네임스페이스 타입, `ComposerSendInput`, `ComposerTarget = 'claude'\|'codex'` |
| `src/preload/index.ts` | `composer.send`, `composer.estimate`, `codex.check` 래퍼 |
| `src/main/index.ts` | `registerComposerHandlers()` + 기동 시 context/ cleanup + before-quit 훅 |
| `src/main/security/validators.ts` | `parseComposerSendInput` zod 스키마(paths 배열, target enum, projectDir) |
| `src/main/services/claude-launcher.ts` | `openInClaude`에 `contextFile?: string` 옵션. 있으면 `@path`를 초기 프롬프트로, **새 창 강제 개방** 모드. 없으면 기존 동작. |
| `src/renderer/state/store.ts` | `selectedDocPaths: Set<string>` + `toggleDocSelection`(**불변 교체 강제**) + `clearDocSelection` + `composerCollapsed: boolean`. `lastSelectedDocPaths` prefs 저장/복원 (P1.5). |
| `src/renderer/App.tsx` | `<main>` 하단에 `<ComposerTray>` flexShrink:0 고정 + Toast host |
| `src/renderer/components/FileTree.tsx` | react-arborist `FileTreeNode` 좌측에 Checkbox 삽입, `e.stopPropagation()` 버블 차단. 선택 시 subtle 배경색. |
| `src/renderer/components/ProjectCard.tsx` / `ProjectRow.tsx` / `InboxItem.tsx` | 좌측 체크박스 영역 (호버 시 노출, 선택 시 상시 노출) |

**철회**: `src/main/security/context-allowlist.ts` — Critic #1 반영. context 파일은 markwand app://로 서빙하지 않으므로 protocol allowlist 확장 불필요. Claude는 `--add-dir`(필요 시) 또는 absolute `@` 참조로 직접 fs 접근.

### 단계별 작업 (Phase 1)

1. **스토어 + IPC 골격** — `selectedDocPaths: Set` 추가(**`new Set` 불변 교체 패턴 강제**), `toggleDocSelection`/`clearDocSelection`, `composerCollapsed`, `composer:send` 스텁 IPC, `window.api.composer` preload. 단위 테스트 포함.
2. **Checkbox 프리미티브** — `ui/Checkbox.tsx`, Button 컨벤션 준수, `aria-checked`, space 키.
3. **FileTree/ProjectCard/InboxItem 체크박스 통합** — react-arborist 노드 커스터마이즈, `e.stopPropagation()` 버블 차단. 선택 시 상시 노출(호버-only 금지 — 발견성).
4. **토큰 추정 훅** — `lib/tokenEstimate.ts` 순수 함수 + renderer에서 fs.stat 경유 bytes 합산. 200ms debounce.
5. **Gauge/Chip 프리미티브** — `ui/Gauge.tsx`, `ComposerChip.tsx`.
6. **ComposerTray 조립** — chips + Gauge + Clear + × 접기 + Send to Claude. `selectedCount > 0 && !composerCollapsed` 조건. Send 후 기본 선택 유지, prefs `composerAutoClear=true` 시 Clear.
7. **ComposerOnboarding 말풍선** — 첫 실행 감지(`prefs.composerOnboardingSeen`), FileTree 위 오버레이.
8. **context-builder** — 임시 파일 concat, 각 파일 `"---\n\n# <workspace-relative-path>\n\n<content>"` 헤더. 파일 perm 0600. **600초 TTL** setTimeout + 앱 기동 시 1h+ 선제 삭제 + `before-quit` 훅 일괄 삭제.
9. **Claude launcher 확장** — `openInClaude(dir, terminal, { contextFile? })` 추가. `contextFile` 있으면 `@<abs>` 초기 프롬프트 + `--add-dir <ctx-dir>` 기본 포함(V1로 검증 후 필요성 결정, 안전 우선으로 기본 포함). AppleScript **새 창 강제 개방** 분기.
10. **stale 경로 방어** — workspace refresh `useEffect`에서 `selectedDocPaths` 필터. 누락 시 Toast.
11. **토큰 초과 모달** — 200k 임계 초과 시 "예상 X 토큰, 계속?" + 세션 dismiss 옵션.
12. **수동 통합 테스트 (V1·V4·V9·V10·V11)** — 실기 검증. 실패 시 즉시 Refiner 재진입.

### 단계별 작업 (Phase 1.5)

13. **마지막 선택 복원** — Send 성공 시 또는 앱 종료 시 `lastSelectedDocPaths: string[]`을 electron-store prefs에 저장. 앱 기동 시 stale 제거 후 복원. Toast "마지막 선택 N개 복원됨 [Clear]".

### 단계별 작업 (Phase 2)

14. **codex-launcher.ts** — `which codex` 검출(기존 `checkClaude` 패턴 카피). `openInCodex(dir, terminal, { contextFile, instruction })`. AppleScript `codex exec "<instruction>" < $CONTEXT_FILE`.
15. **Composer Tray "Send to Codex (단발 응답)" 버튼** — `codex:check` 결과로 enable/disable + 툴팁 "대화형 세션이 아닌 비대화형 `codex exec`".
16. **V2 통합 검증**.

## Risk Map

| 리스크 | 영향 | 가능성 | 대응 |
|---|---|---|---|
| **AppleScript 이스케이프 깨짐** (개행·따옴표 포함 프롬프트) | High (런칭 실패) | Medium | 프롬프트 인라인 금지. 항상 **임시 파일 경로만** 커맨드라인에 노출. env 패턴 유지. |
| **대화형 Claude가 `@` 참조를 안 읽음** | High (Phase 1 킬) | Low | 공식 문서 확인 완료 but 로컬 수동 검증 필수(V1). `--add-dir` 없이 → 있이 순서로 시도. |
| **임시 파일이 Claude Read 전에 cleanup** | High (런칭 후 응답 실패) | Medium→Low | TTL 120→**600초** 상향(Critic CRITICAL 반영). 앱 종료 시 before-quit에서 일괄 삭제. Claude가 Read 완료를 감지할 방법이 없으므로 시간만이 유일 방어선. |
| **동일 세션 중복 Send 시 기존 Claude 대화에 덮어쓰기** | High (사용자 당혹) | High | AppleScript `do script`에서 **새 창 강제 개방** 명시(`tell app "Terminal" to do script "..."` without `in window 1`). Composer 전용 launcher override로 기존 front-window 주입 동작과 분리. Critic MAJOR 반영. |
| **Zustand Set mutate in-place** (구현 실수) | High (리렌더 안됨) | Medium | 핵심 설계 결정표에 `new Set([...prev, path])` 패턴 강제 명시. Critic MAJOR 반영. Evaluator 체크 항목에 포함. |
| **Codex 비대화형 한계로 사용자 기대치 갭** | Medium (UX 혼란) | High | 버튼 레이블 "Send to Codex (단발 응답)" + 호버 툴팁 + 설정 페이지 설명 문서화. Critic MAJOR 반영. |
| **토큰 추정 오차** (Claude 4.7 토크나이저 35% 증가) | Medium (Surprise) | High | `× 1.35` 보정 + **보수적 상한 추정** 툴팁. 경고 임계(200k)를 여유 하향. "다시 묻지 않음" 옵션 포함(파워 유저 마찰 감소). |
| **첫 사용자가 기능을 못 찾음** (빈 상태 숨김 정책) | High (기능 사장) | Medium→Low | P1 범위의 `ComposerOnboarding` 말풍선(첫 실행 1회) + FileTree 체크박스는 호버가 아닌 상시 노출(발견성 우선). Critic MAJOR 반영. |
| **Ghostty/iTerm2에서 env 전파 실패** | Medium | Medium | 기존 `TARGET_DIR` 검증된 경로 재사용. 런칭 실패 시 fallback: 클립보드 복사 + 토스트 "수동 붙여넣기". |
| **Codex CLI 미설치** | Low (P2만 영향) | Medium | `which codex` 검출 → 버튼 비활성 + 설치 가이드 툴팁. |
| **선택 상태 폭발** (실수로 200개) | Medium | Medium | 게이지 빨강 임계 + "100개 이상 선택됨, 계속?" 확인 모달(세션 dismiss 가능). Clear 상시 노출. |
| **workspace 밖 파일 선택 시도** | Low (보안) | Low | `assertInWorkspace` 재사용. 거부 시 토스트. |
| **전역 선택과 refresh 충돌** (stale path) | Medium | High | workspace 재스캔 후 stale path는 자동 제거 + 토스트 "N개 문서 누락됨". `useEffect` selector로 정리. |
| **`--add-dir` 없이 `@absolute-path` 실패 가능성** | Medium (Phase 1 킬 보조) | Low | V1에서 검증. 실패 시 `--add-dir <userData>/context` 추가. 2단계 시도 전략을 launcher에 구현(1회 실패 감지 어려우므로 **기본 포함**하되 비활성 옵션 제공). |
| **Preset 경로 stale** (Phase 3만 해당) | Low | High | 절대 경로 기반. workspace 사라지면 "유실 문서 N개" 표시 + skip 옵션. |
| **링크 1-depth 확장이 사용자 기대치 넘음** | Low (P4만) | Medium | P4에서 재검토. MVP 범위에 영향 없음. |

## Unknowns

로컬 검증 없이는 확정 불가한 항목들:

1. **Claude Code 대화형 세션에서 초기 프롬프트 + `@file` 참조가 실제로 Read 툴을 트리거하는가?** 공식 문서상 지원이지만 실사용 확인 필요. `claude "@/path/to/file.md 이 내용 요약해줘"` 시나리오를 직접 돌려봐야 함.
2. **AppleScript `do script`의 문자열 길이 한계** — 선택 파일 경로가 길어져 커맨드 전체가 1KB 넘으면 ARG_MAX 또는 AppleScript 내부 한계에 걸릴 가능성. 임시 파일 경로만 전달하므로 실전에선 안전하다고 **추정**되나 미검증.
3. **Codex CLI의 대화형 TUI가 stdin 주입을 받는가?** 리서치 결과 `codex exec`(비대화형)만 공식 지원. `codex`(TUI)는 초기 프롬프트 주입 공식 경로 없음 — Phase 2는 **비대화형 전용**으로 결정했으나 사용자 UX 만족도 미지수(출력이 한 번에 쏟아짐).
4. **Ghostty에서 AppleScript env 전달 동작** — Terminal.app, iTerm2는 검증됨. Ghostty는 AppleScript 지원 초기 단계라 env 변수 전파가 기대대로 안 될 수 있음. 폴백 UX 필요.
5. **토큰 휴리스틱 오차율 상한** — `×1.35` 보정이 한국어·코드 블록 비중 높은 실제 markwand 산출물에 얼마나 맞는지. 실측 데이터 없음. 실제 배포 후 몇몇 파일을 수동 카운트 API로 검증해서 계수 조정 필요.
6. **gray-matter가 파싱 실패할 엣지 케이스** — YAML frontmatter가 깨진 문서를 포함할 때 context-builder가 throw하면 안 됨. 방어 코드 필요하지만 실패 케이스 예측 어려움.
7. **react-arborist에서 체크박스 이벤트 버블 제어** — 공식 문서상 노드 커스텀 렌더는 자유롭지만 `e.stopPropagation()`이 arborist 내부 선택/포커스와 충돌할지 미확인.
8. **`--add-dir` 없이 `@absolute-path`만으로 Read 툴이 접근 가능한가** — 리서치상 Claude의 Read는 세션 워킹 디렉토리 내 제한이 있을 수 있음. V1 수동 테스트로 확정. 기본 포함이 안전하나 빈 창 launcher 길이 낭비.
9. **Codex의 stdin 구성 형식** — `codex exec "instruction" < file` 시 stdin이 프롬프트 뒤에 `<stdin>` 블록으로 붙는지, 아니면 프롬프트를 대체하는지 버전별 동작. `codex exec -`과 행동 차이를 V2에서 확정.
10. **Ghostty의 AppleScript env 전파** — iTerm2/Terminal.app은 검증되지만 Ghostty는 미확인. 실패 시 폴백 필요.

## Verification Hooks

구현 검증은 독립 서브에이전트(Nova Evaluator)가 수행하지만, 사용자 수동 수행이 필요한 종단 검증:

각 V에 **[수동 MUST]** / **[자동 MUST]** / **[수동 권장]** 라벨. Critic MINOR 반영.

### V1 — 대화형 Claude 수동 테스트 (P1 필수) [수동 MUST]
```bash
# markwand UI에서 3개 .md 선택 → Send to Claude Code 클릭
# 터미널에서 Claude가 열림. 첫 메시지에 `@/path/...` 자동 삽입 확인.
# 이어서 "이 내용 요약해줘" 입력 → Claude가 3개 파일 모두 Read 툴로 읽는지 관찰.
```
**성공 기준**: 3개 파일 모두 실제 Read 호출 + 내용 기반 응답. 하나라도 빠지면 FAIL.

### V2 — 비대화형 Codex 수동 테스트 (P2 필수) [수동 MUST]
```bash
# markwand UI에서 2개 .md 선택 → Send to Codex 클릭
# 터미널에서 codex exec이 실행되며 stdin으로 임시 파일 주입
# 응답이 문서 내용 기반인지 확인
```
**성공 기준**: 응답이 두 문서 모두 참조. 파이프 실패 시 FAIL.

### V3 — 토큰 게이지 정합성 [수동 권장]
- 100KB .md 파일 1개 선택 → 게이지 표시값 ≈ 38k 토큰(= 100000/3.5×1.35)
- Claude `/tokens` 커맨드 또는 `anthropic.messages.countTokens` API 결과와 비교. **오차 ±30% 이내** 허용. 넘으면 계수 재조정.

### V4 — AppleScript 이스케이프 회귀 [수동 MUST]
- 파일 경로에 공백·한글·백틱 포함된 케이스: `~/"내 문서"/plan.md`, `./path with spaces/a.md`
- 런칭 성공 + Claude가 경로 그대로 Read. FAIL 시 quoted form 강화.

### V5 — Cleanup 주기 [자동 MUST]
- 유닛 테스트: `context-builder.ts`의 TTL setTimeout이 600초 후 unlink 호출, before-quit 훅이 `<userData>/context/*.md`를 전량 삭제, 기동 시 1시간 이상 묵은 파일 선제 삭제.
- Vitest 또는 간단한 node test로 충분. 수동 필요 없음.

### V6 — stale 경로 방어 [자동 MUST + 수동 MUST]
- 자동: workspace refresh 후 store에서 stale path가 `selectedDocPaths`에서 제거됨을 단위 테스트.
- 수동: 선택 파일 실제 FS 삭제 → markwand 새로고침 → 토스트 "1 doc no longer exists" 확인.

### V7 — 토큰 초과 확인 모달 [수동 MUST]
- 워크스페이스의 가장 큰 10개 `.md` 선택 → 게이지 빨강 + "예상 X 토큰, 계속?" 모달.
- "이번 세션에서 다시 묻지 않음" 체크 → 동일 세션 재선택 시 모달 재등장 안 함.
- 취소 시 런칭 안 됨.

### V8 — Ghostty 폴백 [수동 권장]
- Ghostty 지정 상태에서 런칭 실패 재현(의도적 mock 실패) → 클립보드 복사 + 토스트 "수동 붙여넣기" 노출.

### V9 — 동일 세션 중복 Send 새 창 개방 [수동 MUST]
- 첫 Send 후 Claude 창 유지 → 다른 파일 선택 후 2차 Send → **새 창** 개방 확인, 기존 대화에 섞이지 않음.

### V10 — ComposerTray 접기/Send 후 동작 [수동 MUST]
- Tray × 버튼 → 접힘(선택 상태 유지). 파일 추가 선택 시 다시 펼쳐짐.
- Send 성공 후 기본은 선택 유지. prefs에서 "전송 후 자동 Clear" 활성화 시 Send 후 Clear 동작.

### V11 — 첫 사용자 온보딩 [수동 MUST]
- 신규 설치 후 첫 실행 → FileTree 위에 "☑ 체크박스로 선택 → AI 전송" 말풍선. 닫기 후 prefs에 저장 → 재실행 시 미노출.

### 자동화 가능한 검증 (Nova Evaluator에게) [자동 MUST]
- IPC 핸들러의 zod 입력 검증 완전성
- `assertInWorkspace` 적용 누락 없는지
- cleanup setTimeout이 메모리 누수 없는 구조인지
- store `selectedDocPaths`가 `new Set(...)` 불변 교체 패턴을 쓰는지 (리렌더 보장)
- `toggleDocSelection` / `clearDocSelection` 호출 시 shallow equality로 selector 구독자 리렌더 1회 발생 검증
- `composer:send` 핸들러 내 `fs.writeFile` 경로가 반드시 `<userData>/context/` 하위인지

## 구현 순서 (Phase 1 체크리스트)

커밋 단위:

1. `feat(composer): store에 selectedDocPaths(Set, 불변 교체) + toggleDocSelection 추가`
2. `feat(composer): Checkbox/Gauge/Toast/ComposerChip 프리미티브`
3. `feat(composer): FileTree·ProjectCard·InboxItem 체크박스 통합 (발견성 — 상시 노출)`
4. `feat(composer): lib/tokenEstimate + token IPC (bytes 합산)`
5. `feat(composer): ComposerTray(칩·게이지·Send·× 접기·Clear)`
6. `feat(composer): ComposerOnboarding 첫 실행 말풍선`
7. `feat(composer): main ipc/composer + context-builder (600s TTL + before-quit)`
8. `feat(composer): claude-launcher 새 창 강제 개방 + @path 프롬프트 + --add-dir`
9. `feat(composer): stale 경로 방어 + 토큰 초과 모달(세션 dismiss)`
10. `feat(composer): 마지막 선택 복원 prefs (P1.5)`
11. `feat(composer): V1·V4·V9·V10·V11 수동 검증 통과 확인`

각 커밋 전 Nova Evaluator 독립 실행 필수.

## Refiner 반영 내역 (2026-04-20)

Critic verdict: CONDITIONAL PASS. 반영 항목:

- **[CRITICAL #1]** protocol allowlist 철회 — context 파일은 markwand app://로 서빙하지 않으므로 `setProtocolContextRoot` / `context-allowlist.ts` 전면 삭제. Claude fs 접근은 `--add-dir` 또는 `@absolute` 경로로.
- **[CRITICAL #2]** 임시 파일 TTL 120→600초 상향 + before-quit 훅 + 기동 시 1h+ 선제 cleanup. "창 열고 자리 비움" 시나리오 방어.
- **[MAJOR]** ComposerTray × 접기 버튼 + Send 후 동작(기본 유지, prefs 토글) 명시.
- **[MAJOR]** Codex 버튼 레이블 "Send to Codex (단발 응답)" + 툴팁. UI 카피 Phase 2 Task에 포함.
- **[MAJOR]** 동일 세션 중복 Send → 새 창 강제 개방. AppleScript launcher override.
- **[MAJOR]** Zustand Set 불변 교체 패턴 강제 명시(핵심 설계 결정표 + Evaluator 체크 항목).
- **[MAJOR]** ComposerOnboarding 첫 실행 말풍선. 체크박스 상시 노출로 발견성 우선.
- **[MINOR]** 토큰 초과 모달 "이번 세션에서 다시 묻지 않음" 옵션.
- **[MINOR]** MCP v2 이월 근거 정량화(+400~600 LOC vs AppleScript +50 LOC).
- **[MINOR]** Phase별 T-shirt 사이즈 추가(MVP 총 3.5~4.5일).
- **[MINOR]** "마지막 선택 복원"(P1.5) 추가로 Preset 없는 반쪽 MVP 우려 완화.
- **[MINOR]** `--add-dir` 필요성 Unknown #8 + V1 결정 로직(기본 포함).
- **[MINOR]** V1~V11 각 항목에 [자동 MUST]/[수동 MUST]/[수동 권장] 라벨.

## 파일 위치 요약

- 플랜: `docs/plans/markwand-context-composer-mvp.md` (이 문서)
- 설계: `docs/designs/markwand-context-composer.md` (`/nova:design` 후 생성)
- 구현 진입점: `src/main/ipc/composer.ts`, `src/main/services/context-builder.ts`, `src/renderer/components/ComposerTray.tsx`
- Codex: `src/main/services/codex-launcher.ts` (Phase 2)
- 기존 기반 (수정): `src/main/services/claude-launcher.ts`, `src/renderer/components/FileTree.tsx`, `src/renderer/state/store.ts`, `src/preload/index.ts`, `src/preload/types.ts`
- 참고 (미변경): `src/main/security/protocol.ts` — Refiner에서 allowlist 확장 철회 결정
