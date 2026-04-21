# Nova State

## Current
- **Goal**: v0.3 이미지 뷰어 MVP 완료 — Markwand를 "md 뷰어" → "Viewable Asset 큐레이터"로 확장
- **Phase**: v0.3 S1+S2 구현·독립 Evaluator 2회 통과·GUI 실측 PASS. app:// URL 계약 정정으로 SafeImage 잠재 버그 동반 해소.
- **Blocker**: none
- **Remote**: git@github-givepro91:givepro91/markwand.git (main) — 이 세션 4 커밋 추가 (docs + S1 + IPC guards + S2 URL 계약). push 예정.
- **Active Plan**: docs/plans/image-viewer-mvp.md (v0.3 — S1+S2 완료)
- **Active Design**: docs/designs/remote-fs-transport.md (v1.0 SSH — 설계만, 구현 대기)
- **Prior Plan/Design**: docs/plans/markwand-context-composer-mvp.md, docs/designs/markwand-context-composer.md (v0.2 — 일부 스코프 피벗)

## Scope Pivot (2026-04-20)
- **Drop**: `Send to Claude Code`·`Send to Codex` 자동 런칭, codex-launcher, context-builder, AppleScript Composer 모드
- **Reasons**: (1) Ghostty/Warp/Alacritty 등 터미널 지원 매트릭스 유지 비용 과다, (2) 자동 실행으로 의도치 않은 토큰 낭비 위험, (3) 사용자 제어권 확보
- **Kept**: 체크박스 멀티셀렉트, Tray 칩·게이지, 토큰 추정(휴리스틱), 온보딩, 마지막 선택 복원, stale 경로 자동 정리
- **Final UX**: 파일 체크 → `📋 Copy @ref` → `@/p1 @/p2 @/p3` 나열로 클립보드 복사 → 사용자가 터미널에 직접 붙여넣기

## Release Checklist — v0.2.0 (2026-04-21)
| 항목 | 상태 | 비고 |
|------|------|------|
| v0.2.0 태그 → HEAD 일치 | ❌ FAIL (hard-block) | 태그=561209c, HEAD=842650f; 6커밋 차이 (dmg빌드·Gatekeeper·QA·골든패스 미포함) |
| DMG 아티팩트 존재 + SHA256 | ❌ FAIL (hard-block) | dist/out/ 어디에도 .dmg 없음; 0b0c491 커밋은 package.json만 수정 |
| install-macos.md SHA256 섹션 | ⚠️ FAIL (soft-block) | v0.2.0 명기 없음, SHA256 검증 섹션 없음 (템플릿 추가됨 — 실제 해시 기입 필요) |
| Known Risks 실측치 기록 | ✅ CONDITIONAL PASS | 4개 항목 실측 완료; 5k FPS·dmg 실설치는 GUI 필요로 추정값 |
| 골든 패스 전 구간 PASS | ⚠️ PARTIAL | Step1-2 PASS; Step3(doc view)·Step4(Copy @ref)·Step5(paste) GUI 미검증 |

> **릴리스 블로커**: Hard 2건 해소 전 배포 금지. (1) `git tag -f v0.2.0 842650f` 후 재서명 또는 재생성, (2) `pnpm dist:mac` 실행 후 SHA256 기록.

## Tasks
| Task | Status | Verdict | Note |
|------|--------|---------|------|
| Plan/Design 작성 | done | PASS | docs/plans/md-viewer-mvp.md, docs/designs/md-viewer-mvp.md |
| Wave 1 (S1+S2 Foundation/Workspace/FS, 24파일) | done | PASS | Fix 4건 후 |
| Wave 2 (S3+S4+S5 Viewer/Views/Claude CLI, 29파일) | done | PASS | Fix 5건 후 |
| Known Risks 실측 (QA agent) | done | CONDITIONAL | 5개 리스크 실측 기록 완료; 5k FPS + DMG Gatekeeper는 GUI/배포 환경 필요 |
| 골든 패스 headless 실측 (QA agent) | done | PARTIAL | Step1(워크스페이스IPC) + Step2(17 projects in 27ms) PASS; Step3-5(doc view/Copy/paste) GUI 필요 — 수동 확인 대기 |
| 첫 GUI 실행 검증 (사용자) | todo | - | `pnpm dev` 또는 `pnpm dist:mac` |

