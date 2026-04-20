---
slug: command-palette
created: 2026-04-21
status: spec
stack: CSS variables (existing design tokens), React/TypeScript
---

# ⌘K 커맨드 팔레트 — UX 명세

## 1. 개요

글로벌 문서 검색 진입점. ⌘K로 어느 뷰에서나 즉시 접근 가능한 오버레이 팔레트.  
기존 인박스/카드 그리드의 발견성을 보완하며, Known Gap "글로벌 풀텍스트 검색"을 구현하는 UX 기반.

**설계 원칙**:
1. 입력 후 즉시 결과 — 디바운스 100ms, 체감 지연 없음
2. 키보드 완결성 — 마우스 없이 열기→탐색→열기→닫기 완료
3. 기존 디자인 토큰만 사용 — 새 색상/폰트 토큰 도입 금지
4. WCAG 2.2 AA — 모든 인터랙티브 요소에 포커스 링, aria 역할 완비

---

## 2. 레이아웃 명세

### 2.1 오버레이 구조

```
┌─ Backdrop (full-viewport, dimmed) ──────────────────────────┐
│                                                              │
│              ┌─ Palette (640px wide) ──────────────┐        │
│              │  ┌─ Input Row ─────────────────────┐ │        │
│              │  │  🔍  [ input field          ] ✕ │ │        │
│              │  └──────────────────────────────────┘ │        │
│              │  ─────────────────────────────────── │        │
│              │  ┌─ Results (scroll, max 20 items) ─┐│        │
│              │  │  ┌─ Item ─────────────────────┐  ││        │
│              │  │  │  [badge]  Title (bold)      │  ││        │
│              │  │  │           snippet …match…   │  ││        │
│              │  │  │           path/to/file.md   │  ││        │
│              │  │  └─────────────────────────────┘  ││        │
│              │  │  ┌─ Item (active) ─────────────┐  ││        │
│              │  │  │  …                          │  ││        │
│              │  └──────────────────────────────────┘│        │
│              │  ─────────────────────────────────── │        │
│              │  Footer: ↑↓ 이동  Enter 열기  Esc 닫기│        │
│              └────────────────────────────────────────┘       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 치수

| 요소 | 값 |
|------|-----|
| 팔레트 width | `640px` (fixed) |
| 팔레트 max-height | `560px` |
| 팔레트 위치 | `top: 15vh`, `left: 50%`, `transform: translateX(-50%)` |
| 팔레트 border-radius | `var(--r-xl)` (12px) |
| 팔레트 padding | `0` (내부 섹션이 각자 padding 담당) |
| Input row height | `52px` |
| Input padding | `var(--sp-4)` 좌우, 수직 중앙 정렬 |
| Input font-size | `var(--fs-lg)` (16px) |
| Result item padding | `var(--sp-3) var(--sp-4)` |
| Result item min-height | `60px` |
| Footer height | `32px` |
| Footer padding | `var(--sp-2) var(--sp-4)` |
| Backdrop opacity | `0.45` (`rgba(0,0,0,0.45)`) |
| z-index | `var(--z-modal)` (1000) |

---

## 3. CSS 목업 (변수 기반)

```css
/* ── Backdrop ── */
.cmd-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: var(--z-modal);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
}

/* ── Palette container ── */
.cmd-palette {
  width: 640px;
  max-height: 560px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  /* entry animation */
  animation: cmd-enter var(--duration-normal) var(--ease-standard);
}

@keyframes cmd-enter {
  from { opacity: 0; transform: translateY(-8px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0)   scale(1); }
}

/* ── Input row ── */
.cmd-input-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 0 var(--sp-4);
  height: 52px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-muted);
}

.cmd-search-icon {
  width: 18px;
  height: 18px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.cmd-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: var(--fs-lg);
  font-family: inherit;
  color: var(--text);
  line-height: var(--lh-tight);
}

.cmd-input::placeholder {
  color: var(--text-muted);
}

.cmd-clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: var(--bg-hover);
  border-radius: var(--r-pill);
  cursor: pointer;
  color: var(--text-muted);
  font-size: var(--fs-sm);
  flex-shrink: 0;
}

.cmd-clear-btn:hover {
  background: var(--border);
  color: var(--text);
}

