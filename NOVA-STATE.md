# Nova State

## Current
- **Goal**: 다음 라운드 제품 매력 강화 — Project Wiki를 "읽는 지도"에서 "다음 행동을 제안하는 지도"로 진화.
- **Phase**: **building** — 비개발자 친화 UX 카피 정리 완료, Ask This Project 기반 확장 준비.
- **Blocker**: none
- **Last Activity**: Trust & Drift false-positive hardening — Markwand 실제 문서 63개로 drift-audit 실행 후 missing 77→55로 감소. 워크스페이스 밖 절대경로, npm scoped package subpath, placeholder `@/path/to/...`, 확장자 없는 경로형 토큰, 디렉토리형 참조를 더 보수적으로 처리. QA: typecheck PASS · drift-smoke 22/22 PASS · targeted vitest 67 PASS (2026-05-01). lint는 로컬 eslint 바이너리 부재로 실행 불가.
- **Remote**: `origin/main` = `21c0f9e`; tag `v0.4.0-beta.10` = `deacb77`; Release: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.10

## Recently Done
1. Trust & Drift false-positive hardening — 실제 Markwand 문서 기준 감사로 경로/디렉토리/패키지/placeholder 오탐을 줄임.
2. Plain-language + product-language UX pass — 비개발자도 이해하기 쉽게 쉬운 설명을 앞에 두고, Markwand 내부 개념명은 함께 보여 학습 가능한 제품 언어로 유지.
3. Markwand Guide — 사용자가 기능을 단순 문서 뷰어로 오해하지 않도록 상단 가이드와 핵심 기능 설명 모달 추가.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.10-arm64-free.zip` | `291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d` |
| `dist/Markwand-0.4.0-beta.10-x64-free.zip` | `1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022` |

## Open Product Work
- Project Wiki dogfood: 실제 Markwand workspace에서 Pulse/Timeline 카피와 우선순위가 사람에게 설득력 있는지 확인.
- 다음 후보: Ask This Project answer mode, semantic facets, onboarding brief export, timeline detail extraction.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
