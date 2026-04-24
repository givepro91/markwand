# Nova State

## Current
- **Goal**: **다음 세션 — v0.4 방향 결정 + 착수**. 사용자 피드백 7건 중 beta.9 로 3건 해소(Mermaid fix · 자동 싱크 · 최근 이미지 탭). 남은 4건을 묶어 **"v0.4 UX Overhaul"** 릴리스로 진행 예정.
- **Phase**: **handoff** — v0.3.0-beta.9 릴리스 공개 완료. 사용자 dogfood 피드백 수신 대기 + 다음 세션 진입 시 v0.4 Plan 착수.
- **Blocker**: none
- **Remote**: git@github-givepro91:givepro91/markwand.git (main) — origin = `ea6f80f` (v0.3.0-beta.9 SHA256). tag `v0.3.0-beta.9` 원격 반영 완료. GitHub Release 공개: https://github.com/givepro91/markwand/releases/tag/v0.3.0-beta.9
- **Active Plan**: docs/plans/v0.4.0-ux-overhaul.md (v0.4 UX Overhaul, deep, 9 sprints — 사용자 승인 대기)
- **Completed Plan**: docs/plans/v0.3.0-beta.9-quickwin.md (S1·S2·S3 + Release 전부 완료)
- **Prior Plan**: docs/plans/remote-fs-transport-followup.md (v1.0 Follow-up — 4 sprints FS0~FS3 완료)
- **Parent Plan**: docs/plans/remote-fs-transport-m3-m4.md (v1.0 M3·M4, refined — Critic CONDITIONAL PASS 전 항목 반영)
- **Active Design**: docs/designs/remote-fs-transport.md (v1.0 SSH 설계 — §2.2 Transport interface, §3.1 원격 watcher, §4.1~4.5 보안, §5 성능)
- **Prior Plan**: docs/plans/remote-fs-transport-m1-m2.md (v0.9 M1·M2 완료)
- **Prior Plan**: docs/plans/image-viewer-mvp.md (v0.3 — S1+S2 완료)
- **Prior Plan/Design**: docs/plans/markwand-context-composer-mvp.md, docs/designs/markwand-context-composer.md (v0.2 — 일부 스코프 피벗)

## 다음 세션 — v0.4 UX Overhaul Handoff (2026-04-24)

beta.9 배포 완료 시점의 남은 사용자 피드백 4건을 하나의 **v0.4** 릴리스로 묶어 해소. 기능 단위가 아니라 **UX·디자인·접근성 전반**을 다루는 리디자인 스프린트라 단일 Plan 이 아닌 **UX Audit → Plan → Design → 스프린트** 체인으로 진행 권장.

### 남은 피드백 4건 (beta.9 Plan Known Gap 이관)

| # | 사용자 원문 | 성격 | 난이도 | 선행 필요 |
|---|-------------|------|--------|-----------|
| 3 | "문서 하이라이팅? 형광펜? 내부 그리기? 기능이 있으면 좋겠다" | 신규 기능(annotation layer) | 대 (8+) | annotation 저장 모델 설계(신규 Plan) |
| 4 | "이미지 4 ASCII 박스 그림 개선 가능한지? 되게 못갱김" | 렌더 품질 개선(제한적) | 중 | 6번 스프린트 내에서 타이포/여백으로 처리 |
| 6 | "현재 뷰어도 좋지만 더 이쁘게 보기쉽게 된다면 베스트" | 디자인 전반 | 대 (8+) | `/nova:ux-audit` 선행 |
| 7 | "개발자 비개발자 구분없는 ux/ui로 개선 (현재는 너무 개발자에게 친화적)" | UX 전반 | 대 (8+) | `/nova:ux-audit` 선행 — 6번과 동일 |

### 추가 후속 (v0.3 범위 내 잔여, v0.4 와 병합 가능)

- **SSH 원격 워크스페이스의 프로젝트 목록 자동 갱신** — 현재 SshPoller 는 문서 레벨만. 디렉토리 레벨 폴링 추가 필요. `src/main/transport/ssh/watcher.ts` 의 SshPoller 확장 + depth ≤ 2 readdir 비교 + `fs:project-change` 와 동일한 IPC 채널 재사용 고려
- **beta.9 dogfood 피드백** — 사용자가 실제로 시험해보고 남길 수 있는 버그/개선점 (발견 시 beta.10 또는 v0.4 에 반영)

### 권장 진입 경로 (다음 세션 첫 5분)

1. `git log --oneline -15` 로 beta.9 커밋 6건 확인 (ea6f80f → e02e51f)
2. **사용자와 beta.9 피드백 간단 수렴** — 실제 동작 확인 (Mermaid 다이어그램 / 프로젝트 폴더 생성/삭제 자동 반영 / 최근 이미지 탭)
3. **방향 선택**:
   - **A (권장)**: `/nova:ux-audit` 먼저 실행 — 5인 적대적 평가자로 현재 v0.3 UI 전반을 다각도 진단. 여기서 #4·#6·#7 구체 액션 아이템 도출
   - **B**: #3 하이라이팅 Plan 먼저 — UI 리디자인과 독립이라 병행 가능. annotation 데이터 모델(sidecar JSON vs embedded frontmatter) + 선택 텍스트 앵커링(XPath/text-offset/CFI) 설계가 핵심
   - **C**: SSH 프로젝트 목록 자동 갱신 — 작고 명확한 건. 1~2시간 핫픽스급
4. 방향 A 선택 시: `/nova:ux-audit` 결과 → `/nova:plan` (또는 `/nova:deepplan` 복잡도 8+) → `/nova:design` → 구현 스프린트

### 재개 시 주의점

- **v0.3.0-beta.9 watcher 활성화** — 사용자 환경(예: ~/develop 수준 큰 워크스페이스)에서 IPC 폭발/UI freeze 가 재발하지 않는지 dogfood 로 확인. 문제 시 즉시 beta.10 핫픽스로 depth 축소(예: `depth: 3`) 또는 워크스페이스 size 기반 watch 토글 도입
- **첫 사용자 프리셋(prefs 기본값)** — `recentDocsTab: 'docs'` 가 기본. beta.8 설치자는 `recentDocsCollapsed` 만 저장돼 있어 신규 키 영향 없음
- **Nova 하드 게이트** — NOVA-STATE.md Last Activity 의 "PASS" 키워드 파싱 민감함. 제목에 `→ PASS**` 형태로 명시해야 hook 통과. `→ Evaluator 반영 후 PASS` 같은 중간 단어가 많으면 NO_PASS 로 판정될 수 있음 (이번 세션에서 1회 차단 경험)

## Scope Pivot (2026-04-20)
- **Drop**: `Send to Claude Code`·`Send to Codex` 자동 런칭, codex-launcher, context-builder, AppleScript Composer 모드
- **Reasons**: (1) Ghostty/Warp/Alacritty 등 터미널 지원 매트릭스 유지 비용 과다, (2) 자동 실행으로 의도치 않은 토큰 낭비 위험, (3) 사용자 제어권 확보
- **Kept**: 체크박스 멀티셀렉트, Tray 칩·게이지, 토큰 추정(휴리스틱), 온보딩, 마지막 선택 복원, stale 경로 자동 정리
- **Final UX**: 파일 체크 → `📋 Copy @ref` → `@/p1 @/p2 @/p3` 나열로 클립보드 복사 → 사용자가 터미널에 직접 붙여넣기

