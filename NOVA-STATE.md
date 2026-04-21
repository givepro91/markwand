# Nova State

## Current
- **Goal**: v0.9 로컬 이득 선행 — M1 Transport Interface + M2 Hash 보조 도입. v1.0 SSH M3+는 v0.3 피드백 1~2 사이클 후 별도 Plan.
- **Phase**: **S1 M1 Transport 완료(CONDITIONAL PASS)**. 다음 S2(M2 Hash 보조) + S3(Bench). S1 잔여: RM-7 project:scan-docs 미위임 — M4 watcher 작업과 묶어 처리(Known Gap 이관).
- **Blocker**: none
- **Remote**: git@github-givepro91:givepro91/markwand.git (main) — v0.3.2 커밋(`c6f0422`) push 여부 미확인. 이 세션은 Plan 문서 1건 + NOVA-STATE 갱신.
- **Active Plan**: **docs/plans/remote-fs-transport-m1-m2.md** (v0.9 M1·M2 선행, draft)
- **Active Design**: docs/designs/remote-fs-transport.md (v1.0 SSH 설계 + §2.2 rev. M1 적용 — `detectWorkspaceMode` 추가, `readFile maxBytes:2MB` 계약 명시)
- **Prior Plan**: docs/plans/image-viewer-mvp.md (v0.3 — S1+S2 완료)
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
| v0.3.2 남은 Known Gap 4건 — updatedRange md-only 가드(+ProjectView 복제본 제거 단일 소스화) · ImageViewer radiogroup arrow-key(←/→/↑/↓/Home/End + roving tabindex) · watcher change size 전파(FsChangeEvent.size + fs.stat) · FileTree 타입별 정렬(dir→md→image→기타, 재귀). Evaluator CONDITIONAL PASS — Major 2건(compareTreeNodes를 doc.path 기반으로 정정, 복합 필터 tags+updatedRange 테스트 추가) 반영. 8 파일 수정, docFilters 테스트 34건 PASS. | 2026-04-21 | PASS | (pending) |
| v0.3.1 UX/a11y 후속 3건 + 잔류 cleanup — 체스보드 대비 토큰·FileTree 아이콘 aria-label·Composer 이미지 Checkbox 숨김·estimateTokens 이중 방어 + 이전 세션 선택 복원에서 이미지 필터 (Evaluator Critical 반영) | 2026-04-21 | PASS | `0315a13` |
| v0.3 이미지 뷰어 MVP — S1 Data Path + S2 Viewer Route + ImageViewer + `app://local/<path>` URL 계약 정정 (Chromium host 소문자 정규화 우회) + SafeImage 동반 fix | 2026-04-21 | PASS | `7ccb1e7`/`156a1ae`/`426d2d1` |

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
| ~~**Composer 이미지 `@ref` 허용**~~ | ~~이미지 Doc 선택 차단 필요~~ | ~~v0.3.1 Medium~~ ✅ 해소 `0315a13`: FileTree Checkbox 숨김 + composer.ts missing 분류 + App.tsx 복원 필터 + store pruneStaleDocSelection md-only |
| ~~**`updatedRange` 필터 이미지 포함**~~ | ~~InboxView·AllProjectsView의 날짜 필터가 frontmatter 무관이라 이미지도 "오늘/7일/30일" 목록에 섞임~~ | ~~v0.3.1 Medium~~ ✅ 해소 v0.3.2: docFilters.ts `classifyAsset==='md'` AND 가드(updatedRange!=='all'에서만). ProjectView 로컬 복제본 제거 → utils 단일 소스화 |
| ~~**ImageIcon a11y**~~ | ~~스크린리더 파일 종류 구분 불가~~ | ~~v0.3.1 Low~~ ✅ 해소 `0315a13`: FolderIcon/FileIcon/ImageIcon 모두 `role="img"` + `aria-label`. 잔여 Warning: treeitem 내 중복 낭독 가능성 (실기기 검증 후 판단) |
| ~~**ImageViewer 라디오 그룹 arrow-key**~~ | ~~`role="radio"` 부여했으나 ←/→ 이동 핸들러 없음. Tab/Enter만 동작. WAI-ARIA 계약 위반~~ | ~~v0.3.1 Low~~ ✅ 해소 v0.3.2: ←/→/↑/↓/Home/End 핸들러 + roving tabindex(active만 0, 나머지 -1) + radioRefs로 focus 전이 |
| ~~**체스보드 대비 토큰**~~ | ~~투명 영역 인지 불가~~ | ~~v0.3.1 Low~~ ✅ 해소 `0315a13`: `--image-checker-a/b` 신설, 라이트 `#ffffff/#d8dde3`·다크 `#1f252d/#3a4450` (WCAG 1.4.11 ~3:1) |
| ~~**watcher change 이벤트 size 미갱신**~~ | ~~FsChangeEvent에 size 없음. 사용자가 이미지를 편집 저장하면 mtime은 갱신되나 Doc.size는 스캔 시점 값으로 고정 → ImageViewer 푸터가 stale bytes 표시~~ | ~~v0.3.1 Low~~ ✅ 해소 v0.3.2: FsChangeEvent.size 추가 + watcher fs.stat(st.isFile() 가드·ENOENT catch·undefined 허용) + useDocs updateDoc patch에 size 포함(0 byte도 반영) |
| ~~**FileTree 파일 정렬 — md vs image interleave**~~ | ~~buildTree가 알파벳 기본 정렬이라 md와 이미지가 섞임. "문서 먼저, 이미지 나중" 정책 or 타입별 그룹핑 옵션 필요 (Plan R3 이연)~~ | ~~v0.3.1 Low~~ ✅ 해소 v0.3.2: compareTreeNodes(dir→md→image→기타, doc.path 기반 분류) + sortTreeRecursively. V8 stable sort |
| **FsChangeEvent mtime 누락 (size 전파와 일관성)** | change 이벤트가 `mtime`을 실어 보내지 않아 useDocs가 `Date.now()`로 대체. awaitWriteFinish + debounce(300ms) 지연으로 실제 fs mtime과 차이. rescan 후 정렬 순서 미세 불일치 가능 (Evaluator M-3, v0.3.2 스코프 밖) | v0.4 Low |
| **`project:scan-docs` IPC Transport 미위임** | v0.9 M1 Evaluator Major (2026-04-21): `services/scanner.ts`의 Doc chunk 스트리밍 로직(frontmatter 파싱+청크 분할)이 LocalScannerDriver에 이식되지 않아 handler가 `services/scanner.scanDocs`를 직접 호출. 내부 `fs.promises.stat`이 localTransport 우회 → M1 완결성 갭. Refactor 방향: `LocalScannerDriver.scanDocsAsDocs` 헬퍼 신설 또는 Doc composition을 IPC 핸들러로 끌어올림. M4 watcher 도입과 묶어 처리. | **v0.9 M1.x Medium (RM-7)** |

