# Nova State

## Current
- **Goal**: v0.4.0-beta.15 release — Markdown callouts + table readability 배포.
- **Phase**: **done** — beta.15 검증/ZIP 빌드/해시 산출/GitHub prerelease publish 완료.
- **Blocker**: none
- **Last Activity**: v0.4.0-beta.15 release publish — GFM Alert callouts, safe details blocks, Mermaid failure states, same-doc hash navigation, table readability policy, and Codex app window/CDP capture rule shipped. `pnpm typecheck` PASS · full vitest 588 PASS · `pnpm smoke:layout` PASS · `pnpm dist:mac` PASS · codesign verify PASS · `git diff --check` PASS (2026-05-14).
- **Remote**: current public tag `v0.4.0-beta.15`; previous public tag `v0.4.0-beta.14`; Release URL: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.15

## Recently Done
1. v0.4.0-beta.15 release package — AI agent state 문서용 Markdown viewer polish를 묶어 macOS free ZIP 산출, 해시/설치 문서/릴리스 노트 갱신.
2. Markdown viewer GFM polish — Alert/admonition 5종, safe details, task list/footnote polish, Mermaid error state, same-doc hash jump, table wrapping/overflow policy를 회귀 테스트와 앱 창 CDP layout smoke로 검증.
3. v0.4.0-beta.14 release package — Project Tabs + Project Wiki quality pass를 묶어 macOS free ZIP 산출, 해시/설치 문서/릴리스 노트 갱신.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.15-arm64-free.zip` | `dee6227268f9129a371056768035a36e9d29a4c55b797d9e2749c4168032b18c` |
| `dist/Markwand-0.4.0-beta.15-x64-free.zip` | `09c65c4f12a890376628b5a0b5067ea1fc36ed650e2513fd90d583e4566a1074` |

## Open Product Work
- Next: `docs/plans/productization-backlog.md` 기준 P2 Team/Workspace Layer — workspace health snapshot/export를 검토하되 SSH workspace 성능을 악화시키지 않는 local-first 설계가 우선.
- Guardrail: SSH workspace 성능 보호 유지. Remote Git exec는 아직 도입하지 않고 local Git Pulse 결과만 문서 판단에 보수적으로 연결.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
