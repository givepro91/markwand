# Nova State

## Current
- **Goal**: Project Wiki를 "경고 도구"에서 "문서 역할과 현재 상황을 판단하는 프로젝트 이해 레이어"로 진화.
- **Phase**: **building** — Sprint 1 문서 역할 기반 판단 구현 완료, Local Git Pulse v1 준비.
- **Blocker**: none
- **Last Activity**: Project Context Signal Sprint 1 — `WikiDocRole` 기반 Trust/Drift/AI Handoff 판단 구현. old plan/archive는 낮은 우선순위, deploy/runbook은 최신성 민감 문서로 분리. QA: targeted 28 PASS · typecheck PASS · full test 432 PASS · build PASS (2026-05-02).
- **Remote**: `origin/main` = `21c0f9e`; tag `v0.4.0-beta.10` = `deacb77`; Release: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.10

## Recently Done
1. Project Context Signal Sprint 1 — 문서 역할 기반 판단, role-sensitive Trust/Drift/AI Handoff 구현.
2. Project Context Signal plan — 문서 역할 기반 판단, Local Git Pulse, Docs x Git 해석 3-sprint 계획 작성.
3. Wiki section nav placement — 위키 섹션 버튼을 Project Wiki 헤더 액션으로 이동해 위치 모호성 해소.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.10-arm64-free.zip` | `291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d` |
| `dist/Markwand-0.4.0-beta.10-x64-free.zip` | `1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022` |

## Open Product Work
- Next Sprint 2: `docs/plans/project-context-signal.md` 기준 Local Git Pulse v1 — local Git branch/recent commits/changed areas/dirty/tag summary를 lazy + timeout + cache로 추가.
- Sprint 2 전제: SSH workspace에서는 자동 Git 명령 실행 금지. Local first, SSH는 안전 fallback 또는 beta/off.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
