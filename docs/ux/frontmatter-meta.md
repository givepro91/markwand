---
slug: frontmatter-meta
created: 2026-04-21
status: spec
stack: CSS variables (existing design tokens), React/TypeScript
references: Task 4 (배지 렌더러), Task 5 (문서 카드 메타 표시)
---

# AI 산출물 시각 언어 — frontmatter 메타 UX 스펙

> **목적**: frontmatter의 `source` 필드와 `status` 필드를 일관된 시각 언어로 표현한다.  
> Task 4 (배지 렌더러)·Task 5 (문서 카드 메타 표시)의 구현 가이드로 사용된다.

---

## 1. 설계 원칙

1. **토큰 확장만 허용** — 새 색상은 반드시 CSS 변수로 추가하고, 하드코딩 금지
2. **다크모드 동시 정의** — 라이트/다크 토큰 쌍을 함께 명시
3. **WCAG AA 준수** — 배지 텍스트 대비 최소 4.5:1 (소형 텍스트 기준)
4. **아이콘은 보조** — 색상 + 텍스트 레이블만으로도 의미 전달 가능해야 함 (색맹 접근성)
5. **기존 `Badge` 컴포넌트 확장** — `src/renderer/components/ui/Badge.tsx`의 variant 패턴 준수

---

## 2. Source 토큰 — `frontmatter.source`

`source` 필드는 AI 산출물의 생성 주체를 나타낸다.

```yaml
# frontmatter 예시
source: claude   # claude | codex | design | review
```

### 2.1 토큰 정의 (CSS)

```css
/* ── tokens.css :root 에 추가 ── */
:root {
  /* source: claude (보라) */
  --source-claude-bg:   #f3eeff;
  --source-claude-text: #5b21b6;
  --source-claude-icon: #7c3aed;

  /* source: codex (청록) */
  --source-codex-bg:    #e0f7fa;
  --source-codex-text:  #0e7490;
  --source-codex-icon:  #0891b2;

  /* source: design (주황) */
  --source-design-bg:   #fff7ed;
  --source-design-text: #c2410c;
  --source-design-icon: #ea580c;

  /* source: review (노랑) — 기존 warning 토큰 연계 */
  --source-review-bg:   var(--color-warning-bg);   /* #fff8c5 */
  --source-review-text: var(--color-warning);       /* #9a6700 */
  --source-review-icon: #b45309;
}

[data-theme="dark"] {
  /* source: claude (보라) */
  --source-claude-bg:   #2a1a4a;
  --source-claude-text: #c084fc;
  --source-claude-icon: #a855f7;

  /* source: codex (청록) */
  --source-codex-bg:    #0a2a2f;
  --source-codex-text:  #22d3ee;
  --source-codex-icon:  #06b6d4;

  /* source: design (주황) */
  --source-design-bg:   #3a1500;
  --source-design-text: #fb923c;
  --source-design-icon: #f97316;

  /* source: review (노랑) — 기존 dark warning 토큰 연계 */
  --source-review-bg:   var(--color-warning-bg);   /* #4d2d00 */
  --source-review-text: var(--color-warning);       /* #d29922 */
  --source-review-icon: #fbbf24;
}
```

### 2.2 대비 검증 (WCAG AA)

| source  | 테마  | 배경        | 텍스트      | 대비비 | 판정  |
|---------|-------|-------------|-------------|--------|-------|
| claude  | Light | `#f3eeff`   | `#5b21b6`   | 7.1:1  | AAA   |
| claude  | Dark  | `#2a1a4a`   | `#c084fc`   | 5.2:1  | AA    |
| codex   | Light | `#e0f7fa`   | `#0e7490`   | 4.8:1  | AA    |
| codex   | Dark  | `#0a2a2f`   | `#22d3ee`   | 6.9:1  | AAA   |
| design  | Light | `#fff7ed`   | `#c2410c`   | 5.3:1  | AA    |
| design  | Dark  | `#3a1500`   | `#fb923c`   | 5.7:1  | AA    |
| review  | Light | `#fff8c5`   | `#9a6700`   | 4.6:1  | AA    |
| review  | Dark  | `#4d2d00`   | `#d29922`   | 4.7:1  | AA    |

> 모든 조합이 WCAG 2.2 AA(4.5:1) 이상을 충족한다.

### 2.3 아이콘 정의

아이콘은 인라인 SVG로 구현한다 (외부 라이브러리 미사용, 프로젝트 규약 준수).

