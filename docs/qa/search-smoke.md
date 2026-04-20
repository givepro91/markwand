# QA Report: 인덱싱·검색 정확성·성능 검증

**Verdict**: FAIL  
**Tests Added**: 0 (실기 실행 불가 — 하단 BLOCKED/FAIL 사유 참조)  
**Date**: 2026-04-21  
**Environment**: Electron dev build (pnpm dev) — macOS headless agent, GUI 미실행  
**Branch**: agent/qa-engineer/qa-83750c18  

---

## Executive Summary

검색 백엔드가 미구현 상태다. `window.api.search` 가 preload에 노출되지 않아 CommandPalette에서 검색을 시도하면 **즉시 TypeError 크래시**가 발생한다. 시나리오 (a)~(e)는 전부 BLOCKED, (b)는 Critical FAIL이다.

---

## Issues Found

### [Critical] `api.search` 미정의 → 검색 시 TypeError 크래시

- **파일**: `src/renderer/components/CommandPalette.tsx:148`, `src/preload/index.ts`
- **재현**: ⌘K → 키 입력 → 150ms debounce 후 `(window.api as ApiWithSearch).search.query(...)` 호출 → `api.search`가 `undefined`이므로 `TypeError: Cannot read properties of undefined (reading 'query')` 발생
- **근거**: `src/preload/index.ts` 전체를 확인함 — `search` 키 없음. `workspace:search-docs` IPC 핸들러도 `src/main/ipc/` 5개 파일 어디에도 없음
- **심각도**: Critical (UI crash, 데이터 전달 불가)
- **필요 작업**: preload에 `search: { query }` 래퍼 추가 + main 프로세스에 `workspace:search-docs` IPC 핸들러 + 풀텍스트 인덱스 구현

---

### [Major] 파일트리 — 팔레트 점프 후 활성 문서 미하이라이트

- **파일**: `src/renderer/components/FileTree.tsx:15-22`, `src/renderer/views/ProjectView.tsx:377-385`
- **재현**: CommandPalette → Enter → `openDoc(projectId, path)` 호출 → `ProjectView`의 `pendingDocOpen` 처리로 문서 뷰어는 열림, 그러나 FileTree에는 `activePath`/`selectedDoc` prop이 없어 트리 노드 하이라이트 없음
- **근거**: `FileTreeProps` 인터페이스에 현재 열린 문서를 나타내는 prop 없음; `FileTreeNode`는 `selectedDocPaths` (Composer 체크박스 상태)만 참조
- **심각도**: Major (사용자 컨텍스트 손실 — 어느 파일이 열렸는지 트리에서 파악 불가)

---

### [Major] chokidar watcher — main 프로세스 진입점에서 미시작

- **파일**: `src/main/services/watcher.ts`, `src/main/index.ts`
- **재현**: `src/main/index.ts`에 `startWatcher` 또는 `addWatchRoots` 호출 없음 (grep 결과 0건). watcher 코드는 존재하나 실제로 구동되지 않음
- **근거**: `grep -r "startWatcher|addWatchRoots" src/main/index.ts` → no matches
- **심각도**: Major (시나리오 (c) watcher <2s 반영 전체 불가)
- **참고**: NOVA-STATE.md에도 "v0.1은 chokidar disabled by default" 기록됨

---

### [Minor] docCountProgress 배너 — 인덱싱 진행 UX는 구현됐으나 검색 인덱스와 미연동

- **파일**: `src/renderer/App.tsx:229-247`
- **설명**: `docCountProgress` 배너는 프로젝트별 `.md` 파일 **카운트** 진행률만 추적. 실제 풀텍스트 인덱스 빌드 진행률이 아님. 검색 백엔드 구현 시 인덱싱 진행률 IPC 연동 필요
- **심각도**: Minor (UX 미스매치 — 배너는 "분석 중"처럼 보이지만 검색 불가)

---

## 시나리오별 검증 결과

