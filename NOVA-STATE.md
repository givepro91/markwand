# Nova State

## Current
- **Goal**: Project Wiki를 "경고 도구"에서 "문서 역할과 현재 상황을 판단하는 프로젝트 이해 레이어"로 진화.
- **Phase**: **planning** — 제품화 backlog 선별 완료, 다음 Sprint는 First Project Aha Path 추천.
- **Blocker**: none
- **Last Activity**: spwk-product Link Graph QA — 내부 도구 문서발 깨진 참조를 관계 그래프/리스크에서 제외하고, 문서 허브·위험 링크 카드를 실제 문서 열기 버튼으로 보강. spwk-product 실측 위험 링크 1076→734, full test 448 PASS · typecheck PASS · build PASS (2026-05-03).
- **Remote**: `origin/main` = `21c0f9e`; tag `v0.4.0-beta.10` = `deacb77`; Release: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.10

## Recently Done
1. spwk-product Link Graph QA — `.agents/skills/*` 같은 내부 도구 문서발 링크 노이즈를 관계 그래프에서 제외하고, 허브/리스크 카드 클릭·배지 overflow 회귀 테스트 추가.
2. spwk-product dogfood QA — 숨김 Claude/agent 도구 문서를 `tooling`/`workLog`로 분리해 첫 읽기·Decision Log·Doc Debt 오염 제거.
3. swk-ground-control dogfood QA — pytest cache README 2건을 문서/위키/SSH 탐색 대상에서 제외.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.10-arm64-free.zip` | `291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d` |
| `dist/Markwand-0.4.0-beta.10-x64-free.zip` | `1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022` |

## Open Product Work
- Next: `docs/plans/productization-backlog.md` 기준 P0 First Project Aha Path 구현 — 첫 프로젝트 추가 후 "한눈에 요약 → 확인할 문제 → AI에게 전달" 흐름 강화.
- Guardrail: SSH workspace 성능 보호 유지. Remote Git exec는 아직 도입하지 않고 local Git Pulse 결과만 문서 판단에 보수적으로 연결.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
