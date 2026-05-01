# Nova State

## Current
- **Goal**: 다음 라운드 제품 매력 강화 — Project Wiki를 "읽는 지도"에서 "다음 행동을 제안하는 지도"로 진화.
- **Phase**: **building** — Project Pulse + Decision Timeline 구현 완료, 후속 UX dogfood 대기.
- **Blocker**: none
- **Last Activity**: Decision Timeline 구현 — plan/design/review/release 문서 흐름을 시간순 카드로 표시, 클릭 열기 테스트 추가. QA: typecheck PASS · vitest 386 PASS · build PASS (2026-05-01).
- **Remote**: `origin/main` = `21c0f9e`; tag `v0.4.0-beta.10` = `deacb77`; Release: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.10

## Recently Done
1. Decision Timeline — Project Wiki가 plan/design/review/release 문서를 분류해 최신 의사결정 흐름을 타임라인으로 보여줌.
2. Project Pulse — Project Wiki summary에 `pulse` 모델 추가, 상태/이유/다음 행동/대표 문서를 계산하고 위키 최상단 카드로 노출.
3. v0.4.0-beta.10 — quit/CPU hotfix. Startup file watcher default-off, quit hides windows immediately, cleanup watchdog 500ms.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.10-arm64-free.zip` | `291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d` |
| `dist/Markwand-0.4.0-beta.10-x64-free.zip` | `1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022` |

## Open Product Work
- Project Wiki dogfood: 실제 Markwand workspace에서 Pulse/Timeline 카피와 우선순위가 사람에게 설득력 있는지 확인.
- 다음 후보: Wiki search/semantic facets, onboarding brief export, timeline detail extraction.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
