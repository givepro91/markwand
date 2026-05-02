# Nova State

## Current
- **Goal**: Project Wiki를 "경고 도구"에서 "문서 역할과 현재 상황을 판단하는 프로젝트 이해 레이어"로 진화.
- **Phase**: **building** — Project Wiki/Git Pulse dogfood UX 개선 완료, 다음 제품화 backlog 선별 준비.
- **Blocker**: none
- **Last Activity**: Git Pulse dogfood UX — role-sensitive 인사이트는 기본 노출, raw Git 세부정보는 접힘 처리, 인사이트에서 관련 문서 바로 열기 추가. QA: targeted 22 PASS · typecheck PASS · full test 443 PASS · build PASS (2026-05-02).
- **Remote**: `origin/main` = `21c0f9e`; tag `v0.4.0-beta.10` = `deacb77`; Release: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.10

## Recently Done
1. Git Pulse dogfood UX — 비개발자 인지부하 완화를 위해 개발자 세부정보 접기와 문서 바로 열기 액션 추가.
2. Project Context Signal Sprint 3 — Docs x Git Interpretation: 무조건 갱신 경고 대신 role-sensitive Git 해석과 AI Handoff Git context 추가.
3. Project Context Signal Sprint 2 — 로컬 Git branch/recent commits/changed areas/dirty/tag summary를 Project Wiki에 추가.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.10-arm64-free.zip` | `291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d` |
| `dist/Markwand-0.4.0-beta.10-x64-free.zip` | `1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022` |

## Open Product Work
- Next: 투자자 관점 productization backlog 선별 — 첫 실행/가이드/설치/신뢰 신호/팀 공유 흐름 중 상용화 임팩트가 큰 순서로 정리.
- Guardrail: SSH workspace 성능 보호 유지. Remote Git exec는 아직 도입하지 않고 local Git Pulse 결과만 문서 판단에 보수적으로 연결.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
