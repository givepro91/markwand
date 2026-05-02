# Nova State

## Current
- **Goal**: Project Wiki를 "경고 도구"에서 "문서 역할과 현재 상황을 판단하는 프로젝트 이해 레이어"로 진화.
- **Phase**: **planning** — 제품화 backlog 선별 완료, 다음 Sprint는 First Project Aha Path 추천.
- **Blocker**: none
- **Last Activity**: Productization backlog — 투자자 관점으로 P0 First Project Aha Path / Shareable AI Handoff, P1 Trust Calibration / Installation Confidence, P2 Team Layer 정리. QA: dev boot PASS · targeted 19 PASS · typecheck PASS · full test 443 PASS · build PASS (2026-05-02).
- **Remote**: `origin/main` = `21c0f9e`; tag `v0.4.0-beta.10` = `deacb77`; Release: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.10

## Recently Done
1. Productization backlog — `docs/plans/productization-backlog.md` 작성, 다음 Sprint로 First Project Aha Path 추천.
2. Runtime QA — 실제 `pnpm dev` 부팅에서 Git Pulse IPC의 ESM import 오류 수정, 고아 프로세스 없음 확인.
3. Git Pulse dogfood UX — 비개발자 인지부하 완화를 위해 개발자 세부정보 접기와 문서 바로 열기 액션 추가.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.10-arm64-free.zip` | `291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d` |
| `dist/Markwand-0.4.0-beta.10-x64-free.zip` | `1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022` |

## Open Product Work
- Next: `docs/plans/productization-backlog.md` 기준 P0 First Project Aha Path 구현 — 첫 프로젝트 추가 후 "한눈에 요약 → 확인할 문제 → AI에게 전달" 흐름 강화.
- Guardrail: SSH workspace 성능 보호 유지. Remote Git exec는 아직 도입하지 않고 local Git Pulse 결과만 문서 판단에 보수적으로 연결.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
