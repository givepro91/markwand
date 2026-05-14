# Markwand — Codex 작업 규칙

## 자가 검증 우선 (Self-QA First)

**원칙**: 작업 완료 후 사용자에게 dogfood/실기 테스트를 떠넘기지 않는다. 내가 만든 코드의 의도와 흐름은 내가 가장 잘 알기 때문에, 발견 가능한 회귀는 사용자가 보고하기 전에 내가 먼저 잡는다.

### 적용 대상

특히 다음 영역의 코드를 작업할 때 의무 적용:

- React hook 의 effect 라이프사이클 (deps · cleanup · race)
- 브라우저 이벤트 핸들러 (mousedown/up · selectionchange · keydown · click bubbling)
- 비동기 IPC 와 UI 상태의 동기화 (basePath 변경 vs content prop 도착 race 등)
- focus 이동 / selection 보존 / 키보드 a11y
- CSS Custom Highlight API · CSS.highlights registry 라이프사이클
- 헤더·사이드바·툴바 안에서 열리는 모달/팝오버/드롭다운의 레이어링 (z-index · portal · overflow clipping)
- 외부 앱/터미널 실행 기능 (앱 감지와 실제 실행은 별개로 검증)

### 워크플로우

1. **코드 분석으로 race / 타이밍 이슈 사전 점검** — "이벤트가 어느 순서로 발화하는가? 어느 시점에 어떤 prop 이 stale 한가? cleanup 누락 시 어떻게 되는가?" 를 코드 reading 만으로 한 번 추적.

2. **자동 시뮬 단위 테스트 작성**
   - React hook 은 `@testing-library/react` 의 `renderHook` + jsdom (`*.test.tsx` 자동 jsdom 환경)
   - DOM 이벤트는 `dispatchEvent(new MouseEvent(...))` 로 시뮬
   - selectionchange / Range / getBoundingClientRect 등 jsdom 미구현 API 는 `beforeEach` 에서 polyfill
   - 핵심 시나리오:
     - 정상 path
     - 사용자 보고 가능한 race / edge case (drag 중 selection · 빠른 click · doc 전환 race)
   - cleanup / unmount 시 leak / ghost state
   - overlay UI 는 `overflow: hidden` 상위 컨테이너 안에서도 잘리지 않는지 (`createPortal(document.body)` 또는 동등한 최상위 레이어)
   - 테스트가 실패하면 그 지점이 root cause. 통과해야 코드 수정 완료로 간주.

### Overlay / Popover 규칙

- 헤더, 사이드바, 문서 뷰어 toolbar처럼 `overflow: hidden` 이 들어갈 수 있는 영역 내부에 `position: absolute` 모달/팝오버를 직접 렌더링하지 않는다.
- 모달/팝오버/긴 드롭다운은 기본적으로 `document.body` portal + `position: fixed` 최상위 레이어를 사용한다. 예외가 필요하면 해당 컴포넌트 테스트에 clipping 안전성을 증명한다.
- 사용자 보고로 clipping 이 발생한 UI를 수정할 때는 `overflow: hidden` 부모 안에서 렌더해도 dialog/menu root 의 parent 가 `document.body` 인지 확인하는 회귀 테스트를 추가한다.

### External App Opener 규칙

- "앱이 설치되어 감지된다"는 "해당 앱으로 프로젝트를 열 수 있다"와 다르다. opener 작업은 감지 테스트와 실행 command-shape 테스트를 반드시 분리한다.
- Terminal/iTerm2/Ghostty처럼 앱별 automation surface가 다른 경우 공통 AppleScript로 묶지 않는다. 각 앱의 실제 지원 방식(AppleScript application name, LaunchServices args, CLI 지원 여부)을 로컬에서 확인하고 테스트에 고정한다.
- 앱 탐지 IPC가 실패할 때 fallback은 과하게 넓히지 않는다. 기본 fallback은 `VS Code`, `Terminal`, `Finder`까지만 허용하고, iTerm2/Ghostty/Xcode/IntelliJ 등은 실제 설치 감지 성공 시에만 표시한다.

### Codex 앱 UI 검증 / 캡처 규칙

- Codex 앱으로 Markwand UI를 확인할 때 macOS 전체 화면 캡처(`screencapture` 전체 화면, 데스크톱 전체 스크린샷)를 기본 검증 수단으로 쓰지 않는다.
- 우선순위는 앱 자체 범위 검증이다: Electron CDP(`--remote-debugging-port`)로 앱 창을 띄워 DOM/레이아웃 수치를 측정하거나, 앱 창/브라우저 viewport 단위 캡처만 사용한다.
- 레이아웃 회귀는 가능하면 `scripts/layout-smoke.mjs` 같은 앱 창 기반 스모크에 fixture와 assertion을 추가해 자동화한다.
- 사용자에게 시각 증거가 꼭 필요할 때만 앱 창/특정 viewport로 제한한 캡처를 남기고, 전체 데스크톱·다른 앱·개인 정보가 포함될 수 있는 화면 캡처는 피한다.

3. **dogfood 는 마지막 sanity check**
   - 1·2 가 모두 통과한 뒤에만 사용자에게 "확인 부탁드립니다" 요청.
   - 사용자 보고가 들어오면 단순히 fix list 로 받지 말고 "내가 왜 1·2 단계에서 못 잡았는가" 를 같이 분석해 다음 사이클에서 보강.

4. **회귀 차단 단위 테스트 동반**
   - 사용자 보고로 발견된 버그를 fix 할 때는 그 시나리오를 자동 시뮬하는 테스트도 함께 추가. 다음 번엔 사용자 도움 없이 잡힌다.

### 예외 (사용자 검증 의존 허용)

다음 경우만 사용자 dogfood 가 1차 검증으로 정당화:

- 코드사이닝 / Gatekeeper / xattr 등 macOS 보안 정책이 필요한 경로
- 외부 API (Codex · Codex CLI · GitHub) 가 필요한 통합
- 사용자 개인 데이터 (workspace 구성 · SSH 키 · 실제 .md 콘텐츠) 에 의존하는 시나리오
- 시각 디자인 (색상 대비 · 다크 모드 시인성 등) 의 주관적 평가

이 경우에도 가능한 한 자동 부분(예: WCAG 대비 수치 계산)은 직접 검증.

### Reference

- `src/renderer/hooks/useAnnotations.test.tsx` — drag/mousedown/mouseup 라이프사이클 + docPath race 자가 검증 6 케이스 (2026-04-26 v0.4 S7)
- `src/renderer/lib/annotation/anchor.test.ts` — DOM 형태별 anchor 매칭 + fuzzy 회복 15 케이스
- 사례: `feedback_self_qa_required.md` (memory) — v0.4 S7 에서 사용자 dogfood 떠넘기기로 발생한 3건 회귀 보고 → 자가 검증 정책 도입.

## Nova Quality Gate

이 프로젝트는 Nova 자동 품질 게이트를 사용한다 (SessionStart hook 으로 규칙 자동 로드). 상세는 `docs/nova-rules.md` · `NOVA-STATE.md` 참조.

핵심:
- 복잡도 8+ 작업은 Plan → Design → 스프린트 분할
- 각 스프린트 완료 시 독립 서브에이전트 Evaluator PASS 필수
- 커밋 전 typecheck + vitest 회귀 0
- 릴리스(버전 bump · 태그 · DMG 빌드 · GitHub Release) 는 사용자 명시 승인 후에만