## Recently Done (최근 3개)
| Task | Completed | Verdict | Ref |
|------|-----------|---------|-----|
| v0.3 이미지 뷰어 MVP — S1 Data Path + S2 Viewer Route + ImageViewer + `app://local/<path>` URL 계약 정정 (Chromium host 소문자 정규화 우회) + SafeImage 동반 fix | 2026-04-21 | PASS | `7ccb1e7`/`156a1ae`/`426d2d1` |
| docs(plans,designs) — v0.3 `image-viewer-mvp` Plan + v1.0 `remote-fs-transport` SSH Transport Design 작성 (675 lines, Explorer 조사 기반) | 2026-04-21 | PASS | `a20826d` |
| GitHub 원격 초기 푸시 (markwand repo, id_rsa 강제 지정으로 jay-swk/givepro91 키 충돌 우회) | 2026-04-20 | PASS | github:givepro91/markwand |

## Known Risks
| 위험 | 심각도 | 실측치 | 상태 |
|------|--------|--------|------|
| GUI 초기 로드 시간 (BrowserWindow → renderer ready) | Medium | **~920ms** (3회 실측 평균: 997/869/890ms) | PASS — 1초 이내 |
| 5k 노드 트리 렌더 FPS/지연 (react-arborist 가상화) | Medium | **~60fps 추정** (arborist 가상화로 visible row만 렌더; buildTree O(n) Map, 5k 기준 <30ms 추정) | GUI 미실행 환경, 직접 FPS 측정 불가 — 수동 확인 필요 |
| chokidar RSS (11k dirs 실측, 500dirs 시나리오 포함) | Low | **메인 프로세스 RSS: 157.6MB** (17 projects, ~11k filtered dirs 감시); baseline 대비 델타 **~1.5MB** — 500dirs 부하는 무시 가능 수준 | PASS — EMFILE 없이 정상 |
| Gatekeeper unsigned dmg 첫 실행 우회 | Medium | **`xattr -d com.apple.quarantine` 동작 확인** (exit 0); DMG 빌드(`pnpm dist:mac`) 미수행으로 실제 배포 시나리오 미검증 | CONDITIONAL — xattr 가용, dmg 빌드·설치 단계 수동 검증 필요 |
| 시스템 다크모드 첫 로드 light flash | Low | **~10–30ms** (코드 분석: `useState('system')` → IPC `prefs.get('theme')` 응답 전까지 CSS `:root` = light 기본값 적용) | Minor — IPC 응답 전 1프레임 flash 확인됨; 수정 시 `<html data-theme>` SSR-like 인라인 스크립트 필요 |
| `fs:read-doc` 파일 크기 무제한 | Hard | stat 없이 readFile → 대용량 .md 파일 시 힙 소진 위험 | 미해결 — stat-first + 2MB 상한 추가 필요 |
| preload `onDocsChunk`/`onChange` raw event 노출 | Medium | IpcRendererEvent가 렌더러 콜백에 직접 전달 | 미해결 — data-only 래퍼로 교체 필요 |

> 실측 환경: macOS headless agent (2026-04-21), `pnpm build` 결과물 직접 실행, 워크스페이스 `/Users/keunsik/develop` (17 projects, 971 md files)

