# Nova State

## Current
- **Goal**: 다음 라운드 제품 매력 강화 — Project Wiki를 "읽는 지도"에서 "다음 행동을 제안하는 지도"로 진화.
- **Phase**: **building** — 비개발자 친화 UX 카피 정리 완료, Ask This Project 기반 확장 준비.
- **Blocker**: none
- **Last Activity**: UX audit polish — 아이콘-only 버튼에 기본 hover title을 제공하고, 목차 전용 rail의 중복 "목차" 라벨/단일 탭 pill을 정리해 정보 반복을 줄임. QA: targeted vitest 10 PASS · typecheck PASS · full test 427 PASS · build PASS (2026-05-02).
- **Remote**: `origin/main` = `21c0f9e`; tag `v0.4.0-beta.10` = `deacb77`; Release: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.10

## Recently Done
1. UX audit polish — 아이콘-only 버튼 hover title 기본화, 목차 전용 rail 중복 라벨 제거.
2. Search-in-bar + TOC-only rail — 문서 검색은 읽기 바 안에서 펼치고, 목차 아이콘은 목차 전용 rail만 열도록 분리.
3. Document action bar polish — 문서 모드 아이콘을 읽기 바 안으로 넣어 본문 겹침 제거, 목차 버튼 활성 상태를 실제 rail 표시와 동기화.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.10-arm64-free.zip` | `291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d` |
| `dist/Markwand-0.4.0-beta.10-x64-free.zip` | `1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022` |

## Open Product Work
- Project Wiki dogfood: 실제 Markwand workspace에서 Pulse/Timeline 카피와 우선순위가 사람에게 설득력 있는지 확인.
- 다음 후보: Ask This Project answer mode, semantic facets, timeline detail extraction.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