| # | 시나리오 | 결과 | 사유 |
|---|---------|------|------|
| a | 2 워크스페이스·500+ md 초기 인덱싱 <5s | BLOCKED | 풀텍스트 인덱스 미구현 |
| b | 쿼리 응답 <100ms | FAIL (Critical) | `api.search` undefined → TypeError crash |
| c | 파일 추가/수정/삭제 watcher 반영 <2s | BLOCKED | watcher 미시작 + 검색 인덱스 없음 |
| d | 한글/영문/코드블록 본문 매칭 | BLOCKED | 풀텍스트 인덱스 미구현 |
| e | 제목·경로·본문 가중치 검증 | BLOCKED | 풀텍스트 인덱스 미구현 |
| f | ⌘K 키보드 내비/ESC/포커스 트랩 | PARTIAL | 코드 구현 확인됨; 검색 결과 없으면 ↑↓ 동작 미검증 |
| g | 점프 후 파일트리 하이라이트 | FAIL (Major) | FileTree activePath prop 없음 |

---

## 시나리오 (f) 세부 분석 — ⌘K 키보드 내비 (코드 레벨)

| 항목 | 구현 여부 | 파일:라인 |
|-----|---------|---------|
| ⌘K 토글 | ✅ `useGlobalHotkey('k', handler, {meta:true})` | `CommandPalette.tsx:120` |
| ESC — 쿼리 있으면 클리어 | ✅ `if (query) setQuery('')` | `CommandPalette.tsx:167` |
| ESC — 쿼리 비면 닫기 | ✅ `closeCommandPalette()` | `CommandPalette.tsx:170` |
| ↑↓ wrap-around 내비 | ✅ modulo `results.length` | `CommandPalette.tsx:176-183` |
| Enter — 선택 항목 열기 | ✅ `openDoc(item.projectId, item.path)` | `CommandPalette.tsx:188` |
| Tab 포커스 트랩 | ✅ focusable 쿼리 + first/last 순환 | `CommandPalette.tsx:197-222` |
| `aria-selected` 접근성 | ✅ | `CommandPalette.tsx` |
| 인덱싱 진행 배너 | ✅ `docCountProgress` 연동 | `CommandPalette.tsx:282-314` |
| **실기 검증** | ⚠️ GUI 미실행 — 코드 분석만 | — |

---

## 우선순위 Fix 목록

1. **[P0] 검색 백엔드 구현**: preload `search.query` 추가 + main `workspace:search-docs` IPC + 풀텍스트 인덱스 (flexsearch / Orama / SQLite FTS5 중 선택)
2. **[P1] FileTree activePath prop 추가**: `FileTreeProps`에 `activePath?: string` 추가, `FileTreeNode`에서 비교 후 `box-shadow: inset 3px 0 0 var(--accent)` 등 하이라이트 적용
3. **[P1] watcher 시작점 연결**: `src/main/index.ts`에서 워크스페이스 로드 후 `startWatcher(roots, webContents)` 호출
4. **[P2] docCountProgress 배너 — 검색 인덱싱 진행률 연동**: 백엔드 구현 후 인덱스 빌드 완료 신호를 별도 IPC로 전달

---

## Known Gaps (이 검증이 커버하지 못한 영역)

| 영역 | 이유 |
|-----|-----|
| 실기 성능 수치 (a, b, c) | GUI 미실행 환경 — `pnpm dev` 실행 후 직접 측정 필요 |
| 한글 IME 입력 → 검색 트리거 타이밍 | 백엔드 구현 후 IME `compositionend` 이벤트 처리 확인 필요 |
| 500+ md 파일 인덱스 메모리 풋프린트 | 백엔드 미구현으로 측정 불가 |
| ⌘K 두 번 연속 → 토글 정확성 | GUI 실행 필요 |
| 팔레트 열린 상태에서 ⌘K 재입력 | GUI 실행 필요 |
