# Nova State

## Current
- **Goal**: 다음 라운드 제품 매력 강화 — Project Wiki를 "읽는 지도"에서 "다음 행동을 제안하는 지도"로 진화.
- **Phase**: **stabilizing** — Project Wiki 하단/설정 모달 overflow 회귀 수정, 릴리스 전 UX QA 강화 중.
- **Blocker**: none
- **Last Activity**: Project Wiki UI overflow fix — Doc Debt/Decision Timeline/Link Graph 긴 파일명·배지 containment, Workspace 설정 모달 viewport scroll 보강. QA: typecheck PASS · vitest 389 PASS · build PASS (2026-05-01). lint는 로컬 eslint 바이너리 부재로 실행 불가.
- **Remote**: `origin/main` = `21c0f9e`; tag `v0.4.0-beta.10` = `deacb77`; Release: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.10

## Recently Done
1. Project Wiki UI containment — 긴 파일명/점수 배지가 하단 3컬럼 밖으로 새지 않도록 shrink/ellipsis 규칙과 회귀 테스트 추가.
2. Decision Timeline — Project Wiki가 plan/design/review/release 문서를 분류해 최신 의사결정 흐름을 타임라인으로 보여줌.
3. Project Pulse — Project Wiki summary에 `pulse` 모델 추가, 상태/이유/다음 행동/대표 문서를 계산하고 위키 최상단 카드로 노출.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.10-arm64-free.zip` | `291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d` |
| `dist/Markwand-0.4.0-beta.10-x64-free.zip` | `1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022` |

## Open Product Work
- Project Wiki dogfood: 실제 Markwand workspace에서 Pulse/Timeline 카피와 우선순위가 사람에게 설득력 있는지 확인.
- 다음 후보: Wiki search/semantic facets, onboarding brief export, timeline detail extraction.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