## 규칙 우회 이력 (감사 추적)
| 날짜 | 커맨드 | 우회 이유 | 사후 조치 |
|------|--------|----------|----------|
| — | — | — | — |

> --emergency 플래그 사용 또는 Evaluator 건너뛸 때 반드시 기록. 미기록 = Hard-Block.

## Last Activity
- /nova:auto → CONDITIONAL PASS — v0.9 M1 Transport Interface + LocalTransport 래핑 (S1 완료). 4 커밋(baseline 35bcd58 · C2 신규 파일 ac6a5dc · C3 IPC 위임 39310b9 · C4 테스트 81edc9e + fix) 원격 push 완료. typecheck PASS · drift-smoke 21/21 PASS · 신규 29 테스트 PASS · 전체 136 tests(126 PASS, 10 pre-existing fail). **Evaluator 판정**(nova:senior-dev, 실증 기반): CONDITIONAL PASS — Major 1(`project:scan-docs` 미위임 — Plan §M1.3 defer·Known Gap 이관, M4 watcher 작업과 묶어 처리) + Minor 2(설계서 Transport.watcher/exec optional 조정·scanDocs import 잔류). **Known Risk Hard 동시 해소**: `fs:read-doc 파일 크기 무제한` → FsDriver.readFile({maxBytes:2MB}) size-first 계약. **Scope Guard 준수**: ssh2/hash/sha256 0건. 순환 import 0건. assertInWorkspace `{posix?:boolean}` opt 추가(M3 사전 계약, 사용처 0). workspace.transport: {type:'local'} 필드 lazy 마이그레이션. Orchestration orch-mo86dcfj-bdu2. | 2026-04-21T
- /nova:deepplan → PASS — docs/plans/remote-fs-transport-m1-m2.md (v0.9 M1·M2 선행, Mode: deep, Iterations: 1). Explorer×3 병렬(43 FS 호출 지점 전수조사 · 5 hot path 성능 영향 +1~3% 추정 · sha256/전체 content/인메모리 Map 캐시) → Synthesizer 20파일·3일 추정 → Critic(nova:architect) CONDITIONAL PASS · 5 수정 지시 반영 → Refiner. **주요 발견**: M2 순수 hash 치환은 mtime 기반과 등가 불가(doc 기준점 ref hash 저장 없이는 stale 판정 불가능) → S2 범위 축소(hash는 보조 필드만). 설계서 §2.2 rev. M1 선수정(detectWorkspaceMode + readFile maxBytes 계약). Known Risk `fs:read-doc 무제한` Hard는 M1에서 동시 해소. U-M2-1 사용자 승인 필요. | 2026-04-21T
- /nova:ux-audit → Critical 1 / High 16 / Medium 0 / Low 0 — docs/designs/remote-fs-transport.md §9 Q2~Q4. **5 jury 만장일치 합의**: Q2 readonly 엄수(5/5), Q3 (c) hybrid(로컬 N개 + 원격 active 1 + warm 1, 5/5), Q4 (c) M1·M2 즉시 착수 + M3~ v0.3 피드백 1~2사이클 후 feature flag(4.5/5). Design Contract DC-1~DC-7 도출(write boundary · concurrency · status·a11y · trust · perf budget · phasing · verification). Q1 고정: 사용자 SSH config 분석 기반 (b)+(a) 시나리오, 제품은 3시나리오 모두 수용·하드코딩 금지. 다음 단계 /nova:deepplan로 M1·M2 Plan 작성. | 2026-04-21T
- fix(v0.3.2): 남은 Known Gap 4건 해소 + 중복 `applyMetaFilter` 단일 소스화 (pending). (1) **updatedRange 이미지 제외** — docFilters.ts `classifyAsset==='md'` AND 가드(활성 범위에서만, 'all'일 땐 이미지 유지). ProjectView의 로컬 복제본 제거 → utils import. (2) **ImageViewer radiogroup arrow-key** — ←/→/↑/↓ 순환, Home/End, roving tabindex(active 0, 나머지 -1), radioRefs로 focus+select 동시 전이. (3) **watcher size 전파** — FsChangeEvent.size 추가, sendChange에서 `fs.stat` → isFile() 가드, ENOENT는 undefined로 fallback(silent). useDocs에서 patch에 size 포함(0 byte도 반영). (4) **FileTree 타입별 정렬** — compareTreeNodes(dir→md→image→기타, `doc.path` 기반) + sortTreeRecursively, V8 stable sort. 독립 Evaluator CONDITIONAL PASS(Critical 0, Major 3): M-1(name→doc.path) 반영, M-2(tags+updatedRange 복합 테스트) 반영, M-3(mtime 일관성)은 스코프 밖 → v0.4 Known Gap 이관. 8 파일 수정(docFilters.ts/docFilters.test.ts/ProjectView.tsx/ImageViewer.tsx/FileTree.tsx/useDocs.ts/types.ts/watcher.ts). typecheck PASS, docFilters 테스트 34건 PASS. | 2026-04-21T
- fix(v0.3.1): 체스보드 대비 토큰(`--image-checker-a/b` 라이트·다크, WCAG ~3:1) + FileTree 아이콘 a11y(role="img" + aria-label) + Composer 이미지 제외(FileTree Checkbox 숨김 + composer.ts missing 분류 + App.tsx 복원 필터 + store pruneStaleDocSelection md-only) (`0315a13`). Known Gap 3건 동시 해소. 독립 Evaluator Critical 1건(이전 세션 선택 prefs 복원 경로에 이미지 잔류)+Warning 1건(다크 체스보드 WCAG 미달) 반영. 6 파일 수정. | 2026-04-21T
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
- **Current Plan**: docs/plans/remote-fs-transport-m1-m2.md (v0.9 M1·M2 선행, draft)
- **Current Design**: docs/designs/remote-fs-transport.md (v1.0 SSH Transport — 설계 + §2.2 rev. M1, M1~M8 로드맵)
- Prior Plan: docs/plans/image-viewer-mvp.md (v0.3 Viewable Asset — S1+S2 완료)
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
