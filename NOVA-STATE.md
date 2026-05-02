# Nova State

## Current
- **Goal**: 다음 라운드 제품 매력 강화 — Project Wiki를 "읽는 지도"에서 "다음 행동을 제안하는 지도"로 진화.
- **Phase**: **building** — 비개발자 친화 UX 카피 정리 완료, Ask This Project 기반 확장 준비.
- **Blocker**: none
- **Last Activity**: Wiki section nav placement — 위키 섹션 버튼을 Pulse/Brief 사이 standalone 위치에서 Project Wiki 헤더 우측 액션으로 이동해 소속과 목적을 명확화. QA: targeted vitest 11 PASS · typecheck PASS · full test 429 PASS · build PASS (2026-05-02).
- **Remote**: `origin/main` = `21c0f9e`; tag `v0.4.0-beta.10` = `deacb77`; Release: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.10

## Recently Done
1. Wiki section nav placement — 위키 섹션 버튼을 Project Wiki 헤더 액션으로 이동해 위치 모호성 해소.
2. Comfortable actions + collapsed wiki nav — 문서 액션 라벨 버튼화, Wiki 섹션 이동 기본 접힘 처리.
3. UX audit polish — 아이콘-only 버튼 hover title 기본화, 목차 전용 rail 중복 라벨 제거.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.10-arm64-free.zip` | `291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d` |
| `dist/Markwand-0.4.0-beta.10-x64-free.zip` | `1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022` |

## Open Product Work
- Project Wiki dogfood: 실제 Markwand workspace에서 Pulse/Timeline 카피와 우선순위가 사람에게 설득력 있는지 확인.
- 다음 후보: Ask This Project answer mode, semantic facets, timeline detail extraction.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