/* 모든 인터랙티브 요소 공통 포커스 링 */
.cmd-clear-btn:focus-visible,
.cmd-result-item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* ── Results area ── */
.cmd-results {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.cmd-results::-webkit-scrollbar { width: 4px; }
.cmd-results::-webkit-scrollbar-track { background: transparent; }
.cmd-results::-webkit-scrollbar-thumb { background: var(--border); border-radius: var(--r-pill); }

/* ── Result item ── */
.cmd-result-item {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto auto;
  column-gap: var(--sp-3);
  row-gap: 2px;
  padding: var(--sp-3) var(--sp-4);
  min-height: 60px;
  cursor: pointer;
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
  transition: background var(--duration-fast) var(--ease-standard);
}

.cmd-result-item:hover,
.cmd-result-item[aria-selected="true"] {
  background: var(--bg-hover);
}

.cmd-result-item[aria-selected="true"] {
  /* 좌측 액센트 바 */
  box-shadow: inset 3px 0 0 var(--accent);
}

/* badge — 1행 1열 */
.cmd-item-badge {
  grid-column: 1;
  grid-row: 1;
  align-self: center;
  display: inline-flex;
  align-items: center;
  padding: 1px var(--sp-2);
  background: var(--badge-bg);
  color: var(--badge-text);
  border-radius: var(--r-sm);
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
  white-space: nowrap;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* title — 1행 2열 */
.cmd-item-title {
  grid-column: 2;
  grid-row: 1;
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* snippet — 2행 2열 (badge 행과 별개) */
.cmd-item-snippet {
  grid-column: 2;
  grid-row: 2;
  font-size: var(--fs-sm);
  color: var(--text-muted);
  line-height: var(--lh-normal);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 매치 하이라이트 */
.cmd-item-snippet mark {
  background: var(--color-warning-bg);
  color: var(--color-warning);
  border-radius: 2px;
  padding: 0 2px;
  font-weight: var(--fw-medium);
}

/* path — 3행 2열 */
.cmd-item-path {
  grid-column: 2;
  grid-row: 3;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'SF Mono', 'Menlo', monospace;
}

/* ── Footer ── */
.cmd-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  padding: var(--sp-2) var(--sp-4);
  height: 32px;
  border-top: 1px solid var(--border-muted);
  background: var(--bg-elev);
}

.cmd-footer-hint {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.cmd-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px 5px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  font-size: var(--fs-xs);
  font-family: inherit;
  color: var(--text-muted);
  line-height: 1;
}

/* ── Empty / Loading / No-results 상태 ── */
.cmd-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  padding: var(--sp-10) var(--sp-6);
  color: var(--text-muted);
  font-size: var(--fs-sm);
  text-align: center;
}

.cmd-state-icon {
  width: 32px;
  height: 32px;
  opacity: 0.4;
}

.cmd-state-label {
  font-weight: var(--fw-medium);
  color: var(--text-muted);
}

.cmd-state-hint {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  opacity: 0.7;
}

/* 로딩 스피너 */
@keyframes cmd-spin {
  to { transform: rotate(360deg); }
}

.cmd-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: cmd-spin 600ms linear infinite;
}
```

---

## 4. 컴포넌트 구조 (React)

```tsx
// CommandPalette.tsx — 구조 명세 (구현 아님, 스펙 참고용)

<div role="dialog" aria-modal="true" aria-label="문서 검색">
  {/* Backdrop */}
  <div className="cmd-backdrop" onClick={onClose} />

  <div className="cmd-palette">
    {/* Input Row */}
    <div className="cmd-input-row">
      <SearchIcon className="cmd-search-icon" aria-hidden="true" />
      <input
        className="cmd-input"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={results.length > 0}
        aria-controls="cmd-listbox"
        aria-activedescendant={activeId}
        placeholder="문서 검색..."
        value={query}
        onChange={handleChange}
        autoFocus
      />
      {query && (
        <button
          className="cmd-clear-btn"
          onClick={clearQuery}
          aria-label="검색어 지우기"
        >
          ✕
        </button>
      )}
    </div>

    {/* Results / States */}
    <div className="cmd-results">
      {state === 'empty'   && <EmptyState />}
      {state === 'loading' && <LoadingState />}
      {state === 'no-results' && <NoResultsState query={query} />}
      {state === 'results' && (
        <ul
          id="cmd-listbox"
          role="listbox"
          aria-label="검색 결과"
        >
          {results.slice(0, 20).map((item, i) => (
            <li key={item.id} role="option" aria-selected={i === activeIndex}>
              <button
                id={`cmd-item-${item.id}`}
                className="cmd-result-item"
                aria-selected={i === activeIndex}
                onClick={() => openDoc(item)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <span className="cmd-item-badge">{item.project}</span>
                <span className="cmd-item-title">{item.title}</span>
                <span
                  className="cmd-item-snippet"
                  dangerouslySetInnerHTML={{ __html: item.snippetHtml }}
                />
                <span className="cmd-item-path">{item.relativePath}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>

    {/* Footer */}
    <div className="cmd-footer" aria-hidden="true">
      <span className="cmd-footer-hint">
        <kbd className="cmd-kbd">↑</kbd>
        <kbd className="cmd-kbd">↓</kbd>
        이동
      </span>
      <span className="cmd-footer-hint">
        <kbd className="cmd-kbd">↵</kbd>
        열기
      </span>
      <span className="cmd-footer-hint">
        <kbd className="cmd-kbd">Esc</kbd>
        닫기
      </span>
    </div>
  </div>
</div>
```

---

## 5. 상태 명세 (3 States)

### 5.1 빈 상태 (Empty) — 쿼리 없음

```
     [🔍 아이콘 40% opacity]

       최근 문서가 여기에 표시됩니다
       ⌘K로 언제든 열 수 있어요
```

- 아이콘: Search 또는 Clock (최근 문서 힌트)
- 레이블: `var(--fw-medium)`, `var(--text-muted)`
- 힌트: `var(--fs-xs)`, opacity 0.7

### 5.2 로딩 상태 (Loading) — 쿼리 있음, 응답 대기

```
        [스피너]

      검색 중...
```

- 스피너: 20×20px, `var(--accent)` 선색, 600ms linear
- 텍스트: `var(--text-muted)`, `var(--fs-sm)`

### 5.3 결과 없음 (No Results) — 쿼리 있음, 0건

```
     [🔍 아이콘 40% opacity]

  "검색어"에 대한 결과가 없습니다
  다른 단어나 파일 경로를 시도해보세요
```

- 쿼리 텍스트: 따옴표로 강조, `var(--text)` 색상
- 힌트: `var(--fs-xs)`, `var(--text-muted)`

---

## 6. 키보드 인터랙션

| 키 | 동작 | 조건 |
|----|------|------|
| `⌘K` | 팔레트 토글 (열기/닫기) | 어느 뷰에서나 |
| `↓` | 다음 결과로 포커스 이동 | 팔레트 열림 |
| `↑` | 이전 결과로 포커스 이동 | 팔레트 열림 |
| `↓` (마지막) | 첫 번째로 순환 wrap | 결과 있음 |
| `↑` (첫 번째) | 마지막으로 순환 wrap | 결과 있음 |
| `Enter` | 선택 항목 열기 + 팔레트 닫기 | 항목 선택됨 |
| `Esc` | 팔레트 닫기 | 팔레트 열림 |
| `Esc` (쿼리 있음) | 쿼리 지우기 (닫기 전 1단계) | 쿼리 비어있지 않음 |
| `Tab` / `Shift+Tab` | 결과 목록 순방향/역방향 탐색 | 팔레트 열림 |

**포커스 관리**:
- 팔레트 열릴 때: `input`에 `autoFocus`
- 팔레트 닫힐 때: 팔레트를 연 트리거 요소로 포커스 복귀 (`useRef` 보존)
- 결과 항목 ↑↓ 이동 시: `aria-activedescendant` 업데이트 (입력창 포커스 유지)

---

## 7. 다크/라이트 토큰 매핑

모든 색상이 기존 테마 변수를 사용하므로 `[data-theme="dark"]` 전환 시 자동 적용됨.

| 역할 | 라이트 토큰 | 다크 값 | 적용 위치 |
|------|-----------|---------|----------|
| 팔레트 배경 | `--bg` `#ffffff` | `#0d1117` | `.cmd-palette` |
| 결과 구분선 | `--border-muted` | `#21262d` | 섹션 구분 |
| 호버/선택 배경 | `--bg-hover` `#eaeef2` | `#21262d` | `.cmd-result-item:hover` |
| 제목 텍스트 | `--text` `#1f2328` | `#e6edf3` | `.cmd-item-title` |
| 서브 텍스트 | `--text-muted` `#59636e` | `#7d8590` | snippet, path |
| 액센트 (포커스 링) | `--accent` `#0860c7` | `#388bfd` | `:focus-visible`, 선택 바 |
| 프로젝트 배지 | `--badge-bg/text` | 자동 | `.cmd-item-badge` |
| 하이라이트 배경 | `--color-warning-bg` | `#4d2d00` | `mark` |
| 푸터 배경 | `--bg-elev` `#f6f8fa` | `#161b22` | `.cmd-footer` |
| Backdrop | `rgba(0,0,0,0.45)` | 동일 (다크 시 `0.6` 권장) | `.cmd-backdrop` |

> **다크 backdrop 조정**: `[data-theme="dark"] .cmd-backdrop { background: rgba(0,0,0,0.6); }`

---

## 8. 접근성 체크리스트 (WCAG 2.2 AA)

| 항목 | 구현 방법 | 기준 |
|------|----------|------|
| 모달 역할 선언 | `role="dialog" aria-modal="true"` | ARIA 1.2 |
| 레이블 | `aria-label="문서 검색"` | 1.3.1 |
| 입력창 역할 | `role="combobox"` + `aria-autocomplete="list"` | ARIA 1.2 |
| 선택 항목 추적 | `aria-activedescendant` | ARIA 1.2 |
| 결과 목록 | `role="listbox"` → 각 항목 `role="option"` | ARIA 1.2 |
| 선택 상태 | `aria-selected="true/false"` | 4.1.2 |
| 포커스 링 | `:focus-visible` 2px `var(--accent)` | 2.4.11 |
| 키보드 완결 | ↑↓Enter로 전체 탐색 가능 | 2.1.1 |
| 포커스 복귀 | 닫기 시 트리거로 복귀 | 2.4.3 |
| 스크린리더 live | 결과 수: `aria-live="polite"` status 영역 | 4.1.3 |
| 스피너 레이블 | `role="status" aria-label="검색 중"` | 4.1.3 |
| 컨트라스트 | 모든 색상 기존 토큰 준수 (라이트 4.5:1+) | 1.4.3 |
| 배경 클릭 닫기 | backdrop click으로 닫힘 (키보드도 Esc) | 보완 |
| snippetHtml XSS | 하이라이트 mark 외 HTML 이스케이프 필수 | 보안 필수 |

---

## 9. 애니메이션

| 요소 | 효과 | 값 |
|------|------|-----|
| 팔레트 진입 | fade + slide-down 8px + scale 0.98→1 | `var(--duration-normal)` 150ms |
| 팔레트 퇴장 | fade-out + slide-up | `var(--duration-fast)` 80ms |
| 항목 hover | 배경색 전환 | `var(--duration-fast)` 80ms |
| 스피너 회전 | linear 무한 | 600ms |

`prefers-reduced-motion` 미디어 쿼리 처리:

```css
@media (prefers-reduced-motion: reduce) {
  .cmd-palette { animation: none; }
  .cmd-result-item { transition: none; }
}
```

---

## 10. 결과 항목 데이터 계약

```ts
interface CommandPaletteResult {
  id: string           // 유니크 키 (예: 절대 경로 해시)
  title: string        // 파일명 또는 frontmatter title
  snippetHtml: string  // 매치 하이라이트 포함 HTML (<mark> 태그만 허용)
  relativePath: string // 워크스페이스 상대 경로
  project: string      // 프로젝트명 (배지)
  absPath: string      // 열기 동작에 사용
}
```

**스니펫 생성 규칙**:
- 매치 단어 기준 앞뒤 40자 컨텍스트 추출
- 매치 부분을 `<mark>` 태그로 감싸기
- `<mark>` 외 모든 HTML은 이스케이프

---

## 11. IPC / 통합 포인트 (구현 참고)

| 포인트 | 설명 |
|--------|------|
| 검색 IPC | `workspace:search-docs` 채널 (신규 설계 필요) |
| 입력값 | `{ query: string, limit: 20 }` |
| 출력값 | `CommandPaletteResult[]` |
| 디바운스 | renderer 측 100ms |
| 결과 열기 | 기존 `openDoc(absPath)` 액션 재사용 |
| 단축키 등록 | `useEffect` 내 `window.addEventListener('keydown')` |
| 포커스 트랩 | `focus-trap-react` 또는 자체 구현 (`Tab` 순환) |

---

## 12. 미구현 범위 (v0.2 Known Gap)

| 항목 | 이유 |
|------|------|
| 최근 문서 목록 (빈 상태) | `prefs.lastViewedDocs` 연동 필요 — 별도 IPC |
| 파일 경로 직접 검색 | 퍼지 매칭 라이브러리 선택 필요 |
| 멀티 키워드 AND 검색 | 검색 엔진 설계 의존 |
| 검색 기록 저장 | electron-store 추가 prefs 키 |
| `⌘⇧F` 대체 지원 | 단축키 충돌 정책 결정 필요 |

---

> **Next**: `/nova:auto "command-palette"` 로 구현 시작.  
> IPC `workspace:search-docs` 채널은 별도 Backend 태스크로 먼저 설계 필요.
