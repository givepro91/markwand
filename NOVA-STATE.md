# Nova State

## Current
- **Goal**: AI 산출물 큐레이터 데스크톱 뷰어 (Electron 33 + React 19 + TS) MVP v0.1
- **Phase**: built — 첫 실행/사용자 검증 대기
- **Blocker**: none

## Tasks
| Task | Status | Verdict | Note |
|------|--------|---------|------|
| Plan/Design 작성 | done | PASS | docs/plans/md-viewer-mvp.md, docs/designs/md-viewer-mvp.md |
| Wave 1 (S1+S2 Foundation/Workspace/FS, 24파일) | done | PASS | Fix 4건 후 |
| Wave 2 (S3+S4+S5 Viewer/Views/Claude CLI, 29파일) | done | PASS | Fix 5건 후 |
| 첫 GUI 실행 검증 (사용자) | todo | - | `pnpm dev` 또는 `pnpm dist:mac` |

## Recently Done (최근 3개)
| Task | Completed | Verdict | Ref |
|------|-----------|---------|-----|
| 문서 내 검색 커스텀 구현 (TreeWalker + CSS Highlight API, Electron findInPage 대체) + SafeImage fallback | 2026-04-20 | CONDITIONAL PASS | perf/UX |
| 문서 내 검색 next 버튼 딜레이 최적화 (MarkdownViewer memo + components useMemo + slugCounter 클로저化) | 2026-04-20 | CONDITIONAL PASS | /nova:review perf |
| Wave 2 Fix (execa ESM, FileTree buildTree, Shiki CSS, ClaudeButton 장착, Plan 수정) | 2026-04-20 | PASS | orch-mo6k958z-f1gh |

## Known Risks
| 위험 | 심각도 | 상태 |
|------|--------|------|
| GUI 실행 미검증 (BrowserWindow 생성, FileTree 실 렌더, mermaid IntersectionObserver) | Medium | 사용자 첫 실행에서 확인 필요 |
| 5k 노드 트리 렌더 성능 (FileTree height=undefined) | Medium | U2 미측정, 큰 워크스페이스 등록 시 확인 |
| chokidar 500dirs×10files RSS 미실측 | Low | U1, scripts/bench-watcher.ts 자리 비어있음 |
| Gatekeeper unsigned dmg 첫 실행 우회 | Medium | U4, `pnpm dist:mac` 후 실측 |
| 시스템 다크모드 첫 로드 시 light flash | Low | useTheme 초기화 타이밍 |

## Known Gaps (미커버 영역)
| 영역 | 미커버 내용 | 우선순위 |
|------|-----------|----------|
| docs-chunk 스트리밍 | 청크 IPC는 구현됐으나 useDocs는 collect 후 일괄 수신 | v0.2 |
| 글로벌 풀텍스트 검색 | 인박스/카드 그리드만 발견성 제공 | v0.2 |
| frontmatter 자동 태깅 | gray-matter 파싱은 fs:read-doc만 | v0.2 |
| 문서↔코드 sync 체크 | 별도 인프라 필요 | v0.2 |
| Windows/Linux 빌드 | osascript/path 분기 v0.1 미구현 (스텁만) | v0.2 |
| 코드사이닝 ($99/년) | 본인용은 xattr 우회 | v1.0 |
| readDocs GC + 추적 OFF 옵션 | read-only 일관성 모순 피드백 | v0.2 |

## 규칙 우회 이력 (감사 추적)
| 날짜 | 커맨드 | 우회 이유 | 사후 조치 |
|------|--------|----------|----------|
| — | — | — | — |

> --emergency 플래그 사용 또는 Evaluator 건너뛸 때 반드시 기록. 미기록 = Hard-Block.

## Last Activity
- 문서 내 검색 커스텀 구현 (findInContainer.ts 신규, TreeWalker+CSS Highlight API, 400ms→수ms, IME 포커스 탈취 해결) + SafeImage(private 배지 404 fallback) + Electron find IPC 제거 → CONDITIONAL PASS (독립 Evaluator: Critical 1·Warning 3 중 Warning 2 + 방어적 clearTimeout 반영, Warning 1은 test env 이슈로 skip) | 2026-04-20T08:30Z
- /nova:review --scope perf → CONDITIONAL PASS — MarkdownViewer memo/useMemo/slugCounter 클로저化로 find-in-page "다음" 1~2s 딜레이 제거 (typecheck/build PASS, 독립 Evaluator 검증) | 2026-04-20T08:00Z
- Wave E 사용자 피드백 5건 → PASS — FileTree 가상화 높이 측정(position:absolute + useLayoutEffect + docs 로드 시 재측정) / TOC id 매칭(slugify Unicode 보존 + sanitize clobber 해제 + 텍스트 fallback) / 카드 Finder 아이콘 / 인박스 pendingDocOpen / 프로젝트 lastViewedDocs | 2026-04-20T07:30Z
- Wave D 사용자 피드백 8건 → PASS — CSP img https / 인박스 필터 / 워크스페이스 제거 모달 / 카드 컴팩트+List 토글 / Claude 중복 방지+Finder fallback / 파일 검색 / 문서 내 검색(findInPage) / TOC | 2026-04-20T06:00Z
- UX Audit Wave A+B+C → PASS — 디자인 시스템 도입(33파일, 토큰 54+primitives 6+markdown.css), 빌드/스모크 OK | 2026-04-20T05:30Z
- /nova:ux-audit → Critical 6 / High 13 / Medium 12 / Low 4 — md-viewer MVP v0.1 전체 UI/UX | 2026-04-20T05:00Z
- /nova:auto --deep → PASS — md-viewer MVP v0.1 (53파일 신규, Plan/Design+Dev 2 Wave+QA 2 Wave+Fix 2 Wave) | 2026-04-20T03:18Z

## Refs
- Plan: docs/plans/md-viewer-mvp.md
- Design: docs/designs/md-viewer-mvp.md
- Last Verification: Wave 2 Fix 후 빌드/typecheck/main 프로세스 12초 정상 실행 (크래시 0건)
- Orchestration ID: orch-mo6k958z-f1gh

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
