# Nova State

## Current
- **Goal**: Project Wiki를 "경고 도구"에서 "문서 역할과 현재 상황을 판단하는 프로젝트 이해 레이어"로 진화.
- **Phase**: **building** — Project Context Signal 3-sprint 구현 완료, 다음 제품화 개선 후보 선정 준비.
- **Blocker**: none
- **Last Activity**: Project Context Signal Sprint 3 — Git changed files와 문서 role을 결합해 현재 가이드/운영 문서만 점검 신호로 승격하고, plan/design은 실행 흔적으로 해석. QA: targeted 23 PASS · typecheck PASS · full test 442 PASS · build PASS (2026-05-02).
- **Remote**: `origin/main` = `21c0f9e`; tag `v0.4.0-beta.10` = `deacb77`; Release: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.10

## Recently Done
1. Project Context Signal Sprint 3 — Docs x Git Interpretation: 무조건 갱신 경고 대신 role-sensitive Git 해석과 AI Handoff Git context 추가.
2. Project Context Signal Sprint 2 — 로컬 Git branch/recent commits/changed areas/dirty/tag summary를 Project Wiki에 추가.
3. Project Context Signal Sprint 1 — 문서 역할 기반 판단, role-sensitive Trust/Drift/AI Handoff 구현.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.10-arm64-free.zip` | `291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d` |
| `dist/Markwand-0.4.0-beta.10-x64-free.zip` | `1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022` |

## Open Product Work
- Next: 실제 앱 dogfood에서 Project Wiki/Git Pulse 표현 밀도와 비개발자 이해도를 점검하고, 투자자 관점의 productization backlog를 선별.
- Guardrail: SSH workspace 성능 보호 유지. Remote Git exec는 아직 도입하지 않고 local Git Pulse 결과만 문서 판단에 보수적으로 연결.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
