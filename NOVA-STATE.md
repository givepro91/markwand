# Nova State

## Current
- **Goal**: 다음 라운드 제품 매력 강화 — Project Wiki를 "읽는 지도"에서 "다음 행동을 제안하는 지도"로 진화.
- **Phase**: **building** — 비개발자 친화 UX 카피 정리 완료, Ask This Project 기반 확장 준비.
- **Blocker**: none
- **Last Activity**: Drift review rail UX — 문서 확인 중에도 참조 이동/무시/복사/재검증을 계속 처리할 수 있도록 Drift 패널을 우측 문서 도구 레일로 이동하고 TOC와 공존하도록 정리. QA: targeted vitest 8 PASS · typecheck PASS · full test 417 PASS · build PASS (2026-05-02).
- **Remote**: `origin/main` = `21c0f9e`; tag `v0.4.0-beta.10` = `deacb77`; Release: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.10

## Recently Done
1. Drift review rail UX — 우측 상시 패널에서 참조 이동/무시/복사/재검증을 문서 읽기 중 유지.
2. Drift table-line jump hardening — 표 안 참조 라인 이동 + Drift 패널 검색 오염 차단.
3. Drift exact-line jump fix — "본문에서 보기"가 같은 참조의 첫 매치가 아닌 실제 L번호 위치로 이동.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.10-arm64-free.zip` | `291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d` |
| `dist/Markwand-0.4.0-beta.10-x64-free.zip` | `1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022` |

## Open Product Work
- Project Wiki dogfood: 실제 Markwand workspace에서 Pulse/Timeline 카피와 우선순위가 사람에게 설득력 있는지 확인.
- 다음 후보: Ask This Project answer mode, semantic facets, timeline detail extraction.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
