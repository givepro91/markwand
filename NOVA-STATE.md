# Nova State

## Current
- **Goal**: Project Wiki를 "경고 도구"에서 "문서 역할과 현재 상황을 판단하는 프로젝트 이해 레이어"로 진화.
- **Phase**: **planning** — 문서 역할 기반 Trust/Drift + Local Git Pulse 로드맵 확정, Sprint 1 준비.
- **Blocker**: none
- **Last Activity**: Project Context Signal plan — 오래된 문서=갱신 필요 단순화를 버리고, 문서 역할 기반 판단 + Git Pulse 단계 계획을 `docs/plans/project-context-signal.md`에 고정 (2026-05-02).
- **Remote**: `origin/main` = `21c0f9e`; tag `v0.4.0-beta.10` = `deacb77`; Release: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.10

## Recently Done
1. Project Context Signal plan — 문서 역할 기반 판단, Local Git Pulse, Docs x Git 해석 3-sprint 계획 작성.
2. Wiki section nav placement — 위키 섹션 버튼을 Project Wiki 헤더 액션으로 이동해 위치 모호성 해소.
3. Comfortable actions + collapsed wiki nav — 문서 액션 라벨 버튼화, Wiki 섹션 이동 기본 접힘 처리.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.10-arm64-free.zip` | `291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d` |
| `dist/Markwand-0.4.0-beta.10-x64-free.zip` | `1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022` |

## Open Product Work
- Next Sprint 1: `docs/plans/project-context-signal.md` 기준 `WikiDocRole` 분류 + role-sensitive Trust/Drift/AI Handoff 개선.
- Sprint 1 전제: "오래된 문서 = 무조건 갱신 필요"가 아니다. plan/design/archive는 기록일 수 있고 deploy/README/runbook은 최신성 민감도가 높다.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
