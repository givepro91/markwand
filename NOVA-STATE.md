# Nova State

## Current
- **Goal**: 다음 라운드 제품 매력 강화 — Project Wiki를 "읽는 지도"에서 "다음 행동을 제안하는 지도"로 진화.
- **Phase**: **building** — 비개발자 친화 UX 카피 정리 완료, Ask This Project 기반 확장 준비.
- **Blocker**: none
- **Last Activity**: Dogfood UI/Drift fixes — 확장자 없는 slash refs는 missing 오탐 제외, Drift 위치 이동은 검색창 없이 직접 하이라이트, 다크 primary 대비 완화, WorkspacePicker는 fixed custom listbox로 헤더 clipping/긴 목록 UX 개선. QA: targeted vitest 53 PASS · typecheck PASS · full test 410 PASS · build PASS (2026-05-02).
- **Remote**: `origin/main` = `21c0f9e`; tag `v0.4.0-beta.10` = `deacb77`; Release: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.10

## Recently Done
1. Dogfood UI/Drift fixes — slash ref 오탐, Drift 직접 이동, dark primary 대비, WorkspacePicker clipping/긴 목록 UX 개선.
2. Onboarding Brief export — Project Wiki 요약에서 새 협업자용 입문 브리프를 즉시 복사 가능하게 함.
3. Trust & Drift false-positive hardening — 실제 Markwand 문서 기준 감사로 경로/디렉토리/패키지/placeholder 오탐을 줄임.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.10-arm64-free.zip` | `291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d` |
| `dist/Markwand-0.4.0-beta.10-x64-free.zip` | `1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022` |

## Open Product Work
- Project Wiki dogfood: 실제 Markwand workspace에서 Pulse/Timeline 카피와 우선순위가 사람에게 설득력 있는지 확인.
- 다음 후보: Ask This Project answer mode, semantic facets, timeline detail extraction.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
