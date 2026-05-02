# Nova State

## Current
- **Goal**: 다음 라운드 제품 매력 강화 — Project Wiki를 "읽는 지도"에서 "다음 행동을 제안하는 지도"로 진화.
- **Phase**: **building** — 비개발자 친화 UX 카피 정리 완료, Ask This Project 기반 확장 준비.
- **Blocker**: none
- **Last Activity**: Document action bar polish — 문서 모드 아이콘을 sticky 읽기 바 내부로 이동해 본문 겹침을 제거하고, 목차 버튼 활성 상태를 실제 우측 목차 rail 표시 여부와 동기화. QA: targeted vitest 4 PASS · typecheck PASS · full test 423 PASS · build PASS (2026-05-02).
- **Remote**: `origin/main` = `21c0f9e`; tag `v0.4.0-beta.10` = `deacb77`; Release: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.10

## Recently Done
1. Document action bar polish — 문서 모드 아이콘을 읽기 바 안으로 넣어 본문 겹침 제거, 목차 버튼 활성 상태를 실제 rail 표시와 동기화.
2. TOC sticky jump + readable rail — 목차 이동 후 제목이 상단 읽기 바에 가려지지 않도록 보정, 긴 목차 제목 2줄 표시.
3. Drift occurrence ignore + tool tabs — 같은 경로 반복 참조도 개별 무시, 문제/목차는 탭 전환 + 레일 닫기 가능.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.10-arm64-free.zip` | `291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d` |
| `dist/Markwand-0.4.0-beta.10-x64-free.zip` | `1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022` |

## Open Product Work
- Project Wiki dogfood: 실제 Markwand workspace에서 Pulse/Timeline 카피와 우선순위가 사람에게 설득력 있는지 확인.
- 다음 후보: Ask This Project answer mode, semantic facets, timeline detail extraction.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
