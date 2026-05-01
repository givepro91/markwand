# Nova State

## Current
- **Goal**: 다음 라운드 제품 매력 강화 — Project Wiki를 "읽는 지도"에서 "다음 행동을 제안하는 지도"로 진화.
- **Phase**: **building** — 비개발자 친화 UX 카피 정리 완료, Ask This Project 기반 확장 준비.
- **Blocker**: none
- **Last Activity**: Plain-language + product-language UX pass — Project Wiki/Guide 용어를 한눈에 요약·문서 묶음·확인할 문제·결정 기록처럼 쉽게 설명하되 Project Brief·Knowledge Map·Risk Board·Decision Log를 함께 노출해 Markwand 개념 학습을 유지. 좌측 `Claude로 열기`는 도구 비종속 `AI에게 전달하기` 복사 액션으로 교체. QA: typecheck PASS · vitest 398 PASS · build PASS (2026-05-01). lint는 로컬 eslint 바이너리 부재로 실행 불가.
- **Remote**: `origin/main` = `21c0f9e`; tag `v0.4.0-beta.10` = `deacb77`; Release: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.10

## Recently Done
1. Plain-language + product-language UX pass — 비개발자도 이해하기 쉽게 쉬운 설명을 앞에 두고, Markwand 내부 개념명은 함께 보여 학습 가능한 제품 언어로 유지.
2. Markwand Guide — 사용자가 기능을 단순 문서 뷰어로 오해하지 않도록 상단 가이드와 핵심 기능 설명 모달 추가.
3. Workspace manage modal clipping fix — 톱니바퀴 관리 모달을 body portal로 분리해 상단 header/overflow에 잘리지 않도록 수정.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.10-arm64-free.zip` | `291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d` |
| `dist/Markwand-0.4.0-beta.10-x64-free.zip` | `1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022` |

## Open Product Work
- Project Wiki dogfood: 실제 Markwand workspace에서 Pulse/Timeline 카피와 우선순위가 사람에게 설득력 있는지 확인.
- 다음 후보: Ask This Project answer mode, semantic facets, onboarding brief export, timeline detail extraction.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