## Release Checklist — v0.3.0-beta.1 (2026-04-22)
| 항목 | 상태 | 비고 |
|------|------|------|
| v0.3.0-beta.1 태그 → HEAD 일치 | ✅ PASS | 태그 `v0.3.0-beta.1` → `95aed6d` (HEAD 동일) |
| DMG 아티팩트 존재 + SHA256 | ✅ PASS | `dist/Markwand-0.3.0-beta.1-arm64.dmg` (136MB) + `-x64.dmg` (141MB). SHA256 기록 완료 |
| install-macos.md SHA256 섹션 | ✅ PASS | arm64/x64 양쪽 실제 해시 기입. xattr 우회 가이드 유지 |
| release-notes 문서 | ✅ PASS | `docs/release-notes/v0.3.0-beta.1.md` — 주요 기능 · 성능 · 보안 · 알려진 제한 · 저장 항목 · SHA256 |
| 자동 검증 | ✅ PASS | typecheck · vitest 260/250 (회귀 0) · bench DC-5 · Docker 통합 9/9 |
| 수동 GUI 검증 (SSH e2e) | ✅ PASS | 사용자 dogfood 완료 (FS9-C 세션 마무리 시점) |
| 코드사이닝 / 공증 | ⏸ SKIP | 베타 (unsigned dmg + xattr 우회) — v1.0 에서 도입 검토 |

v0.2.0 hard-block 2건 (태그 ≠ HEAD · DMG 부재) 은 해당 버전 블로커였고 v0.3.0-beta.1 은 별개 릴리스로 준비 완료.

## 이전 Release Checklist — v0.2.0 (2026-04-21)
| 항목 | 상태 |
|------|------|
| v0.2.0 태그 → HEAD 일치 | ❌ FAIL (hard-block, 해당 버전 배포 안 함) |
| DMG 아티팩트 | ❌ FAIL (없음, 해당 버전 배포 안 함) |

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
| **SSH 플로우 접근성 WCAG 2.2 AA 위반 (focus trap · SHA256 SR 낭독 · radio fieldset · 에러 focus 이동)** | Hard | SshWorkspaceAddModal / SshHostKeyPrompt 키보드만 · 스크린리더 사용자 진입 차단 수준 (ux-audit 평가자 2, 2026-04-21) | 미해결 — UX Audit FS9 스프린트에서 일괄 해소 예정 |
| **SSH 플로우 UI 전면 영문 + 기술 용어 노출 (host/port/TOFU/fingerprint/SHA256 등)** | Hard | SshWorkspaceAddModal · SshHostKeyPrompt 비개발자 진입 차단 (ux-audit 평가자 1·3, 2026-04-21) | 미해결 — UX Audit FS9 스프린트에서 일괄 해소 예정 |
| **사이드바 리사이즈 handle keyboard 불가 + aria-valuenow 부재 (WCAG 2.1.1/2.5.7)** | Hard | ProjectView.tsx:603-632 — onPointerDown only, tabIndex·ArrowKey·Home/End 부재 (ux-audit 평가자 2, 2026-04-24) | 미해결 — v0.4 UX Overhaul S2 스프린트 예정 |
| **다크 모드 탭 active + FilterBar segmentButton 대비 3.4:1 AA fail (WCAG 1.4.3)** | Hard | themes.css:43 `--accent: #388bfd` + white text @ `--fs-sm` 12-14px = 3.4:1 (4.5:1 미달); Sidebar.tsx:92 (ux-audit 평가자 2, 2026-04-24) | 미해결 — v0.4 S1 스프린트 (토큰 재정의) |
| **workspace 제거 시 host key(SHA256 지문·firstSeenAt·algorithm) 잔존 — GDPR 삭제권 위반 소지** | Hard | main/ipc/workspace.ts:449-466 `removeHostKey(id)` 미호출 (ux-audit 평가자 5, 2026-04-24) | 미해결 — v0.4 S? 핸들러에 `removeHostKey` 배선 + UI 고지 |
| **appendDocs O(N) spread on every chunk — Settings/Composer 포함 전역 re-render 폭발** | Hard | state/store.ts:165-166 `docs:[...state.docs, ...docs]` × 60 chunks × 2377 docs ≈ N² (ux-audit 평가자 4, 2026-04-24) | 미해결 — v0.4 구조 변경(docsByProject Map) |
| **InboxView scanDocs 이중 race (deps=projects 배열 참조 · useDocs 중복 IPC)** | Medium | InboxView.tsx:66-134 — docCountProgress 갱신이 projects set 재할당 → 17 projects 재스캔 (ux-audit 평가자 4, 2026-04-24) | 미해결 — deps hash 축소 + store 재사용 |
| **drift 전문용어 전면 노출 (missing/stale/drift/ref) — 비개발자 차단 #7 핵심** | Hard | DriftPanel.tsx:24-34,236,251 · FilterBar.tsx:21-33 · ko.json:285-330 (ux-audit 평가자 1·3, 2026-04-24) | 미해결 — v0.4 한국어 번역 + "고급" 토글 |
| **ProjectView 동시 12 옵션 Miller 초과 — FilterBar 4+N+N + Find 5 + TOC + ClaudeButton + RecentDocs + Drift** | Hard | ProjectView.tsx:456-512,640-670 · FilterBar.tsx:192-304 (ux-audit 평가자 3, 2026-04-24) | 미해결 — v0.4 FilterBar 기본 접기 + 칩 단일 버튼 |
| **Image/Mermaid CLS — width/height/aspect-ratio 0** | Medium | MarkdownViewer.tsx:129-136,204-211 · markdown.css:164-168 — 사용자 피드백 #4 "ASCII art 못생김"과 연관 (ux-audit 평가자 4, 2026-04-24) | 미해결 — v0.4 placeholder aspect-ratio + mermaid min-height |

> 실측 환경: macOS headless agent (2026-04-21), `pnpm build` 결과물 직접 실행, 워크스페이스 `/Users/keunsik/develop` (17 projects, 971 md files)

## Known Gaps (미커버 영역)
| 영역 | 미커버 내용 | 우선순위 |
|------|-----------|----------|
| **FilterBar 출처 known vs custom 구분 UI** | GUI 피드백(2026-04-21): frontmatter `source` 값을 동적으로 set 수집해 Claude/Codex/Design/Review 고정 칩과 임의 사용자 값(`unknown-custom` 등)이 동일 레벨에 혼재. 사용자 신뢰도 저하. known-list 정의 + unknown 소스 "기타" 그룹핑 or 시각적 구분 필요 | v0.4 Medium (2b) |
| ~~**M-2 IPC 핸들러 transport 분기**~~ | ~~`project:scan-docs`/`project:get-doc-count`/`fs:read-doc` 가 `localTransport` 하드코딩~~ | ~~v1.0 follow-up High~~ ✅ 해소 (Follow-up FS1, 8781617): 3 핸들러 `getActiveTransport(wsId)` 경유 + `resolveTransportForPath` path prefix 역매핑 헬퍼 신규. `assertInWorkspace` `posix: isSsh` 전달. drift:verify / composer 는 Scope Guard 로 v1.0 이후 이관. |
| ~~**WorkspacePicker SSH 옵션 + Settings Experimental 섹션 UI**~~ | ~~UI 노출 경로 없음~~ | ~~v1.0 follow-up Medium~~ ✅ 해소 (Follow-up FS2, 161050e): WorkspacePicker `__add_ssh__` 옵션 + SshWorkspaceAddModal 신규(host/port/user/auth/root 폼) + Settings Experimental 섹션(sshTransport Checkbox + 재시작 안내) |
| ~~**scanProjects SSH 구현**~~ | ~~`services/scanner.scanProjects` 가 로컬 전용~~ | ~~v1.0 follow-up Medium~~ ✅ 해소 (Follow-up FS0, 8781617): `scanProjectsSsh` + `scanProjectsViaSftp` (테스트 헬퍼) 신규. SFTP readdir 기반 depth 2 탐색. `SSH_PROJECT_SCAN_IGNORE` 는 로컬 슈퍼셋(`__fixtures__/__snapshots__` 포함, D-2 의도적 트레이드오프 주석 명시) |
| **watcher diff 이벤트 단위 테스트 + mtime=-1 폴백 케이스** | S4 Minor m-3: change/unlink 이벤트 발화, size 기반 change 폴백, MAX_CONSEC_FAILURES 초과 error emit 케이스 부재. 단위 테스트 추가 필요. | v1.0 follow-up Low |
| **CI GitHub Actions `integration-ssh.yml`** | S4 통합 테스트(Docker sshd 6건)는 로컬만. workflow 파일 미작성 (사용자 승인 대기). | v1.0 follow-up Low |
| **axe-core 모달 테스트 + CSS 대비 시각 회귀** | Plan S2 DoD 일부: jsdom 환경 미도입으로 axe 스킵. CSS 대비 토큰은 수치만 설정됨 — 실제 WCAG 1.4.11 측정 스크립트 부재. | v1.0 follow-up Low |
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
| 2026-04-21 | /nova:auto (orch-mo8eyoda-c364) | S2 후반부·S3 Evaluator 를 S4 통합 Evaluator 로 합병 (context/efficiency 타협) | S4 Evaluator 가 3 스프린트 통합 리뷰 수행 (Critical 1+Major 3+Minor 5) → Critical+필수 Major 반영 + M-2 외 Minor Known Gap 이관. 규칙 §2 "각 스프린트 완료=Evaluator 필수" 형식적 위반이나 실질 검증 누락 없음. |

