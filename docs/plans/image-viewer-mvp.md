---
slug: image-viewer-mvp
mode: plan
iterations: 1
created: 2026-04-21
status: planned
scope: v0.3
---

# 이미지 뷰어 MVP v0.3 — Viewable Asset 확장

> **Mode**: plan (single-iteration, 후속 `/nova:auto` 실행 대상)
> **Pipeline next**: 이 Plan 승인 후 `/nova:run` 또는 `/nova:auto`로 구현→Evaluator→Fix 사이클.
> **Scope guard**: 이미지 뷰잉 **소비**만. 편집·슬라이드쇼·EXIF·PDF 등은 OUT.

## Context

Markwand v0.2까지는 "AI 산출물 큐레이터"로 포지셔닝되어 `.md` 문서만 1급 시민이었다. 그러나 실제 AI 산출물 디렉토리(`docs/`, `plans/`, `designs/`)에는 스크린샷·다이어그램 내보내기(`.png`, `.svg`)·UX 시안(`.jpg`)이 **md와 같은 맥락**으로 섞여 존재한다. 현재는:

- FileTree에 이미지가 **보이지 않는다** (scanner가 `**/*.md`만 수집).
- md 내부 `![alt](foo.png)` 참조로만 볼 수 있고, 파일 자체를 목록에서 열 방법이 없다.
- drift 검증 시 이미지 참조는 경로만 존재 여부로 판정되므로 "어떤 이미지가 있었는지" 앱 안에서 확인 불가.

사용자는 "md뿐 아니라 이미지까지 같은 뷰어에서 보고 싶다"고 요청 (2026-04-21 세션). 이는 Markwand의 정체성을 **Markdown 뷰어 → Viewable Asset 큐레이터**로 한 단계 넓히는 첫 확장이다.

## Problem

1. **표시 격차** — md만 트리에 보여 "이 프로젝트에 어떤 이미지가 있는지" 발견성 0.
2. **뷰잉 격차** — 이미지 파일을 직접 열 수단 없음. Finder 우회만 가능.
3. **맥락 상실** — md 안에 `![](foo.png)`로 박힌 이미지는 볼 수 있지만, 독립 파일(`screenshot-2026-04-21.png`)은 존재조차 감지되지 않음.

핵심 가설: **"viewable asset"을 Doc과 동등한 1급 시민으로 승격**하면, Markwand는 VSCode의 "Explorer + Preview"와 Obsidian의 "vault viewer"가 못 하는 **AI 산출물 전체 큐레이션**을 처음으로 제공할 수 있다.

## Solution

### Scope

**IN (v0.3)**
- 지원 확장자: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg` (app:// ALLOWED_EXTENSIONS와 1:1 정렬)
- scanner / watcher / useDocs / FileTree / ProjectView 뷰어 라우팅 확장
- 이미지 뷰어 컴포넌트 신규: 다크/라이트 배경 대응 + `Fit | 100% | Fill` 3-모드 토글 + 파일명·해상도·바이트 푸터
- 파일 트리 아이콘 분기(md vs image)
- 메모리 가드: **readFile 하지 않는다** — `app://절대경로` 직접 사용으로 IPC 우회 (이미 준비됨)

**OUT (v0.3 비포함)**
- pan/zoom 제스처, 회전, 저장, 클립보드 복사 (→ v0.3.1 후보)
- 슬라이드쇼, 썸네일 그리드, 메타데이터 패널, EXIF
- PDF·비디오·오디오·JSON 프리뷰 (→ v0.4 "viewable asset" 일반화 스프린트)
- 이미지 내 텍스트 검색(OCR), 편집 (영구 OUT)

### 변경 지점 (구체 파일:라인)

Explorer 조사 결과 기반. 모든 변경은 **기존 보안/스트리밍 인프라에 얹는 가산** 방식 — 재설계 없음.

| # | 파일 | 변경 |
|---|------|------|
| C1 | `src/main/services/scanner.ts:245,267` | fast-glob 패턴 `**/*.md` → `**/*.{md,png,jpg,jpeg,gif,webp,svg}` (countDocs 동일) |
| C2 | `src/main/services/watcher.ts:~91` | 확장자 필터를 `VIEWABLE_EXTS` 상수로 추출, `.md` 하드코딩 제거 |
| C3 | `src/lib/viewable.ts` **신규** | `VIEWABLE_EXTS` 상수 + `classifyAsset(path): 'md' \| 'image' \| null` 단일 진실원 |
| C4 | `src/renderer/hooks/useDocs.ts:~50` | path 필터를 `classifyAsset` 기반으로 변경 |
| C5 | `src/renderer/components/FileTree.tsx:~85` | `getFileIcon(name)` 도입 — md 아이콘/image 아이콘 분기 |
| C6 | `src/renderer/views/ProjectView.tsx:~216` | `loadDoc`에서 이미지 감지 시 readFile 스킵, `app://${doc.path}` URL만 state에 보관 |
| C7 | `src/renderer/views/ProjectView.tsx:~620` | 뷰어 라우팅 switch — image면 `<ImageViewer>`, 아니면 `<MarkdownViewer>` |
| C8 | `src/renderer/components/ImageViewer.tsx` **신규** | Fit/100%/Fill 토글 + 체스보드 배경(투명 영역 인지) + 로드 실패 fallback + 파일명·해상도·바이트 푸터 |
| C9 | `src/renderer/components/icons/ImageIcon.tsx` **신규** | 16px SVG 아이콘 (기존 FileIcon과 시각 밀도 맞춤) |

