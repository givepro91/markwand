# Nova State

## Current
- **Goal**: Project Wiki를 "경고 도구"에서 "문서 역할과 현재 상황을 판단하는 프로젝트 이해 레이어"로 진화.
- **Phase**: **building** — Sprint 2 Local Git Pulse v1 구현 완료, Docs x Git Interpretation 준비.
- **Blocker**: none
- **Last Activity**: Project Context Signal Sprint 2 — local-only Git Pulse IPC/Hook/UI 구현. read-only git command, 2s timeout, 30s cache, SSH workspace safe fallback 적용. QA: targeted 18 PASS · typecheck PASS · full test 439 PASS · build PASS (2026-05-02).
- **Remote**: `origin/main` = `21c0f9e`; tag `v0.4.0-beta.10` = `deacb77`; Release: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.10

## Recently Done
1. Project Context Signal Sprint 2 — 로컬 Git branch/recent commits/changed areas/dirty/tag summary를 Project Wiki에 추가.
2. Project Context Signal Sprint 1 — 문서 역할 기반 판단, role-sensitive Trust/Drift/AI Handoff 구현.
3. Project Context Signal plan — 문서 역할 기반 판단, Local Git Pulse, Docs x Git 해석 3-sprint 계획 작성.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.10-arm64-free.zip` | `291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d` |
| `dist/Markwand-0.4.0-beta.10-x64-free.zip` | `1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022` |

## Open Product Work
- Next Sprint 3: `docs/plans/project-context-signal.md` 기준 Docs x Git Interpretation — 최근 변경 영역과 문서 role을 결합해 무조건 갱신 경고가 아닌 "현재 가이드 점검 / 운영 절차 확인 / 과거 기록 유지"로 해석.
- Sprint 3 전제: SSH workspace 성능 보호 유지. Remote Git exec는 아직 도입하지 않고 local Git Pulse 결과를 문서 판단에 보수적으로 연결.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