## Known Gaps (미커버 영역)
| 영역 | 미커버 내용 | 우선순위 |
|------|-----------|----------|
| ~~docs-chunk 스트리밍~~ | ~~청크 IPC는 구현됐으나 useDocs는 collect 후 일괄 수신~~ | ~~v0.2~~ ✅ 해소: useDocs+InboxView 모두 appendDocs 진행형 렌더 확인 (2026-04-21) |
| 글로벌 풀텍스트 검색 | 인박스/카드 그리드만 발견성 제공 | v0.2 |
| frontmatter 자동 태깅 | gray-matter 파싱은 fs:read-doc만 | v0.2 |
| 문서↔코드 sync 체크 | 별도 인프라 필요 | v0.2 |
| Windows/Linux 빌드 | osascript/path 분기 v0.1 미구현 (스텁만) | v0.2 |
| 코드사이닝 ($99/년) | 본인용은 xattr 우회 | v1.0 |
| **readDocs GC** | **GC 미구현 확정(QA 2026-04-21): 7개월 전 타임스탬프도 영구 유지. 90일 이상 stale 항목 prune 필요** | **v0.2 Hard** |
| **InboxView projects 의존성 레이스** | effect deps에 projects 배열 포함 — projects ref 변경 시 진행 중 스캔 중단 후 재시작, 중복 IPC 가능 | v0.2 Medium |
| **T1 성능 실측** | GUI 미실행으로 첫 카드 렌더 <200ms·전체 로드 <2s·IPC 중복 직접 측정 불가 | 수동 확인 필요 |
| **⌘K 검색 backend 미구현** | CommandPalette 가 `window.api.search.query` 호출하나 main/preload 어디에도 `search:` IPC 핸들러 없음. 검색 결과 항상 0건. fts5 등 인덱스 필요 | **v0.3 High** |
| **drift — 코드 파일 변경 자동 감지** | watcher 가 `.md` 만 감시 → 코드 수정 시 stale 배지 자동 갱신 X. 수동 재검증 또는 문서 저장이 트리거 | v0.3 Medium |
| **drift — mtime 정밀도 / git checkout** | FAT32·동일-초 내 저장 시 ok 오판 / git checkout 이 mtime 덮어써 stale 오판. content hash 기반 판정 필요 | v0.3 Low |
| **사이드바 리사이즈 a11y** | `role="separator"` 만 있고 `aria-valuenow/min/max` 부재. 키보드(↑↓/←→)로 폭 조절 미지원. VoiceOver 사용자는 현재 폭 인지 및 조작 불가 | v0.3 Low |
| **Composer 이미지 `@ref` 허용** | ComposerTray/estimateTokens가 이미지 Doc 선택을 차단하지 않음. `@/path/image.png` 복사가 Claude Code에서 무의미하거나 토큰 낭비 — 선택 차단 or 별도 toast 필요 | v0.3.1 Medium |
| **`updatedRange` 필터 이미지 포함** | InboxView·AllProjectsView의 날짜 필터가 frontmatter 무관이라 이미지도 "오늘/7일/30일" 목록에 섞임. 의도인지 결정 후 classifyAsset 가드 | v0.3.1 Medium |
| **ImageIcon a11y** | FileTree의 새 ImageIcon이 `aria-hidden="true"`라 스크린리더에 파일 종류(md vs image) 미전달. aria-label 혹은 visually-hidden span 필요 | v0.3.1 Low |
| **ImageViewer 라디오 그룹 arrow-key** | `role="radio"` 부여했으나 ←/→ 이동 핸들러 없음. Tab/Enter만 동작. WAI-ARIA 계약 위반 | v0.3.1 Low |
| **체스보드 대비 토큰** | ImageViewer 투명 영역 인지용 체스보드를 `--bg`/`--bg-elev`로 그림 — 라이트/다크 모두 두 토큰 차이가 작아 거의 단색. 고정 대비 토큰 `--image-checker-a/b` 신설 필요 | v0.3.1 Low |
| **watcher change 이벤트 size 미갱신** | FsChangeEvent에 size 없음. 사용자가 이미지를 편집 저장하면 mtime은 갱신되나 Doc.size는 스캔 시점 값으로 고정 → ImageViewer 푸터가 stale bytes 표시 | v0.3.1 Low |
| **FileTree 파일 정렬 — md vs image interleave** | buildTree가 알파벳 기본 정렬이라 md와 이미지가 섞임. "문서 먼저, 이미지 나중" 정책 or 타입별 그룹핑 옵션 필요 (Plan R3 이연) | v0.3.1 Low |

## 규칙 우회 이력 (감사 추적)
| 날짜 | 커맨드 | 우회 이유 | 사후 조치 |
|------|--------|----------|----------|
| — | — | — | — |

> --emergency 플래그 사용 또는 Evaluator 건너뛸 때 반드시 기록. 미기록 = Hard-Block.

