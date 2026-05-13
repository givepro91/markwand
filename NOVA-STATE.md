# Nova State

## Current
- **Goal**: v0.4.0-beta.14 release — Project Tabs + calmer Project Wiki 배포.
- **Phase**: **done** — beta.14 검증/ZIP 빌드/해시 산출/GitHub prerelease publish 완료.
- **Blocker**: none
- **Last Activity**: v0.4.0-beta.14 release publish — Project Tabs, per-project view sessions, closed-tab recovery, tab a11y/context menu/overflow controls, and Project Wiki progressive disclosure shipped. `pnpm typecheck` PASS · full vitest 566 PASS · `pnpm smoke:layout` PASS · `pnpm dist:mac` PASS · codesign verify PASS · `git diff --check` PASS (2026-05-13).
- **Remote**: current public tag `v0.4.0-beta.14`; previous public tag `v0.4.0-beta.13`; Release URL: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.14

## Recently Done
1. v0.4.0-beta.14 release package — Project Tabs + Project Wiki quality pass를 묶어 macOS free ZIP 산출, 해시/설치 문서/릴리스 노트 갱신.
2. Project Wiki quality pass — 복잡한 위키 첫 화면을 읽기 시작/요약/AI 작업 중심으로 줄이고, 분석형 상세 정보는 필요할 때 펼치도록 재배치. Toss UX Writing 원칙에 맞춰 Korean i18n의 영어/전문용어 노출을 축소.
3. Project Tabs MVP/polish/persistence/reopen/reorder/overflow/a11y/menu — 여러 프로젝트를 열린 탭으로 유지하고, 탭 전환/재시작/닫은 탭 복구 시 선택 문서/위키 상태/스크롤을 프로젝트별로 복원. active 탭 시각 대비, 키보드 탭 조작, 드래그 순서 재정렬, 다중 탭 스크롤 조작, 컨텍스트 메뉴 보강.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.14-arm64-free.zip` | `b8eaf255a8e4fc8c77743e362789b95ed88cfa9fcfd2d038929f6502212c8004` |
| `dist/Markwand-0.4.0-beta.14-x64-free.zip` | `77d1c0c5c6b9f7acf599a0d0238b5cc236417ee0397f44621a86d15e2df6081c` |

## Open Product Work
- Next: `docs/plans/productization-backlog.md` 기준 P2 Team/Workspace Layer — workspace health snapshot/export를 검토하되 SSH workspace 성능을 악화시키지 않는 local-first 설계가 우선.
- Guardrail: SSH workspace 성능 보호 유지. Remote Git exec는 아직 도입하지 않고 local Git Pulse 결과만 문서 판단에 보수적으로 연결.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
