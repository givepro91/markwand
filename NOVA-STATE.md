# Nova State

## Current
- **Goal**: 다음 라운드 제품 매력 강화 — Project Wiki를 "읽는 지도"에서 "다음 행동을 제안하는 지도"로 진화.
- **Phase**: **building** — Project Pulse 구현 완료, 커밋/후속 UX dogfood 대기.
- **Blocker**: none
- **Last Activity**: Project Pulse 1차 구현 — 위키 최상단 상태/다음 행동 카드, 추천 문서 열기, AI task prompt 복사, pulse 모델/테스트 추가. QA: typecheck PASS · vitest 385 PASS · build PASS (2026-05-01).
- **Remote**: `origin/main` = `21c0f9e`; tag `v0.4.0-beta.10` = `deacb77`; Release: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.10

## Recently Done
1. Project Pulse — Project Wiki summary에 `pulse` 모델 추가, 상태/이유/다음 행동/대표 문서를 계산하고 위키 최상단 카드로 노출.
2. v0.4.0-beta.10 — quit/CPU hotfix. Startup file watcher default-off (`MARKWAND_ENABLE_STARTUP_WATCH=1` opt-in), quit hides windows immediately, cleanup watchdog 500ms.
3. v0.4.0-beta.9 — packaged app no longer honors dev-only renderer/debug env vars.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.10-arm64-free.zip` | `291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d` |
| `dist/Markwand-0.4.0-beta.10-x64-free.zip` | `1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022` |

## Open Product Work
- Project Pulse dogfood: 실제 Markwand workspace에서 pulse 카피/우선순위가 사람에게 설득력 있는지 확인.
- 다음 후보: Decision Timeline, Wiki search/semantic facets, onboarding brief export.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