## Last Activity
- feat(viewer): ImageViewer + ProjectView 라우팅 + `app://local/<path>` URL 계약 정정 (`7ccb1e7`) — Chromium custom scheme host 소문자 정규화 우회. path 세그먼트를 host에 두면 `/Users/...`가 `users/...`로 변환되어 workspace `startsWith` 비교가 항상 실패하는 증상. 고정 host `local` + pathname 대소문자 보존. SafeImage도 동일 버그여서 동반 fix. Evaluator FAIL(C1 URL 인코딩 `#` 미처리·C2 errored path 변경 고착)→반영→PASS. GUI 실측 이미지 3개 렌더 확인.
- fix(ipc): fs:read-doc · drift:verify가 이미지 경로 거부 (`156a1ae`) — Evaluator M1·M2. 2MB 미만 이미지 바이너리가 utf-8로 읽혀 matter() 파싱되던 경로 차단 (NOT_A_TEXT_DOC / emptyReport).
- feat(viewable): 이미지 확장자를 1급 viewable asset으로 승격 (`426d2d1`) — S1 Data Path. src/lib/viewable.ts 신규(VIEWABLE_EXTS/classifyAsset/VIEWABLE_GLOB) + scanner/watcher/useDocs/FileTree/preload Doc.size. md 기존 흐름 회귀 0.
- docs(plans,designs): v0.3 이미지 MVP Plan + v1.0 SSH Remote FS Transport Design (`a20826d`) — CPS 구조 + 변경 지점 파일:라인 표 + Transport 4계층 아키텍처 + M1~M8 로드맵 + Open Question 4건. 구현 없이 설계만. | 2026-04-21T
- feat(sidebar): 파일명 잘림 해결 — FileTree title 툴팁 + ProjectView 리사이즈 핸들(180~600 clamp, 기본 260, prefs 영속). pointer API + setPointerCapture + rAF throttle + pointercancel 원복 + IPC race guard + unmountedRef(StrictMode 재마운트 리셋 포함). 4 파일 수정(validators.ts allowlist, FileTree.tsx, ProjectView.tsx, globals.css). /nova:auto → Evaluator CONDITIONAL→반영 → Reviewer Critical 2건(listener 누수·setPointerCapture) 반영 → StrictMode 버그 추가 수정. Known Gap: a11y 키보드 리사이즈·aria-valuenow 미지원. | 2026-04-21T
- feat(drift): DriftPanel "📋 이슈 복사" 버튼 — missing/stale 참조를 AI 프롬프트 형식으로 클립보드 복사. buildCopyIssuesPrompt 순수 함수 + 섹션/꼬리 3-way 분기(missing-only·stale-only·both) + ignored 제외 + targetMtime undefined fallback + raw 백틱 이스케이프. /nova:auto → Evaluator CONDITIONAL(Critical 0, Major 2는 pre-existing 스코프 밖) → Review PASS. typecheck/build PASS. (`3d17d00`) | 2026-04-21T
- fix(drift): 위치로 이동 — inline 백틱 스트립 (`1711d5e`) | 2026-04-21T
- fix(drift): 대규모 false-positive 수습 — PATH_CHAR_RE 화이트리스트 + 세그 길이 규칙 + docDir/projectRoot fallback + scripts/drift-audit.ts 신규. smoke 21/21, 실 워크스페이스 audit 가드 뚫림 0 (`824e111`)
- fix(drift): 디렉토리 stale 제외 + 경로 클릭 회수 (`3678f32`)
- fix(drift): npm scope · glob · placeholder 필터 (`4b16b9e`)
- feat(drift): missing/stale 실행 가능 액션(위치로 이동·Finder·경로 복사·무시) + 태그 필터 제거 (`e844d1a`)
- fix: 앱 크래시 3건 + ErrorBoundary 2단 (`c3c9531`) — DriftPanel hook 순서 위반 / tags 문자열을 문자 단위 분해 / 빈 화면 복구 불가
- fix: pre-existing 런타임·타입 에러 정리 (`3c93d0d`) — prefs allowlist, AllProjectsView sortDocsByOrder import, preload 타입 re-export, tsconfig.node include
- test(drift): headless smoke PASS (`69a94e2`) — scripts/drift-smoke.ts
- feat(drift): 문서↔코드 드리프트 감지 IPC 통합 + DriftPanel + 코드 리뷰 반영 (`ac70842`, `913d0f4`, `8532165`) — Nova Orbit drift goal 12/12 done | 2026-04-21T
- fix(drift): 코드 리뷰 Top 3 반영 (`8532165`) — useDrift 언마운트 가드, CSS 토큰 정합, 타입 이중선언 해소 (preload → lib/drift re-export), mtime Known Limitations 주석
- feat(drift): DriftPanel — 뷰어 상단 참조 리스트 + 재검증/무시 UI (`913d0f4`) — ignoredDriftRefs 세션 스코프, 집계 반영
- feat(drift): 문서↔코드 드리프트 감지 IPC 통합 + UI 배지 (`ac70842`) — extractor dead-code 해소, drift:verify 핸들러(2MB 상한·ok/missing/stale 판정), useDrift 백그라운드 훅, DriftBadge · ProjectCard 집계. Hard-block 2건 + Soft-block 2건 동시 해소 | 2026-04-21T
- /nova:review --fast → CONDITIONAL — IPC 정합성+회귀. Soft-block 2(preload WindowApi 미단언·Settings prefs 비원자), Known Gaps 2항목 제거(docs-chunk 스트리밍·markDocRead 가드) | 2026-04-21T09:00Z
- QA: 스트리밍+GC 통합 검증 → FAIL(T3 GC 미구현) + WARN(T4 store guard 누락) + PASS(T2 race) + BLOCKED(T1 GUI) — 10 tests added, docs/verifications/qa-streaming-gc.md | 2026-04-21T03:34Z
- /nova:review --fast → FAIL — IPC 보안·성능·정합성 리뷰. Hard-block 1(fs:read-doc 크기 무제한), Soft-block 3(preload event 노출·청크 이중전송·prefs value 무제한) | 2026-04-21T00:00Z
- fix: Copy @ref 여러개 선택 UX 수정 (a4ec0f4) — bundle 임시파일 방식 → `@/path1 @/path2 ...` 나열. context-builder/prepare IPC 제거. 189줄 삭제. | 2026-04-20T16:30Z
- refactor: 자동 런칭 전면 철회 (a59c6b1) — codex-launcher 삭제, Send 버튼 제거, ComposerTray는 Copy @ref 단일 버튼. 595줄 삭제. | 2026-04-20T16:00Z
- fix: Ghostty 런칭 시도 (d49baa7) — 실기 테스트에서 bash 이스케이프 실패, 이후 피벗으로 철회. | 2026-04-20T15:30Z
- /nova:auto → MVP 7 Wave 완료 — P1(Foundation·Store·Services·Primitives·UI) + P1.5(마지막 선택 복원) + P2(Codex 단발 응답). 총 7 커밋, 각 Wave 전 typecheck+build PASS, Wave 3/5는 독립 Evaluator 검증 후 CRITICAL/MAJOR 모두 수정 반영. 수동 V1/V2/V4/V9/V10/V11 대기 | 2026-04-20T15:00Z
- /nova:design → 완료 — docs/designs/markwand-context-composer.md (CPS + Sprint Contract S-P1/P1.5/P2 + E2E 8건 + 역방향 검증) | 2026-04-20T14:00Z
- /nova:deepplan → 완료 — docs/plans/markwand-context-composer-mvp.md (Explorer×3 병렬 → Synth → Critic CONDITIONAL PASS → Refiner 12건 반영) | 2026-04-20T13:30Z
- feat: Workspace mode(container/single) 지원 — 루트 마커 흡수 버그 해결 (73863cd) | 2026-04-20T11:00Z
- GitHub 원격 최초 푸시 → PASS — `git@github-givepro91:givepro91/markwand.git` main 추적 설정. ssh-agent가 `id_ed25519_jay_swk`를 먼저 올려 jay-swk로 잘못 인증되던 문제를 `GIT_SSH_COMMAND='ssh -i ~/.ssh/id_rsa -o IdentitiesOnly=yes'`로 우회. 근본 해결안: `~/.ssh/config`의 `github-givepro91` 블록에 `IdentitiesOnly yes` 추가 필요 (사용자 보류) | 2026-04-20T09:00Z
- 문서 내 검색 커스텀 구현 (findInContainer.ts 신규, TreeWalker+CSS Highlight API, 400ms→수ms, IME 포커스 탈취 해결) + SafeImage(private 배지 404 fallback) + Electron find IPC 제거 → CONDITIONAL PASS (독립 Evaluator: Critical 1·Warning 3 중 Warning 2 + 방어적 clearTimeout 반영, Warning 1은 test env 이슈로 skip) | 2026-04-20T08:30Z
- /nova:review --scope perf → CONDITIONAL PASS — MarkdownViewer memo/useMemo/slugCounter 클로저化로 find-in-page "다음" 1~2s 딜레이 제거 (typecheck/build PASS, 독립 Evaluator 검증) | 2026-04-20T08:00Z
- Wave E 사용자 피드백 5건 → PASS — FileTree 가상화 높이 측정(position:absolute + useLayoutEffect + docs 로드 시 재측정) / TOC id 매칭(slugify Unicode 보존 + sanitize clobber 해제 + 텍스트 fallback) / 카드 Finder 아이콘 / 인박스 pendingDocOpen / 프로젝트 lastViewedDocs | 2026-04-20T07:30Z
- Wave D 사용자 피드백 8건 → PASS — CSP img https / 인박스 필터 / 워크스페이스 제거 모달 / 카드 컴팩트+List 토글 / Claude 중복 방지+Finder fallback / 파일 검색 / 문서 내 검색(findInPage) / TOC | 2026-04-20T06:00Z
- UX Audit Wave A+B+C → PASS — 디자인 시스템 도입(33파일, 토큰 54+primitives 6+markdown.css), 빌드/스모크 OK | 2026-04-20T05:30Z
- /nova:ux-audit → Critical 6 / High 13 / Medium 12 / Low 4 — md-viewer MVP v0.1 전체 UI/UX | 2026-04-20T05:00Z
- /nova:auto --deep → PASS — md-viewer MVP v0.1 (53파일 신규, Plan/Design+Dev 2 Wave+QA 2 Wave+Fix 2 Wave) | 2026-04-20T03:18Z

