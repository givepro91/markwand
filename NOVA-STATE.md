# Nova State

## Current
- **Goal**: v0.4.0-beta.17 release — scoped document analysis slowdown fix 배포.
- **Phase**: **done** — beta.17 검증/ZIP 빌드/해시 산출/GitHub prerelease publish 완료.
- **Blocker**: none
- **Last Activity**: v0.4.0-beta.17 release publish — project doc counts/scans now stay scoped to owning workspace, preventing unreachable SSH workspaces from blocking local analysis. `pnpm typecheck` PASS · full vitest 601 PASS · `pnpm smoke:layout` PASS · drift smoke 22/22 PASS · real local/SSH workspace audit PASS except one network-level SSH timeout · `pnpm dist:mac` PASS · codesign verify PASS · `git diff --check` PASS (2026-05-16).
- **Remote**: current public tag `v0.4.0-beta.17`; previous public tag `v0.4.0-beta.16`; Release URL: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.17

## Recently Done
1. Scoped document analysis — project doc count/scan IPC now accepts workspaceId, renderer passes owning workspace, and regression tests cover local projects behind unrelated SSH workspaces.
2. Project refresh recovery — scan generation guards, fs-change race handling, immutable doc bucket updates, and main-process cache generation guards added with regression tests and Electron CDP refresh/folder/image smokes.
3. Highlight recovery — toolbar focus/Chromium Range-collapse path fixed by storing selector snapshots, with hook/component tests and Electron CDP highlight smoke.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.17-arm64-free.zip` | `ea6f9760cd9c2b0da4a8d2181f8219459c73ef903e47fe3502ddc24f9a31d2b6` |
| `dist/Markwand-0.4.0-beta.17-x64-free.zip` | `eddf5ae0fcb07c831dc1ee666ec2f4a62d7b26ae029c6484e2558ccfed104952` |

## Open Product Work
- Next: `docs/plans/productization-backlog.md` 기준 P2 Team/Workspace Layer — workspace health snapshot/export를 검토하되 SSH workspace 성능을 악화시키지 않는 local-first 설계가 우선.
- Guardrail: SSH workspace 성능 보호 유지. Remote Git exec는 아직 도입하지 않고 local Git Pulse 결과만 문서 판단에 보수적으로 연결.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