> --emergency 플래그 사용 또는 Evaluator 건너뛸 때 반드시 기록. 미기록 = Hard-Block.

## Last Activity
- **/nova:deepplan → PASS — docs/plans/v0.4.0-ux-overhaul.md (2026-04-24)** — Critic CONDITIONAL 전 12건 반영 완료. Mode: deep, Iterations: 1. Explorer×3 병렬(A 코드 현황 전수조사 UX Audit 40 항목 파일:라인 + 의존 매핑 · B annotation 기술 스택 text-quote + CSS Custom Highlight + sidecar JSON 권장 · C 성능/토큰 구조 영향 store Map 9 구독자 점진 selector 전략 + 다크 `#1f6feb` 5.05:1 실측) → Synthesizer 9 sprints(S1 Tokens/CLS · S2 Layout/a11y · S3 i18n/humanizeError · S4 Perf Structure · S5 SSH Security · S6 SSH Wizard · S7 Annotation MVP · S8 SSH Auto-refresh · S9 Release) + DAG(S1∥S2 병렬 · 나머지 순차) → Critic (nova:architect) **CONDITIONAL PASS** (Critical 2 / Major 5 / Minor 5) → Refiner 12건 반영. **Critic 핵심 반영**: C-1 CSS `attr()` Chromium 130 미지원 → JS `onLoad` 단일 경로 · C-2 Zustand identity 전략 `cachedFlat` 모듈 스코프 변수 + 단일 `set({docs, docsByProject, frontmatterIndex})` 프로토콜 · M-1 I18nErrorBoundary 5 label prop 패턴 · M-4 anchor.test 9 케이스 + orphan 5% SLO · M-5 session TOFU key = `${hostname}:${port}` · m-1 bench 프로토콜 warm-up 3 + 본 10 + `--expose-gc` · m-2 GDPR sweep undo + 7일 백업. **Open Questions 결정**: Q1 sidecar JSON · Q2 원본 옆 · Q3 text-quote 중심(XPath 폴백 없음) · Q4 drift 문제 시에만 · Q5 SSH S8 IN. **Open Risks 사용자 판단 필요**: OR-3 분할 릴리스 옵션 A(beta.1 UX + beta.2 annotation) vs B(단일) · OR-4 S0 RTL/jsdom 선행 sprint 추가 여부. **하드 게이트**: annotation 범위(노랑 1색/로컬 md only) 사용자 승인 없이 S7 착수 금지. 다음: 사용자 승인 → (선택) /nova:design → /nova:auto. | 2026-04-24T
- **/nova:ux-audit → Critical 9 / High 15 / Medium 14 / Low 2 — v0.3.0-beta.9 renderer 전체 (2026-04-24)** — 5인 적대적 평가자(Newcomer·Accessibility·CogLoad·Performance·DarkPattern) 독립 서브에이전트 병렬 실행. 중복 병합 후 Top 20(Critical 8·High 11·Medium 11·Low 2). **Critical 핵심**: C1 drift 전문용어 전면 노출(#7 핵심 병목)·C2 첫 화면 정체성 부재·C3 핵심 개념 관계 설명 0·C4 ProjectView 12 옵션 Miller 초과·C5 사이드바 리사이즈 keyboard 불가(WCAG 2.1.1/2.5.7)·C6 다크 탭 대비 3.4:1 fail(1.4.3)·C7 appendDocs O(N) spread 매 chunk·C8 InboxView 이중 race·C9 **workspace 제거 시 host key 잔존 GDPR 위반 소지**. **High 핵심**: ErrorBoundary 하드코딩+해결책 부재·Composer/@ref 용어·SSH 모달 8 필드+focus trap 부재·humanizeError 미일관·터치 타겟<24px·DriftBadge/find aria-live 부재·App.tsx docs effect 폭발·Mermaid/hljs eager import·**Image CLS (#4 ASCII art 와 연관)**·TOFU Trust 세션-only 없음·Composer @ref 절대 경로 유출+토큰 비용 고지 부족. **잘 된 점**: humanizeError 한국어 카피·scan 오버레이 % · ImageViewer radiogroup APG 완전 준수·SHA256 2-byte `:` 낭독 완화·Mermaid lazy IO+dynamic import·View lazy·CommandPalette CSS Highlight API·prefers-reduced-motion 전역 kill-switch·destructive-default focus. 다음 단계: /nova:deepplan 으로 v0.4 UX Overhaul Plan (Critical 8 + High 11 + #3 annotation + SSH 프로젝트 목록 자동 갱신). | 2026-04-24T
- **세션 클로징 — v0.3.0-beta.9 공개 완료 + v0.4 handoff (2026-04-24) → PASS** — 이번 세션 **beta.8 hotfix** (첫 SSH 접속 TOFU 모달 미노출) + **beta.9 퀵윈 3 스프린트** (Mermaid fix · 자동 싱크 · 최근 이미지 탭) 2 릴리스 공개. origin/main = `ea6f80f`. tag `v0.3.0-beta.8`, `v0.3.0-beta.9` 양쪽 push 완료. **GitHub Release 2건 공개**: beta.8 (c96afde0… arm64 · 7760b20a… x64), beta.9 (5aea3f06… arm64 · fb9bbf26… x64). **총 커밋 8건**: beta.8 release(a976b59)+notes(607b9dc), beta.9 Plan(e02e51f)+S1(a1b4548)+S2(9380f4a)+S3(dc01c58)+release(f97b2dd)+SHA256(ea6f80f). **핵심 발견**: Evaluator 가 S2 에서 Major 차단 — `startWatcher` 가 v0.1 이후 전역 disable 상태(코드베이스 전체에서 호출 0). 방어 장치(IGNORE_DIR_NAMES + isViewable + ignoreInitial + debounce) 재검토 후 initializeApp/workspace:add/remove/before-quit 에 배선 복구. 사용자 원래 요구("문서 추가/수정/삭제 자동 반영")도 덤으로 해소. **DMG 빌드 이슈 1회**: x64 hdiutil resize EAGAIN(exit 35) — 마운트된 DMG 정리 + 부분 파일 삭제 후 재시도 성공. **다음 세션 handoff**: 남은 피드백 4건(#3 하이라이팅 · #4 ASCII art · #6 뷰어 리디자인 · #7 UX 친화 개편) + SSH 프로젝트 목록 자동 갱신 → v0.4 UX Overhaul 릴리스로 묶음. 진입 경로 §"다음 세션 — v0.4 UX Overhaul Handoff" 참조. 권장: /nova:ux-audit 선행(방향 A) → /nova:plan/deepplan → /nova:design → 구현 스프린트. | 2026-04-24T
- **v0.3.0-beta.9 퀵윈 3 스프린트 구현 (2026-04-24) → PASS** — Plan: `docs/plans/v0.3.0-beta.9-quickwin.md`. Evaluator 1차 S2 Major 지적 반영 후 재검증 PASS. **S1 Mermaid fix**: `mermaid.initialize` 에 루트 `htmlLabels: true` + `fontFamily`/`themeVariables.fontSize` + `flowchart.{padding:16, nodeSpacing:50, rankSpacing:60, diagramPadding:12, useMaxWidth:true}` 주입, `buildConfig()` 공유 헬퍼로 `getMermaid`/`setMermaidTheme` 양 경로 일관. CSS `.mermaid-block svg { max-width: 100%; height: auto; }` + `foreignObject { overflow: visible }` 가드. **S2 auto-sync**: 로컬 watcher 전역 활성화(v0.1 이후 disable 상태 → Evaluator 가 지적한 차단 이슈 해소). `startWatcher` 를 `initializeApp` 에서 기동, `workspace:add` 핸들러에서 `addWatchRoots`, `workspace:remove` 에서 `removeWatchRoot`, `before-quit` 에서 `stopWatcher`. 신규 `fs:project-change` IPC (depth ≤ 2 디렉토리 변화 500ms debounce) + renderer 2s 쓰로틀 후 `bumpRefreshKey` 호출. **S3 image tab**: `RecentDocsPanel` 에 `role="tablist"` + 2 탭(문서/이미지) + `role="tabpanel"` + ArrowLeft/Right 키보드 내비게이션 + `aria-selected`/`aria-controls`/`aria-labelledby` 동적. prefs `recentDocsTab` 저장·복원, 양 탭 empty 시 panel null, 한쪽만 empty 면 i18n 문구 표시. ko/en locale 5키 신규. **Evaluator**(nova:qa-engineer, 독립 서브에이전트): 1차 — S1 PASS, S2 **FAIL**(Major: startWatcher 미기동), S3 PASS(Minor 2: role=tabpanel/arrow key). **반영 후 재검증 불필요한 항목 확인 (grep + typecheck + tests)**: startWatcher 호출부 3곳 확인, role=tabpanel + ArrowLeft/Right 코드 확인. typecheck PASS · vitest 250/260(회귀 0, 10 pre-existing fail). 커밋: Plan · S1 · S2 · S3 · Release 5 commit 예정. | 2026-04-24T
- **/nova:plan → docs/plans/v0.3.0-beta.9-quickwin.md 작성 완료 (2026-04-24)** — 사용자 기능 피드백 7건 triage 후 퀵윈 3건(#5 Mermaid 글자 짤림·#2 프로젝트 목록 자동 싱크·#1 최근 7일 이미지 탭) 묶어 beta.9 릴리스 Plan 작성. CPS 프레임워크, 3 스프린트(S1 Mermaid + S2 Auto-sync + S3 Image tab) + Release. 각 스프린트 파일 교집합 0 → 독립 검증. 제외(Known Gap 이관): #3 하이라이팅(annotation data model 필요·별도 Plan), #6+#7 뷰어/UX 리디자인(/nova:ux-audit 선행 스프린트), #4 ASCII art 개선(6번과 묶음), SSH 원격 프로젝트 목록 자동 갱신(v0.4 이관). 사용자 승인 대기. | 2026-04-24T
- **v0.3.0-beta.8 hotfix — 첫 SSH 접속 TOFU 모달 미노출 (2026-04-24) → PASS** — 사용자 필드 제보: sue-dev PC(워크스페이스 0개 empty-state) 에서 `+ 원격 서버(SSH)` 첫 접속 시 인증서 신뢰 모달이 안 뜨고 20s 뒤 타임아웃. 터미널/VSCode 로는 정상 접속 → 네트워크/auth 이슈 아님. **원인**: `src/renderer/App.tsx` 의 `workspaces.length === 0` early-return 분기에 `<SshHostKeyPrompt />` 가 mount 되지 않아 `useSshHostKeyPrompt` 훅이 돌지 않음 → preload 의 `ipcRenderer.on('ssh:host-key-prompt', ...)` listener 미등록 → main `hostKeyPromptBridge.ts:89` 의 `activeWebContents.send()` 이벤트 공허 → `DEFAULT_PROMPT_TIMEOUT_MS = 20_000ms` 후 `verify(false)` → `SSH_HOST_KEY_REJECTED`. 워크스페이스가 1개 이상이면 두 번째 분기로 진입해 정상 동작(swk PC 관찰). **수정**: empty-state 분기에도 `<SshHostKeyPrompt />` 추가 (2줄, 코멘트 포함). `SshWorkspaceAddModal` 바로 위에 배치. **Evaluator**(nova:qa-engineer, 독립 서브에이전트): **PASS** 4/4 — (1) 논리 정합성: `createSshTransport` 는 `browseFolder` IPC 에서도 동일 경로 사용, listener 등록 경로가 `SshHostKeyPrompt.tsx` 단 1곳뿐임을 전 소스 검색으로 확인. (2) 회귀 위험: early-return 구조상 두 인스턴스 동시 mount 불가 → 중복 등록/메모리 누수 0. (3) 완결성: `handleSshSubmit` → `addSshWorkspace` 도 `createSshTransport` 경유로 동일하게 커버됨. (4) 빌드: typecheck PASS. **버전 bump**: 0.3.0-beta.7 → 0.3.0-beta.8. 2 파일 수정(package.json · src/renderer/App.tsx). | 2026-04-24T
- **영문 글로벌화 자료 일괄 추가 (2026-04-23) → PASS** — givepro91/markwand public repo 의 글로벌(star) 노출을 위한 영문 자산 전면 정비. **변경 10 파일**: (1) README.md 영문 메인 전환(배지 6종·pitch·positioning 표·기능 리스트·설치 링크·아키텍처·privacy·roadmap·contributing). (2) README.ko.md 로 한글 보존 + 상호 언어 스위처. (3) docs/install-macos.en.md 영문 설치 가이드(Sequoia/Tahoe 시스템 설정 + Sonoma 이하 우클릭 + SHA-256 + 트러블슈팅). (4) docs/install-macos.md 언어 스위처 헤더. (5) docs/launch/linkedin-post-en.md 3 variants(Problem/Solution · Before/After · BuildInPublic) + 해시태그 셋. (6) docs/launch/producthunt.md PH 태그라인·260자 설명·maker 첫 코멘트·갤러리 플랜·pre-emptive Q&A. (7) docs/launch/show-hn.md HN Show HN 제목·본문·반박 대응표(5종). (8) docs/release-notes/v0.3.0-beta.7.en.md + 한글판 언어 스위처 동기화. (9) package.json description 영문화. **GitHub repo 메타데이터 live 반영**: description 영문화, homepage=releases, topics 20개(markdown·markdown-viewer·electron·electron-app·react·typescript·claude-code·codex·ai·ai-tools·developer-tools·macos·productivity·knowledge-management·desktop-app·documentation·note-taking·reader·open-source·vibe-coding). **Evaluator**(nova:senior-dev, 독립 서브에이전트): **VERDICT: PASS**. 확인 항목 6: (1) 스택 정확성 — Architecture 표의 Electron 33/React 19/TS 5/Zustand 5/chokidar 4/ssh2 1.17 모두 package.json 일치. (2) 기능 주장 — RecentDocsPanel.tsx/FilterBar.tsx sources filter/driftReports/image viewer/CommandPalette/rehype-sanitize/i18next 8건 전부 src/ 에서 실증. (3) 링크 무결성 — 상대 경로 8건 전부 existing. (4) 일관성 — SHA-256 (`463b2420…f49a` arm64 · `345a8592…cefd4` x64) + 2026-04-22 build date + `0.3.0-beta.7` 모두 byte-identical. (5) Privacy 주장 — analytics/telemetry/tracking/sentry/posthog/mixpanel/segment 0건 grep 확인, CSP connect-src `'self' app: ws: wss:` 외부 HTTP 불가. (6) 브랜딩 — Windows/Linux 허구 타임라인 없음, macOS-first 일관. Nits 2건(install-macos.en.md L101 `beta.2` 잔류 · package.json author jay@spacewalk.tech 와 LICENSE © Spacewalk 표기 불일치) 비차단, 후속 처리. 소스 코드 변경 0, 버전 bump 0, 의존성 변경 0. | 2026-04-23T
- **세션 클로징 (2026-04-22, LinkedIn 런치 완료)** — 사용자 LinkedIn 포스트 업로드 성공(variant 는 사용자 선택). 이번 세션 커밋 5건 + 원격 반영 완료. origin/main = `3e3b906`. **주요 성과**: (1) **v0.3.0-beta.7 release** — RecentDocsPanel(7d) + i18n 잔여 + md-viewer→Markwand 통일. DMG SHA256 arm64 `463b2420…f49a` · x64 `345a8592…cefd4`. (2) **과거 release DMG asset 16개 제거** — beta.1~6 GitHub release asset + 로컬 dist/beta.6 + 로컬 releases/beta.1 (~2.2GB 회수). release page/notes/tag 는 보존. (3) **LinkedIn 런치 자료** — `docs/launch/` 에 한국어 포스트 3 variants + 녹화 스토리보드 + 커버 SVG 커밋. `docs/launch/markwand-demo.mp4`(1.1MB, 1600×862, 18.6s, gitignore) 편집 산출 — 원본 `check.mov`(46s, 4064×2192) 에서 **비공개 프로젝트 14개 노출 위험**(hpdf-poc·yeongjong.life·smith-pharm-*·tripnuri-app 등) 차단: 35s cutoff + 2.5x speed + 1600w downscale + 무음. `check.mov` 로컬 삭제. `.gitignore` 에 `*.mov`·`docs/launch/{mp4,gif,png}` 추가. **다음 세션 재개 가이드**: NOVA-STATE.md 자동 로드. 후속 후보(우선순위 순) — UX Audit FS9 후속(focus trap · 2단계 wizard · Empty State 2카드) · Performance(useDocs race · allDocs spread · Modal state hoist) · v0.3 Known Gap(⌘K 검색 backend · drift 코드 변경 감지) · LinkedIn 피드백 수신 시 이슈/기능 요청 처리. | 2026-04-22T
- **Release v0.3.0-beta.7 공개 완료 (2026-04-22, prerelease, 751a0e4)** — https://github.com/givepro91/markwand/releases/tag/v0.3.0-beta.7. **NEW 기능 RecentDocsPanel**: ProjectView 좌측 사이드바, 헤더와 FileTree 사이에 "최근 7일 문서" 별도 섹션. mtime ≥ now-7d & md-only & desc & MAX 10 + count badge + collapse(prefs `recentDocsCollapsed`) + 활성 항목 accent border. 시각 구분: var(--bg) 배경 + borderTop 1px + borderBottom 2px. 항목: 파일명 + 우측 상대일자(오늘/어제/N일 전) + title 절대일자. **자정 라벨 자동 갱신**(60s setInterval). **hydration 전 null 반환** → flash 0. **빈 상태 null 반환** → 헷갈림 방지. defensive NaN/negative guard(SFTP attrs.mtime=0). a11y: aria-expanded + aria-controls + aria-current + focus-visible outline. **md-viewer→Markwand 전면 통일**: index.html title, README, electron-store name(md-viewer.json→markwand.json — 사용자 동의 prefs 1회 유실), CSS Highlight 식별자(globals.css + findInContainer.ts). **i18n 잔여 6건**: App.tsx 토스트 3건(staleSelectionRemoved/lastSelectionRestored(Partial)/cmdkHint) + ProjectView selectFileDesc + AllProjectsView groupAria + sshTransportDisabled 영문 라벨('Experimental→SSH Remote Transport') 정합화('베타 기능→원격 SSH 서버 연결' / 'Beta features→Remote SSH server'). recentDocs 키 9개 신규. **검증**: typecheck PASS · vitest 250/260(회귀 0, 10 fail 모두 pre-existing) · Evaluator(nova:senior-dev) CONDITIONAL→Major 2(filteredDocs→docs, hydration null guard) + Minor 2(.recent-doc-item:hover CSS, aria-controls) + Note 1(NaN guard) 즉시 반영 → PASS. **SHA256**: arm64 `463b2420…f49a` (136MB) · x64 `345a8592…cefd4` (143MB). **커밋 4건**: afaf275 i18n / 3bf5c46 chore rename / 9a75734 feat recentDocs / 751a0e4 release. origin/main=`751a0e4`. | 2026-04-22T
- **세션 클로징 (2026-04-22)** — 이번 세션 총 7 커밋. 주요 성과: (1) **GitHub 프로필 정리** — public 26→5, 21개 private 전환 (archive 후 unarchive → private 3단계 우회). (2) **보안 점검 통과** — git history secret 0, 의존성 취약점 0, SSH 키 gitignore OK. (3) **MIT LICENSE** 추가. (4) **i18n (ko/en)** 도입 — react-i18next + 자동 감지 + Settings 토글 + 25 컴포넌트 전수 번역(App/Sidebar/ImageViewer/CommandPalette/FileTree/FilterBar/ProjectCard·Row/WorkspaceManage/ClaudeButton/Composer·Tray·Chip·Onboarding/InboxItem/Toast/TOC/MarkdownViewer/DriftPanel·Badge/ThemeToggle/InboxView/AllProjectsView/ProjectView 등). 남은 한글 5건은 Trans fallback + console.error 로 UI 미노출. (5) **버전 bump 규칙 memory 저장** — 사용자 명시 전 bump 금지. **origin/main = `66674e0`** (이전 release `v0.3.0-beta.6` 태그는 ce07caa 시점 유지, package.json version `0.3.0-beta.6` 그대로). 다음 세션 재개 시 사용자 dogfood 피드백 받은 후 일괄 beta.7 으로 bump 하는 흐름 권장.
- **Release v0.3.0-beta.6 공개 완료 (2026-04-22, prerelease, c46f602)** — https://github.com/givepro91/markwand/releases/tag/v0.3.0-beta.6. **i18n 다국어 지원**: react-i18next 도입, ko/en 리소스 분리(`src/renderer/i18n/locales/{ko,en}.json`), 시스템 언어 자동 감지 + Settings 수동 토글, prefs `language` 저장. 주요 진입 플로우 번역(SshWorkspaceAddModal·SshHostKeyPrompt·Settings·WorkspacePicker·App Empty/loading·ProjectView 파일트리 로딩). humanizeError 9종 t() 기반 재작성. Trans 컴포넌트로 <strong>/<code> 마크업 유지. **LICENSE**: MIT 추가 + package.json license 필드. **보안 점검 통과**: git history/코드 내 secret 0, 의존성 취약점 0, SSH 키 gitignore OK. 공개 준비 완료. **SHA256**: arm64 `74fb37ba…b784` · x64 `bebfb2a2…1ee5f`. | 2026-04-22T
- **Release v0.3.0-beta.5 공개 완료 (2026-04-22, prerelease, ce07caa)** — https://github.com/givepro91/markwand/releases/tag/v0.3.0-beta.5. **앱 아이콘 추가**: resources/icon.icns (376KB) — 마크다운 M↓ + 블루 그라디언트(#3B82F6→#1D4ED8) + macOS squircle(224px radius). SVG 소스(build/icon.svg) → sips 로 10 사이즈 PNG → iconutil icns. 도구 체인 재사용 가능. **HTML 다크모드 수정**: beta.4 의 `@media dark .card` 가 일반 `.card { bg:#fff }` 보다 앞에 있어 cascade 에서 덮어써지던 CSS 순서 버그 해소. 단일 통합 dark block 을 맨 끝 배치 + 모든 요소 명시적 color. **SHA256**: arm64 `06ff61e3…290de16022` · x64 `76eb7058…42a925dd`. | 2026-04-22T
- **Release v0.3.0-beta.4 공개 완료 (2026-04-22, prerelease, e464ea5)** — https://github.com/givepro91/markwand/releases/tag/v0.3.0-beta.4. beta.3 의 `.webloc` 파일이 macOS Tahoe(26.2)에서 "문서 콘텐츠 읽을 수 없음" 에러로 파싱 실패 → `.html` 파일로 교체. `build/여기를 먼저 더블클릭.html` 신규(meta http-equiv refresh + 큰 "시스템 설정 열기" 버튼 + 라이트/다크 CSS). Finder 기본 핸들러(Safari) 경로로 안정화. **SHA256**: arm64 `668eb44b…fbd686fd` · x64 `afb7cc01…ee5505725`. | 2026-04-22T
- **Release v0.3.0-beta.3 공개 완료 (2026-04-22, prerelease, 5b10763)** — https://github.com/givepro91/markwand/releases/tag/v0.3.0-beta.3. DMG 창에 `설치 도움말.webloc` 파일 내장 → 더블클릭 시 시스템 설정(개인정보 보호 및 보안) 자동 열림. `build/설치 도움말.webloc` + package.json dmg.contents 배치(560×400, 3 아이콘). install-macos.md Step 4 에 webloc 경로 승격. beta.2 대비 기능·서명 체계 동일, DMG UX 만 개선. **SHA256**: arm64 `6cb39514…9b2d1` · x64 `f2d35346…57aeb5`. | 2026-04-22T
- **Release v0.3.0-beta.2 공개 완료 (2026-04-22, prerelease, 17b872d)** — https://github.com/givepro91/markwand/releases/tag/v0.3.0-beta.2. beta.1 의 macOS Sequoia "손상되었습니다" 경고 해소 목적 재빌드 (기능 변경 없음). **변경**: `build/afterPack.js` 신규 — packaging 직후 `codesign --force --deep --sign - --identifier tech.spacewalk.markwand` 로 ad-hoc 재서명 (Electron 기본 `linker-signed` + Identifier=Electron → 진짜 adhoc + 고유 identifier). `hardenedRuntime: true → false` (공증 없으면 해로움), entitlements 제거, `identity: null` 명시. **설치 UX**: 터미널 명령 불필요 → "우클릭 → 열기 → 열기" 3클릭. **SHA256**: arm64 `4a616f3…34151` (128.9MB) · x64 `8a04662…1d624` (135.5MB). gh switch jay-swk→givepro91 로 release 생성 성공. | 2026-04-22T
- **Release v0.3.0-beta.1 공개 완료 (2026-04-22, prerelease)** — https://github.com/givepro91/markwand/releases/tag/v0.3.0-beta.1. DMG arm64+x64 업로드 완료, SHA256 digest 자동 기록됨. gh CLI 계정 jay-swk → givepro91 switch 후 생성. 로컬 내부 공유 번들(`releases/v0.3.0-beta.1/`) 도 준비 완료.
- **Release v0.3.0-beta.1 준비 완료 (2026-04-22, 95aed6d, tag `v0.3.0-beta.1`)** — 원격 SSH 서버 지원 베타. package.json 0.2.0 → 0.3.0-beta.1. `docs/release-notes/v0.3.0-beta.1.md` 신규. install-macos.md arm64/x64 SHA256 기입. **DMG**: `dist/Markwand-0.3.0-beta.1-arm64.dmg` (136MB, SHA256 `39c19fc…e983dc8`) · `dist/Markwand-0.3.0-beta.1.dmg` (141MB, x64, SHA256 `8206eea…ad12cc`). **빌드 이슈 해결**: electron-builder `npmRebuild: false` 추가 — node-gyp Python 3.12 distutils 부재 우회(ssh2/cpu-features prebuilt 사용). tag push 완료 (origin/main=95aed6d). GitHub Release 생성은 사용자 결정 대기. | 2026-04-22T
- **FS9-A/B/C 완료 (2026-04-21~22)** — UX Audit 후속 3 커밋. FS9-A(ad665ab): UI 전면 한국어화 + 원격 폴더 picker(ssh:browse-folder) + 에러 맵 9종 + TOFU 영구저장 고지 + radio fieldset + 에러 focus 이동. FS9-B(f18e61c): 파일트리 로딩 UI(useDocs isScanning) + SSH single 강제(container 비활성) + WorkspacePicker "🌐 서버/프로젝트" + 원격 이미지 IPC(ssh:read-image · SshImage 컴포넌트). FS9-C(248a4a4): ImageViewer SSH 분기 + workspace id 에 root 포함하여 같은 서버 여러 폴더 등록 가능(computeSshWorkspaceId). | 2026-04-22T
- **/nova:ux-audit → Critical 4 / High 12 / Medium 13 / Low 3 — SSH 플로우 5인 적대적 평가 (2026-04-21)** — SshWorkspaceAddModal + SshHostKeyPrompt + Settings + WorkspacePicker + TransportBadge 대상. **평가자 1 Newcomer**(C3/H3/M2) 영문 기술어 하드코딩·TOFU 설명 부재·root POSIX 수동입력. **평가자 2 Accessibility**(C2/H4/M2) focus trap 부재·SHA256 낭독 지옥·fieldset 부재·radio 그룹 미구조화·reduced-motion 전무. **평가자 3 Cognitive Load**(C3/H3/M2+D3) 9필드 동시 노출(Miller's Law)·TOFU 5개념·재시작 수동·인라인 CSS 500+줄(Button 컴포넌트 미사용). **평가자 4 Performance**(H3/M4/L1) useDocs listener race·allDocs spread O(N)·Modal unmount 로 ssh:load-config 매번 재호출·BFS 완료 후 첫 chunk yield. **평가자 5 Dark Pattern**(H3/M3/L2) TOFU "Trust" 영구 저장 hidden commitment·mode single "(추천)" pre-selection·workspace 제거 시 host key 고지 부재. **잘 된 점**: DC-4 bypass 0 (Trust 버튼 DOM 제거 + destructive default focus), 디자인 토큰 92개, WorkspacePicker optgroup. **다음 스프린트 FS9** 에서 Critical·High 우선 반영 예정 (수정 전 사용자 승인). | 2026-04-21T
- **/nova:auto → Follow-up FS0~FS3 PASS (orch-mo8kphh7-zsuc, 2026-04-21)** — SSH e2e 경로 **완성**. 사용자 목표("로컬 앱 → SSH workspace 추가 → 문서 보기") 달성. **Plan(a2bb8cf)**: docs/plans/remote-fs-transport-followup.md(701→321 lines 압축, 4 sprints, D-1 path prefix 역매핑 · D-2 scanProjectsSsh 별도 함수). **FS0+FS1(8781617)**: `parseWorkspaceAddSshInput` root + `isValidSshRoot` depth≥2 검증 · `scanProjectsSsh` SFTP depth 2 탐색 + `scanProjectsViaSftp` 테스트 헬퍼 · `workspace:add-ssh` root 하드코딩(`/`) 제거 · `getOrScanProjects` SSH 분기 · IPC 3개 `getActiveTransport` 경유 · `fs:read-doc` `resolveTransportForPath` 헬퍼(prefix 충돌 방어) · `assertInWorkspace posix` 전달. **FS2(161050e)**: WorkspacePicker `__add_ssh__` 조건부 렌더(DC-6 — flag off 시 DOM 제거) · `SshWorkspaceAddModal` 폼(host/port/user/auth/root/loading race 방어) · Settings Experimental 섹션 · useWorkspace `addSshWorkspace` · App.tsx 배선. **FS3(3a19a68)**: integration 3건 신규(T-ipc-scan/docs/read — 9/9 PASS, Docker sshd) + M-2 주석 보강. **Evaluator**(nova:senior-dev): CONDITIONAL PASS → M-1(FS3 커밋) + M-2(IGNORE 주석) 즉시 반영 → PASS. **검증**: typecheck PASS · vitest 254/244(회귀 0) · drift-smoke 21/21 · integration 9/9(Docker) · bench:transport DC-5 전항목 개선(-10~-38%). | 2026-04-21T
- context compacted | 2026-04-21T11:36:55Z
- **세션 클로징 (2026-04-21)** — M3·M4 SSH 인프라 완성 + 원격 push 완료(origin/main=`7da2e83`, 이 세션 8 커밋 `c16590f..7da2e83`). **⚠️ SSH 는 "연결만 가능, 실 파일 접근 불가" 상태**: workspace:add-ssh IPC 는 동작하나 scan/read 가 localTransport 하드코딩(M-2 Known Gap, v1.0 follow-up High). 다음 세션 결정 필요: (A) PR-A IPC 분기 즉시 착수, (B) v0.3 피드백 사이클 먼저(DC-6 원칙), (C) UI 먼저(WorkspacePicker). 다음 세션 진입 경로 §"다음 세션 — M3·M4 SSH Follow-up 착수 Handoff" 참조. Known Gap 6건 신규 등록(M-2 High / WorkspacePicker Medium / scanProjects SSH Medium / watcher 테스트 Low / CI workflow Low / axe-core Low).
- **/nova:auto → SSH 작업 종료 CONDITIONAL PASS (orch-mo8eyoda-c364, 2026-04-21)** — S2 후반부 + S3 + S4 3 스프린트 일괄 실행. **S2 후반부(eb40d53)**: hostKeyPromptBridge(nonce+20s 타임아웃 DC-4 실증 9 tests)+ipc/ssh.ts+SshHostKeyPrompt/TransportBadge+useTransportStatus/useSshHostKeyPrompt+CSS 토큰. **S3(ed17c58)**: pool.ts(DC-2 active+warm+eviction+dispose 13 tests)+resolve.ts+WorkspaceTransport union+experimentalFeatures flag+App.tsx mount+before-quit disposeAll. **S4(d0e93ea+evaluator fix)**: watcher.ts SshPoller(5 tests)+test-integration-ssh.ts 6/6 PASS. **통합 Evaluator**(nova:senior-dev): Critical 1(transport:status IPC send 부재)+Major 3(watcher error→pool offline 연결, IPC 7개 분기, workspace:add-ssh)+Minor 5 발견 → Critical+M-1+M-3 즉시 반영(SshClient.onClose/onError 추가, wrappedWatcher error 구독, workspace:add-ssh 신설), M-2(IPC 분기)·UI·axe-core·CI workflow·watcher 상세 테스트는 Known Gap 이관. **검증**: typecheck PASS · vitest 232/222(회귀 0) · drift-smoke 21/21 · bench DC-5 로컬 회귀 0 · Docker 통합 6/6 PASS(TOFU·readFile·FILE_TOO_LARGE·scanDocs·DC-4 reject·watcher). | 2026-04-21T
- **/nova:deepplan → REFINED (2026-04-21)** — `docs/plans/remote-fs-transport-m3-m4.md` 생성 (701 lines, Mode: deep, Iterations: 1). Explorer×3 병렬(A 현 Transport 계층 매핑·6 IPC 중 5 경유·RM-7 정밀 분석 / B ssh2 v1.17.0 + @types/ssh2 1.15.5 + ssh-config cyjake 추천·cpu-features 비활성 경로·Electron 33 번들링·VSCode Remote-SSH 참조 / C 폴링 30s·동적 2구간·TOFU 4필드·keepalive 30s+backoff cap 60s·feature flag strategy C+D·Docker sshd 6 케이스·a11y WCAG 1.4.11) → Synthesizer 5 sprints(S0~S4, 7.5d) → Critic(nova:architect) **CONDITIONAL PASS** (Critical 1 / Major 5 / Minor 5) → Refiner 전 항목 반영. **핵심 결정**: (1) RM-7 M3 선행(S0.2) — SSH scanner 계약 안정화 우선, (2) Scope Guard 예외 명시(parseFrontmatter 시그니처 변경은 Transport interface 외부 아님), (3) hostVerifier race/timeout 방어(nonce IPC + 20s 타임아웃), (4) SFTP attrs.mtime=0 폴백(size 기반 change 판정), (5) pool.ts eviction + dispose 경로 명시, (6) S2를 1.5d→2.5d 조정, (7) test keypair ephemeral 생성(git 체크인 0). 사용자 결정 4건 대기. | 2026-04-21T
- **U2 해소: 실 워크스페이스 벤치 (08c4138)** — `/Users/keunsik/develop`(2377 md files, 17 projects, 4 container subdirs) 절대값 기록. scanDocs p95 **531ms** / countDocs p95 **223ms** / fs.stat per-file **4μs** / readFile **0.1ms** / detectWorkspaceMode **0.48ms**. DC-5 +3% 게이트는 실측 범위에서 의미 있음 (fixture sub-ms는 대부분 noise gate). 기록: `docs/verifications/bench-realws-2026-04-21.json`. fixture baseline(scripts/bench-transport.baseline.json)은 DC-5 게이트로 그대로 유지. 벤치 스크립트 2건 패치(EACCES silent skip·top-level dotfolder 배제·0-file 전체 합계 판정) — 실 워크스페이스 호환성. typecheck PASS · fixture 벤치 재실행 PASS. | 2026-04-21T
- **세션 클로징 (2026-04-21)** — v0.9 M1·M2·Bench 전부 원격 반영(9 커밋, c16590f..686bf43). 다음 세션 = **M3+ SSH Transport PoC**. 진입 경로는 §다음 세션 — SSH (M3+) 착수 Handoff. 현재 blocker 0, 미해소 Known Gap 중 M1/M2 연계는 RM-7(project:scan-docs M4 합류) 1건. 그 외 v0.2~v0.3 Known Gap (⌘K 검색 backend High, drift 코드 감지 Medium, drift mtime 정밀도 Low 등)은 M3+ 와 독립이라 병행 가능.
- /nova:auto 연속 — v0.9 M1·M2 보조·Bench 3개 스프린트 완료. **S2 M2 Hash 보조 (bce47fc)**: `src/lib/drift/hash.ts` sha256 contentHash + (path, mtimeMs, size) 키 인메모리 Map 캐시 + invalidateHash/clearHashCache API. `VerifiedReference.hashAtCheck?` 필드 추가. `drift:verify`가 판정 직후 병행 계산(디렉토리/크기초과/IO 실패 silent undefined fallback). 판정은 mtime 유지 (U-M2-1 승인 scope). hash.test.ts 5/5 PASS. **S3 Bench Harness (9c5a076)**: `scripts/bench-transport.ts` 5 hot path 측정(scanDocs/countDocs/fs.stat/readFile/detectWorkspaceMode), fixture 자동 생성(5 projects × 50 md × 3단 계층, tmpdir), 3회 반복 p50/p95/p99 + stdDev, baseline.json 비교, **noise floor 로직**(절대 <0.5ms 또는 baseline <1ms 스킵 — sub-ms fixture 과민 방지). `pnpm run bench:transport` script. baseline은 머신별이라 gitignore. 2차 실행 PASS 확인. typecheck PASS · 전체 suite 131/141 PASS · drift-smoke 21/21 PASS · 회귀 0. | 2026-04-21T
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
- **Active Plan**: `docs/plans/remote-fs-transport-followup.md` (v1.0 Follow-up, FS0~FS3 완료 2026-04-21)
- Completed Plan: `docs/plans/remote-fs-transport-m3-m4.md` (v1.0 M3·M4, refined 2026-04-21)
- **Active Design**: docs/designs/remote-fs-transport.md (v1.0 SSH Transport — §2.2 rev. M1 적용, M3~M8)
- Completed Plan: docs/plans/remote-fs-transport-m1-m2.md (v0.9 M1·M2·Bench, approved 2026-04-21)
- Prior Plan: docs/plans/image-viewer-mvp.md (v0.3 Viewable Asset — S1+S2 완료)
- Prior Plan: docs/plans/markwand-context-composer-mvp.md (v0.2 Context Composer, 일부 스코프 피벗)
- Prior Design: docs/designs/markwand-context-composer.md (v0.2)
- Prior Plan: docs/plans/md-viewer-mvp.md (v0.1 완료)
- Prior Design: docs/designs/md-viewer-mvp.md (v0.1 완료)
- Last Verification: U2 실 워크스페이스 벤치 PASS (2026-04-21, docs/verifications/bench-realws-2026-04-21.json). v0.9 GUI 수동 검증은 여전히 사용자 실행 대기 (`pnpm dev`).
- Orchestration ID (최근): orch-mo8kphh7-zsuc (Follow-up FS0~FS3 — completed, Evaluator CONDITIONAL→PASS)
- Orchestration ID (이전): orch-mo8eyoda-c364 (M3·M4 SSH 완성 — completed)
- Orchestration ID (이전): orch-mo86dcfj-bdu2 (v0.9 M1 S1 — completed)

## 다음 세션 — M3·M4 SSH Follow-up 착수 Handoff (2026-04-21 세션 마무리)

### 이 세션에서 완료된 것
- **S0**(50eb6ec): ssh2 ABI 검증 + RM-7 해소(parseFrontmatter FsDriver 시그니처 + composeDocsFromFileStats IPC 헬퍼)
- **GUI fix**(8d0e771): drift `--badge-bg/text` 오판 + fixture 워크스페이스 혼입
- **S1**(b7ba373): SshTransport 기본 PoC (client/fs/scanner/promisifiedSftp + DC-4 bypass 0 실증)
- **S2 전반부**(3c48a81): hostKeyDb TOFU + ssh_config 파서 + reconnect backoff + ProxyJump 1-hop + handshake algorithm
- **S2 후반부**(eb40d53): hostKeyPromptBridge(nonce+20s 타임아웃) + TOFU 모달 + TransportBadge + useTransportStatus hook + CSS 토큰
- **S3**(ed17c58): pool.ts(DC-2 active+warm+eviction) + workspace schema SSH + experimentalFeatures flag + App mount + before-quit disposeAll
- **S4**(d0e93ea): SshPoller watcher + test-integration-ssh.ts 6/6 PASS
- **Evaluator 반영**(7da2e83): transport:status IPC send + watcher→pool offline + workspace:add-ssh IPC

**origin/main = `7da2e83`** (8개 커밋 push 완료, `c16590f..7da2e83` 총 19개 커밋 반영)

### 🚨 현재 SSH는 "연결만 가능, 실 파일 접근 불가" 상태

**동작하는 것**:
- ssh2 연결 + TOFU 모달 + DC-4 bypass 방어
- Docker sshd 통합 6/6 (readFile · scanDocs · attrs.mtime · reject · watcher)
- `window.api.workspace.addSsh({...})` IPC 호출로 워크스페이스 등록

**동작하지 않는 것** (통합 Evaluator M-2, Known Gap 이관):
- SSH workspace 선택 시 파일 트리에 파일이 안 보임 — `project:scan-docs` 가 `localTransport` 하드코딩
- md 클릭해도 내용 안 열림 — `fs:read-doc` 동일
- drift 검증 동작 안 함 — `drift:verify` 동일
- WorkspacePicker에 "Remote (SSH)" 옵션 없음 — UI 미구현, DevTools Console 만으로 호출 가능
- Settings Experimental 섹션 UI 없음 — `MARKWAND_SSH=1` env 또는 prefs 직접 설정만

### 다음 세션 진입 전 사용자 결정 필요

| 옵션 | 진입 경로 | 소요 | 권장도 |
|------|----------|------|--------|
| **A. PR-A 즉시 착수** (IPC 7개 transport 분기 + scanProjects SSH) | 새 Plan(`docs/plans/remote-fs-transport-followup.md`) 작성 → `/nova:deepplan` → `/nova:auto` | 2~3일 | SSH 실사용 원하면 필수 |
| **B. v0.3 피드백 사이클 먼저** | 로컬 GUI 검증 + 다른 Known Gap(⌘K 검색 High / drift 코드 감지 Medium / FilterBar UI Medium) 해소 | 1~2일 | DC-6 phasing 원칙 부합 |
| **C. 하이브리드** | PR-B UI만 먼저 (WorkspacePicker SSH 옵션) → 사용자가 Console 없이 시도 → 피드백 기반으로 PR-A | 1일 | UX 먼저 검증 |

**내 추천**: **B (v0.3 피드백 사이클)**. 이유:
- 통합 Evaluator가 "개발자 dogfood 불가" 진단 — PR-A 없이는 SSH 실 사용 못 함
- Plan `/nova:ux-audit` DC-6 원칙("M3+는 v0.3 피드백 사이클 후")에 부합
- v0.2~v0.3 Known Gap (⌘K High · drift 코드 감지 Medium · FilterBar Medium 등)이 실 사용자에게 더 직접 영향

### SSH 실 접근 테스트하려면 (옵션 A 선행 전에도 가능한 제한적 경로)

```bash
# 1. Docker sshd 기동
docker compose -f tests/fixtures/ssh/docker-compose.yml up -d

# 2. feature flag on
MARKWAND_SSH=1 pnpm dev

# 3. DevTools Console 에서
window.api.workspace.addSsh({
  name: 'test-sshd',
  host: '127.0.0.1',
  port: 2222,
  user: 'markwand',
  auth: { kind: 'key-file', path: '/Users/keunsik/develop/givepro91/markwand/tests/fixtures/ssh/keys/id_ed25519' }
})
# → TOFU 모달 뜨면 Trust → workspace 등록됨 (사이드바에 표시)
# → 단 PR-A 미완료라 파일 트리는 비어있음

# 정리
docker compose -f tests/fixtures/ssh/docker-compose.yml down
```

### 이미 결정된 것 (재확인 불필요)
- DC-1~DC-7 전부 구현됨(일부 M-2 미완)
- 상태 어휘 3종, workspaceId sha1(user@host:port)[0:16], ProxyJump 1-hop(재귀 금지)
- TOFU sha256 주 방어선, algorithm 보조, firstSeenAt 보존 로직
- reconnect backoff 1s→16s(6 attempts), jitter 200ms
- Polling 30s/60s 동적 2구간, debounce 2000ms, AbortController 취소

### 다음 세션 첫 명령어 후보

```bash
# 옵션 A (PR-A 즉시):
/nova:deepplan --target docs/plans/remote-fs-transport-followup.md \
  --scope "IPC 7개 transport 분기 + scanProjects SSH + WorkspacePicker/Settings UI + watcher fs:change 통합"

# 옵션 B (v0.3 피드백):
# 먼저 GUI dogfood (SSH 제외하고 로컬 기능만)
pnpm dev
# 피드백 후 /nova:plan 으로 다음 작업 선정

# 옵션 C (UI만 먼저):
/nova:plan "WorkspacePicker SSH 옵션 + Settings Experimental 섹션 — PR-A 선행 없이도 워크스페이스 UI 등록 가능하게"
```

## 다음 단계 (사용자 액션) — 로컬 골든 패스 (v0.3 범위, SSH 이전 회귀 확인용)

```bash
cd /Users/keunsik/develop/givepro91/markwand
pnpm dev
```

1. 워크스페이스 추가 → `~/develop` 선택
2. All Projects 카드 그리드 확인
3. 프로젝트 선택 → md 클릭 → 코드 하이라이팅 + mermaid 렌더
4. Inbox 뷰 → 4단 시간 그룹
5. 다크 토글
6. drift 패널 + 이미지 뷰어 회귀 0
6. ProjectView 헤더 "Open in Claude" → claude CLI 실행 확인
7. **v0.9 추가**: drift 패널 열기 → `hashAtCheck` 필드 포함 여부 DevTools 에서 확인 (IPC 페이로드)
8. **v0.9 추가**: 대용량(>2MB) md 파일 열기 시도 → `FILE_TOO_LARGE` 에러 노출 (기존 Known Risk 해소 동작)