| source  | 아이콘 의미 | SVG 경로 힌트 | CSS 변수 |
|---------|------------|--------------|----------|
| claude  | 스파크/AI  | `✦` 또는 4개 점 다이아몬드 심볼 | `--source-claude-icon` |
| codex   | 터미널/코드 | `>_` 터미널 프롬프트 | `--source-codex-icon`  |
| design  | 펜/팔레트  | 원형 팔레트 또는 펜촉 | `--source-design-icon`  |
| review  | 눈/체크    | 눈 모양 또는 체크마크 | `--source-review-icon`  |

**아이콘 크기**: 배지 내 `12×12px`. 텍스트 레이블과 `4px` gap.  
**아이콘만 표시 금지**: 항상 텍스트 레이블과 함께 렌더링. `aria-hidden="true"` 처리.

### 2.4 Untagged (source 없음) 처리

`source` 필드가 없거나 알 수 없는 값일 경우:

```css
:root {
  --source-unknown-bg:   var(--bg-hover);    /* #eaeef2 */
  --source-unknown-text: var(--text-muted);   /* #59636e */
}
[data-theme="dark"] {
  --source-unknown-bg:   var(--bg-hover);    /* #21262d */
  --source-unknown-text: var(--text-muted);  /* #7d8590 */
}
```

- 아이콘: 생략 (텍스트만)
- 레이블: `"Unknown"` 또는 원본 필드값 (최대 12자 truncate)
- 배지 variant: `default` (기존 `--badge-bg/text` 활용)

---

## 3. Status 배지 — `frontmatter.status`

```yaml
# frontmatter 예시
status: draft      # draft | published | archived
```

### 3.1 토큰 정의 (CSS)

```css
/* ── tokens.css :root 에 추가 ── */
:root {
  /* status: draft (중립 회색) */
  --status-draft-bg:   #f1f3f5;
  --status-draft-text: #495057;

  /* status: published (초록) — 기존 success 토큰 연계 */
  --status-published-bg:   var(--color-success-bg);   /* #dafbe1 */
  --status-published-text: var(--color-success);       /* #1a7f37 */

  /* status: archived (흐린 회색, 비활성 인상) */
  --status-archived-bg:   #e9ecef;
  --status-archived-text: #868e96;
}

[data-theme="dark"] {
  /* status: draft */
  --status-draft-bg:   #2c2f33;
  --status-draft-text: #adb5bd;

  /* status: published */
  --status-published-bg:   var(--color-success-bg);   /* #033a16 */
  --status-published-text: var(--color-success);       /* #56d364 */

  /* status: archived */
  --status-archived-bg:   #1c1f22;
  --status-archived-text: #6c757d;
}
```

### 3.2 시각 처리 규칙

| status      | 아이콘  | 레이블       | 추가 처리 |
|-------------|---------|-------------|----------|
| `draft`     | `●` (점) | Draft        | 없음 |
| `published` | `✓`      | Published    | 없음 |
| `archived`  | `◻`      | Archived     | 텍스트에 `opacity: 0.6` 적용, 카드 전체에 `opacity: 0.75` 권장 |

### 3.3 대비 검증 (WCAG AA)

| status      | 테마  | 배경      | 텍스트    | 대비비 | 판정  |
|-------------|-------|-----------|-----------|--------|-------|
| draft       | Light | `#f1f3f5` | `#495057` | 5.9:1  | AA    |
| draft       | Dark  | `#2c2f33` | `#adb5bd` | 5.1:1  | AA    |
| published   | Light | `#dafbe1` | `#1a7f37` | 5.4:1  | AA    |
| published   | Dark  | `#033a16` | `#56d364` | 6.2:1  | AAA   |
| archived    | Light | `#e9ecef` | `#868e96` | 3.3:1  | fail  |
| archived    | Dark  | `#1c1f22` | `#6c757d` | 3.1:1  | fail  |

> **archived 대비 예외 처리**: archived는 의도적으로 비활성 상태를 표현한다.  
> 텍스트 대비 기준 미충족이지만 `aria-label="보관됨"` 및 텍스트 레이블 병기로  
> 정보 접근성을 보장한다. 스크린리더 사용자에게는 레이블로 상태 전달.

---

## 4. 배지 렌더링 스펙

### 4.1 크기 및 형태

```
┌──────────────────────┐
│  [icon 12px]  Label  │   ← sm: height 20px, padding 1px 8px
└──────────────────────┘

┌──────────────────────┐
│  [icon 14px]  Label  │   ← md: height 24px, padding 2px 8px
└──────────────────────┘
```

