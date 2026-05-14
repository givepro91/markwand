# Nova State

## Current
- **Goal**: v0.4.0-beta.16 release — project refresh + highlight recovery 배포.
- **Phase**: **done** — beta.16 검증/ZIP 빌드/해시 산출/GitHub prerelease publish 완료.
- **Blocker**: none
- **Last Activity**: v0.4.0-beta.16 release publish — project refresh stale-scan/store identity bug and highlight toolbar Range-collapse bug fixed. `pnpm typecheck` PASS · full vitest 596 PASS · `pnpm smoke:layout` PASS · Electron CDP refresh/folder/image/highlight smokes PASS · `pnpm dist:mac` PASS · codesign verify PASS · `git diff --check` PASS (2026-05-14).
- **Remote**: current public tag `v0.4.0-beta.16`; previous public tag `v0.4.0-beta.15`; Release URL: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.16

## Recently Done
1. Project refresh recovery — scan generation guards, fs-change race handling, immutable doc bucket updates, and main-process cache generation guards added with regression tests and Electron CDP refresh/folder/image smokes.
2. Highlight recovery — toolbar focus/Chromium Range-collapse path fixed by storing selector snapshots, with hook/component tests and Electron CDP highlight smoke.
3. v0.4.0-beta.15 release package — AI agent state 문서용 Markdown viewer polish를 묶어 macOS free ZIP 산출, 해시/설치 문서/릴리스 노트 갱신.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.16-arm64-free.zip` | `158c1e9f0b92f4093ee0fc7690dc79feff0b1ce23a9c82edd58a111b67dc3d4f` |
| `dist/Markwand-0.4.0-beta.16-x64-free.zip` | `2e48322d8b6fd5ee33fa2cfce76414c9aa918f31b6c43d4c29e9f36d25c84823` |

## Open Product Work
- Next: `docs/plans/productization-backlog.md` 기준 P2 Team/Workspace Layer — workspace health snapshot/export를 검토하되 SSH workspace 성능을 악화시키지 않는 local-first 설계가 우선.
- Guardrail: SSH workspace 성능 보호 유지. Remote Git exec는 아직 도입하지 않고 local Git Pulse 결과만 문서 판단에 보수적으로 연결.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