## Refs
- **Current Plan**: docs/plans/image-viewer-mvp.md (v0.3 Viewable Asset — S1+S2 완료)
- **Current Design**: docs/designs/remote-fs-transport.md (v1.0 SSH Transport — 설계만, M1~M8 로드맵)
- Prior Plan: docs/plans/markwand-context-composer-mvp.md (v0.2 Context Composer, 일부 스코프 피벗)
- Prior Design: docs/designs/markwand-context-composer.md (v0.2)
- Prior Plan: docs/plans/md-viewer-mvp.md (v0.1 완료)
- Prior Design: docs/designs/md-viewer-mvp.md (v0.1 완료)
- Last Verification: v0.3 S2 GUI 실측 PASS — `pnpm dev` + 이미지 3개 렌더 확인 (2026-04-21, Chromium host normalization 이슈 해소 후)
- Orchestration ID: orch-mo6k958z-f1gh (v0.1)

## 다음 단계 (사용자 액션)

```bash
cd /Users/jay/develop/md-viewer

# 1. 개발 모드로 실행 (HMR)
pnpm dev

# 2. 또는 프로덕션 빌드 + dmg
pnpm dist:mac
# Gatekeeper 우회 (첫 실행)
xattr -d com.apple.quarantine "/Applications/md-viewer.app"
# 또는 우클릭 → 열기 → "그래도 열기"
```

골든 패스 확인:
1. 워크스페이스 추가 → `~/develop` 선택
2. All Projects 카드 그리드에 프로젝트 자동 감지 확인
3. 프로젝트 선택 → Project View → 트리에서 md 클릭 → 코드 하이라이팅 + mermaid 렌더 확인
4. Inbox 뷰 전환 → 4단 시간 그룹 확인
5. 다크 토글 → 코드/머메이드 동기화 확인
6. ProjectView 헤더 "Open in Claude" → claude CLI 실행 확인
