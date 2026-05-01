# Nova State

## Current
- **Goal**: 다음 라운드 제품 매력 강화 — Project Wiki를 "읽는 지도"에서 "다음 행동을 제안하는 지도"로 진화.
- **Phase**: **building** — Markwand Guide 추가 완료, Ask This Project 기반 확장 준비.
- **Blocker**: none
- **Last Activity**: Markwand Guide — 상단 상시 가이드 버튼 + product intent/core feature modal 추가. Project Wiki, ⌘K 탐색, AI Handoff, Trust/Drift, SSH read-only 의도를 인앱 설명. QA: typecheck PASS · vitest 397 PASS · build PASS (2026-05-01). lint는 로컬 eslint 바이너리 부재로 실행 불가.
- **Remote**: `origin/main` = `21c0f9e`; tag `v0.4.0-beta.10` = `deacb77`; Release: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.10

## Recently Done
1. Markwand Guide — 사용자가 기능을 단순 문서 뷰어로 오해하지 않도록 상단 가이드와 핵심 기능 설명 모달 추가.
2. Workspace manage modal clipping fix — 톱니바퀴 관리 모달을 body portal로 분리해 상단 header/overflow에 잘리지 않도록 수정.
3. SSH-aware ⌘K search backend — 검색 IPC/본문 캐시/원격 읽기 예산을 추가해 검색 기능을 실제 동작 경로로 연결.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.10-arm64-free.zip` | `291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d` |
| `dist/Markwand-0.4.0-beta.10-x64-free.zip` | `1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022` |

## Open Product Work
- Project Wiki dogfood: 실제 Markwand workspace에서 Pulse/Timeline 카피와 우선순위가 사람에게 설득력 있는지 확인.
- 다음 후보: Ask This Project answer mode, semantic facets, onboarding brief export, timeline detail extraction.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
