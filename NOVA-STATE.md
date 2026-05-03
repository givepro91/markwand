# Nova State

## Current
- **Goal**: Project Wiki를 "경고 도구"에서 "문서 역할과 현재 상황을 판단하는 프로젝트 이해 레이어"로 진화.
- **Phase**: **implementation** — P1 Trust Calibration + Installation Confidence 후속 완료, 다음 Sprint는 Team/Workspace Layer 후보 검토.
- **Blocker**: none
- **Last Activity**: P1 Trust Calibration — Risk/Doc Debt 항목에 `fix / confirm / preserve` 액션을 추가해 현재 가이드·운영·참조 문서만 수리 후보로 올리고, 오래된 plan/workLog/archive는 보존 가능한 기록으로 표시. Product Guide/README의 무료 ZIP 설치 안내도 최신화. spwk-product dev boot OK, vitest 453 PASS · typecheck PASS · build PASS · dev 종료 후 고아 프로세스 0 (2026-05-03).
- **Remote**: `origin/main` = `21c0f9e`; tag `v0.4.0-beta.10` = `deacb77`; Release: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.10

## Recently Done
1. P1 Trust Calibration — 오래된 계획/작업 기록을 무조건 갱신 대상으로 보지 않고, 고치기/확인만/기록 보존으로 나눠 표시.
2. Installation Confidence — 앱 내 Product Guide와 README/README.ko의 무료 ZIP 설치 흐름을 현재 배포 방식에 맞게 정리.
3. Shareable AI Handoff MVP — AI handoff를 실행 지시형 Markdown으로 재구성하고 Claude/Codex 붙여넣기 CTA까지 연결.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.10-arm64-free.zip` | `291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d` |
| `dist/Markwand-0.4.0-beta.10-x64-free.zip` | `1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022` |

## Open Product Work
- Next: `docs/plans/productization-backlog.md` 기준 P2 Team/Workspace Layer — workspace health snapshot/export를 검토하되 SSH workspace 성능을 악화시키지 않는 local-first 설계가 우선.
- Guardrail: SSH workspace 성능 보호 유지. Remote Git exec는 아직 도입하지 않고 local Git Pulse 결과만 문서 판단에 보수적으로 연결.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