**의도적으로 건드리지 않는 곳:**
- `src/main/security/protocol.ts` — 이미 이미지 확장자 허용, 무변경 (회귀 위험 최소화)
- `src/main/ipc/fs.ts` — 이미지는 IPC 우회하므로 2MB 상한 로직과 무관
- `src/lib/drift/extractor.ts` — 참조 해석은 확장자 무관, 이미지 파일이 트리에 들어와도 drift 판정 로직 영향 없음
- `src/renderer/lib/findInContainer.ts`, `TableOfContents.tsx` — 이미지 뷰에는 텍스트 노드/헤딩 없으므로 자동 비활성화 (명시적 가드 불필요)

### ImageViewer UX 디테일

```
┌─────────────────────────────────────────────────┐
│ [Fit] [100%] [Fill]             screenshot.png  │  ← 상단 토크바 (right-align 파일명)
├─────────────────────────────────────────────────┤
│                                                 │
│         ┌──────────────┐                        │
│         │              │   (체스보드 배경 —     │
│         │   <img>      │    투명 영역 인지용)   │
│         │              │                        │
│         └──────────────┘                        │
│                                                 │
├─────────────────────────────────────────────────┤
│ 1920 × 1080 · 247 KB · .png                     │  ← 푸터 메타
└─────────────────────────────────────────────────┘
```

- `Fit`(기본): `max-width: 100%; max-height: calc(100vh - toolbar - footer); object-fit: contain`
- `100%`: 실 픽셀. 넘치면 스크롤.
- `Fill`: 컨테이너 채우기 (`object-fit: cover`) — 썸네일 확인용.
- 다크모드: 배경 `#1a1a1a`, 체스보드 grid 2개 톤 `#2a2a2a/#1f1f1f`.
- 해상도는 `<img onLoad>`에서 `naturalWidth/naturalHeight` 채집.
- 바이트는 **useDocs가 이미 가진 `size` 필드**(md와 동일) 사용, 별도 IPC 불필요. (※ scanner가 이미지 파일도 stat하는지 C1에서 동반 확인)

### 보안 / 메모리 게이트

- **메모리**: 이미지는 `<img src="app://...">`로 브라우저 스트리밍 → main 힙 안 쓴다. fs:read-doc의 2MB 상한 우회 이슈는 이미지에는 **적용되지 않음** (별도 드라이버).
- **app:// 검증**: 기존 3단(normalize → resolve → assertInWorkspace) 그대로 적용됨.
- **거대 이미지(>5000px)**: 브라우저 decode는 비동기·non-blocking, 프레임 드롭 가능하나 renderer 크래시 없음. v0.3에서는 경고 없이 렌더, v0.3.1에서 decode canary 추가 여부 결정.
- **SVG XSS**: `<img src="app://foo.svg">`는 브라우저가 document 컨텍스트로 실행하지 **않는다** (이미지 파싱만). inline `<svg>`를 dangerouslySetInnerHTML 하지 **않는다**는 원칙 고수. SVG 내 `<script>`는 무시됨.

## Risk Map

| ID | 영역 | 위험 | 영향 | 대응 |
|----|------|------|------|------|
| R1 | 성능 | 대형 이미지(≥8k·≥10MB) decode 시 프레임 드롭 | Low | `<img loading="lazy">` + "Fit" 기본, 실측 후 canary 결정 |
| R2 | 호환 | `.gif` 애니메이션이 Fill 모드에서 reflow 트리거 가능 | Low | `object-fit` 만 변경, 리렌더 안 일으키는 CSS only toggle |
| R3 | UX | 파일 트리에 이미지가 섞여 md 목록이 희석됨 | Medium | FileTree 검색 필터에 `type:md` / `type:image` 모드 추가 **옵션**, v0.3.1 후보 |
| R4 | 회귀 | scanner glob 확장으로 기존 `.md` 스트리밍 경로 이슈 발생 | High | useDocs 필터·store 수신부 단위 테스트 추가, ignoredExt fallback 유지 |
| R5 | drift | 이미지 파일이 워크스페이스에 대량(수백 MB) 존재 시 scanner 시간 증가 | Medium | fast-glob `stats: true` 옵션 on일 때 stat 비용 측정 (U1) |
| R6 | a11y | ImageViewer가 키보드 포커스 트랩 없음 | Low | `<img alt={파일명}>` + `tabindex="0"` + Fit/100%/Fill 버튼 role 명시 |

