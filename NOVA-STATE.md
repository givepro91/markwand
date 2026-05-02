# Nova State

## Current
- **Goal**: 다음 라운드 제품 매력 강화 — Project Wiki를 "읽는 지도"에서 "다음 행동을 제안하는 지도"로 진화.
- **Phase**: **building** — 비개발자 친화 UX 카피 정리 완료, Ask This Project 기반 확장 준비.
- **Blocker**: none
- **Last Activity**: TOC sticky jump + readable rail — 목차 이동 시 sticky 읽기 바 높이를 보정해 제목 가림을 방지하고, 우측 목차 레일을 넓혀 긴 제목을 2줄까지 표시. QA: targeted vitest 4 PASS · typecheck PASS · full test 421 PASS · build PASS (2026-05-02).
- **Remote**: `origin/main` = `21c0f9e`; tag `v0.4.0-beta.10` = `deacb77`; Release: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.10

## Recently Done
1. TOC sticky jump + readable rail — 목차 이동 후 제목이 상단 읽기 바에 가려지지 않도록 보정, 긴 목차 제목 2줄 표시.
2. Drift occurrence ignore + tool tabs — 같은 경로 반복 참조도 개별 무시, 문제/목차는 탭 전환 + 레일 닫기 가능.
3. Drift review rail UX — 우측 상시 패널에서 참조 이동/무시/복사/재검증을 문서 읽기 중 유지.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.10-arm64-free.zip` | `291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d` |
| `dist/Markwand-0.4.0-beta.10-x64-free.zip` | `1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022` |

## Open Product Work
- Project Wiki dogfood: 실제 Markwand workspace에서 Pulse/Timeline 카피와 우선순위가 사람에게 설득력 있는지 확인.
- 다음 후보: Ask This Project answer mode, semantic facets, timeline detail extraction.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