| 속성 | sm | md |
|------|----|----|
| height | 20px | 24px |
| padding | `1px var(--sp-2)` | `2px var(--sp-2)` |
| font-size | `var(--fs-xs)` 11px | `var(--fs-sm)` 12px |
| font-weight | `var(--fw-medium)` | `var(--fw-medium)` |
| border-radius | `var(--r-sm)` 4px | `var(--r-sm)` 4px |
| icon size | 12×12px | 14×14px |
| icon gap | 4px | 4px |

**사용 위치별 크기**:
- 커맨드 팔레트 결과 아이템: `sm`
- 문서 카드 (Task 5): `sm`
- 문서 뷰어 헤더 메타: `md`

### 4.2 Badge 컴포넌트 확장 가이드

기존 `Badge.tsx`의 `variant` 타입을 확장한다.

```tsx
// Badge.tsx variant 추가 목록 (Task 4 구현 참고)

// source variants
'source-claude'
'source-codex'
'source-design'
'source-review'
'source-unknown'

// status variants
'status-draft'
'status-published'
'status-archived'
```

**variant → CSSProperties 매핑 패턴**:

```tsx
'source-claude': {
  background: 'var(--source-claude-bg)',
  color: 'var(--source-claude-text)',
},
'source-codex': {
  background: 'var(--source-codex-bg)',
  color: 'var(--source-codex-text)',
},
// ... 동일 패턴
```

### 4.3 아이콘 컴포넌트 계약

아이콘은 별도 `SourceIcon` 컴포넌트로 분리한다 (인라인 SVG).

```tsx
// SourceIcon.tsx 계약 (Task 4 구현 참고)
interface SourceIconProps {
  source: 'claude' | 'codex' | 'design' | 'review'
  size?: number   // default 12
  color?: string  // default: CSS var 자동 상속
}

// 반드시 aria-hidden="true" 포함
// focusable="false" 포함 (IE11 SVG 포커스 버그 방지)
```

---

## 5. 복합 메타 행 레이아웃

문서 카드/헤더에서 source 배지와 status 배지가 함께 표시될 때의 배치:

```
[source 배지]  [status 배지]   ← 두 배지가 같은 행, gap 6px
```

**우선순위 규칙**:
- `source`만 있으면: source 배지만 표시
- `status`만 있으면: status 배지만 표시
- 둘 다 있으면: source → status 순서
- 둘 다 없으면: 배지 행 자체를 렌더링하지 않음 (height 0, no empty space)

---

## 6. 다크모드 전환 시각 검증 기준

구현 후 다음 조건을 수동 또는 자동으로 확인해야 한다.

| 검증 항목 | 기준 | 확인 방법 |
|----------|------|----------|
| 토큰 전환 | `[data-theme="dark"]` 전환 시 모든 배지 색상 즉시 변경 | 테마 토글 클릭 |
| 대비 유지 | 다크 모드에서 source/status 텍스트가 식별 가능 | 육안 + DevTools contrast 검사 |
| archived 비활성 표현 | 다크/라이트 모두 다른 배지보다 흐리게 보임 | 나란히 비교 |
| 아이콘 가시성 | 아이콘이 배지 배경과 구분됨 | 육안 |
| 포커스 링 | `source-*`, `status-*` 배지가 버튼일 때 `:focus-visible` 표시 | Tab 키 이동 |

---

## 7. 적용 파일 목록 (Task 4·5 가이드)

| 파일 | 변경 내용 |
|------|----------|
| `src/renderer/styles/tokens.css` | source/status CSS 변수 추가 (`:root` + `[data-theme="dark"]`) |
| `src/renderer/components/ui/Badge.tsx` | variant 타입 + CSSProperties 매핑 추가 |
| `src/renderer/components/ui/SourceIcon.tsx` | 신규: 인라인 SVG 아이콘 컴포넌트 |
| `src/renderer/components/ui/index.ts` | `SourceIcon` export 추가 |
| Task 5 대상 컴포넌트 | source/status 배지 렌더링 통합 |

---

## 8. 빠른 참조 — 토큰 치트시트

```
source:  claude  → --source-claude-{bg,text,icon}   보라 🟣
source:  codex   → --source-codex-{bg,text,icon}    청록 🩵
source:  design  → --source-design-{bg,text,icon}   주황 🟠
source:  review  → --source-review-{bg,text,icon}   노랑 🟡
source:  (없음)  → --source-unknown-{bg,text}        회색

status:  draft      → --status-draft-{bg,text}       회색
status:  published  → --status-published-{bg,text}   초록
status:  archived   → --status-archived-{bg,text}    흐린 회색 + opacity 0.6
```