## Unknowns

- **U1**: `~/develop`(17 projects) 기준 이미지 포함 glob의 scanner latency (현재 md-only 대비 %증가). S1 초반 측정.
- **U2**: SVG를 `<img>`로 렌더 시 기존 rehype-sanitize가 적용되던 md 내 인라인 SVG와 **시각 일관성**이 유지되는가 (폰트·테마 변수 스왑 불가). 최초 눈으로 검증.
- **U3**: react-arborist 가상화 트리에 이미지 100+개 추가 시 초기 렌더 리그레션 (v0.2 기준선: 17 projects/971 md → 27ms). S2 종료 전 재측정.

## Verification Hooks

각 스프린트 종료 시 독립 Evaluator(서브에이전트 spawn=별도 창) 호출.

| Sprint | 빌드 | 타입 | 동작 | 성능 |
|--------|------|------|------|------|
| S1 | `pnpm build` PASS | tsc strict | scanner → 이미지 포함 스트리밍 IPC 수신, FileTree에 이미지 표시 | U1 측정 결과 기록 |
| S2 | 동일 | 동일 | 클릭 → ImageViewer 렌더, 3-모드 토글·다크모드 OK | U3 재측정, 회귀 없음 |

## Sprint 분할

복잡도 **5** (3파일+·새 컴포넌트 1개·기존 인프라 위 가산). 2개 스프린트로 쪼갠다.

### S1 — Data Path (scanner → useDocs → FileTree 아이콘)
**파일 수**: ~5 (`viewable.ts` 신규, scanner.ts, watcher.ts, useDocs.ts, FileTree.tsx)

- `src/lib/viewable.ts` 작성 — `VIEWABLE_EXTS`, `classifyAsset`
- scanner.ts glob 확대 (md-only 테스트 통과 유지)
- watcher.ts 필터 `VIEWABLE_EXTS`로 교체
- useDocs.ts 필터 교체
- FileTree.tsx에 ImageIcon 분기
- **Evaluator 질의**: 기존 md 전용 경로가 회귀 없는가? IPC 계약(`docs:chunk`) 이미지 항목 수신 시 렌더러 타입 안전한가?

**Verdict 기준**: `~/develop` 스캔 → 트리에 `.md`와 `.png`가 함께 표시, 아이콘 구분 시각 확인, 기존 md 열기 흐름 회귀 없음.

### S2 — Viewer Route + ImageViewer
**파일 수**: ~4 (`ImageViewer.tsx` 신규, `ImageIcon.tsx` 신규, ProjectView.tsx, globals.css 최소)

- `ImageViewer.tsx` — Fit/100%/Fill 토글, 체스보드 배경, 푸터 메타
- ProjectView.tsx `loadDoc` 분기 (app:// URL 직접 저장)
- ProjectView.tsx 렌더 분기 (classifyAsset 기반 switch)
- globals.css 체스보드 배경 유틸 클래스 (2개 변수)
- **Evaluator 질의**: SVG/대형 이미지 로드 실패 fallback 있나? 3-모드 토글 키보드 조작 가능한가? 파일명/해상도/바이트 null safety?

**Verdict 기준**: 이미지 클릭 → 뷰어 전환 < 200ms, 3-모드 토글 정상, 다크 테마 배경 일관성, 로드 실패 시 깨진 아이콘 대신 fallback.

## 구현 순서 (DAG)

```
S1 (Data Path) ───→ S2 (Viewer + ImageViewer)
```

S1이 S2를 블로킹. useDocs의 image doc 수신이 S2 뷰어 라우팅의 입력이므로 병렬 불가.

## 빌드/검증 명령

```bash
pnpm typecheck && pnpm build && pnpm test
pnpm dev   # GUI 검증: ~/develop 워크스페이스로 이미지가 섞인 프로젝트 열기
```

**커밋 전 게이트** (Nova rule): typecheck/lint/test PASS → `/nova:review --fast` → Evaluator PASS → 커밋.

## 후속 (v0.3.1 이후)

- pan/zoom 제스처 (pointer events + transform matrix)
- 썸네일 그리드 뷰 모드 (All Projects 카드에 대표 이미지 embed 옵션)
- PDF/Video/JSON 프리뷰 — `classifyAsset` 반환 union 확장, transport-ready 구조 유지
- 이미지 내 텍스트 검색(OCR) — Apple Vision framework 평가 (macOS 14+)

## Refs

- Prior Plan: `docs/plans/md-viewer-mvp.md` (v0.1), `docs/plans/markwand-context-composer-mvp.md` (v0.2)
- 조사 결과: 이 세션의 Explorer 서브에이전트 리포트 (변경 지점 정확도 검증)
- 연계 설계: `docs/designs/remote-fs-transport.md` (v1.0 SSH, 이 Plan 완료 후 작성 예정)
