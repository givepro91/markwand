# Nova State

## Current
- **Goal**: Project Wiki/뷰어/파일 트리 중심으로 일상 사용 중 마찰을 줄이는 v0.4 productization polish.
- **Phase**: **release** — quit latency hotfix + 문서 액션 레이아웃 보정 완료, `v0.4.0-beta.13` 배포 진행.
- **Blocker**: none
- **Last Activity**: v0.4.0-beta.13 release prep — `pnpm dev` quit 경로에서 Electron main PID가 3s+ 남던 체감 지연을 fast quit 경로로 해소. macOS quit AppleEvent smoke 기준 요청 반환 0.155s, 전체 Electron 프로세스 소멸 0.295s. 문서 액션 라벨은 aria/title의 구체성을 유지하고 visible label/레이아웃 밀도를 줄여 `pnpm smoke:layout` 1400/1440/1600x900에서 stickyGap 0, bar height 56px, action row 38px 재검증. typecheck PASS · full vitest 530 PASS · smoke/layout PASS · dist:mac:free PASS · codesign verify PASS · diff check PASS (2026-05-12).
- **Remote**: release target `v0.4.0-beta.13`; previous public tag `v0.4.0-beta.12`; Release URL after publish: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.13

## Recently Done
1. 1440px document layout pass — sticky reading bar 실제 상단 밀착, 본문 padding 분리, compact TOC rail, reading bar flex 재배분을 Electron CDP 실측과 `pnpm smoke:layout` 자동 스모크로 검증.
2. Quit latency hotfix — quit 이벤트에서 창을 즉시 숨기고 cleanup을 best-effort로 시작한 뒤 Electron PID를 즉시 종료. `pnpm dev` wrapper도 fast quit 신호를 받아 셸 세션 잔류를 방지.
3. UX stability/readability pass — 검증되지 않은 경고/기능은 숨기는 정책 문서화, 문서 헤더 복사 액션 메뉴화, 읽기 바 compact edge-to-edge sticky 정리, Markdown viewer 가독성/대비 회귀 테스트 추가.
4. Reference audit product de-emphasis — 검증 신뢰가 애매한 링크/깨진 참조 경고를 기본 UI에서 숨기고, Project Wiki를 읽기 순서/맥락 중심으로 재정렬.
5. In-app file operations — 새 마크다운/폴더 생성, 선택 파일 이름 변경, 휴지통 이동 구현은 보존하되 UI 노출은 숨김. 향후 에디터/작성 플로우와 함께 재검토.
6. Copy affordances — 현재 문서 제목 복사, 경로 복사, 마크다운 원본 복사를 문서 헤더에서 제공.
7. Update UX finish — 시작/주기 업데이트 감지 후 헤더 배지로 상시 표시하고, 배지 클릭 시 다운로드/릴리스 페이지로 이동.
8. Drift verification trust fix — 코드/계획 경로 false positive를 보수적으로 숨기고, 실제 문서 링크 후보만 missing으로 올리도록 재분류 + 우측 문제 rail 스크롤 수정.
9. First Project Aha Path — 프로젝트가 1개뿐인 워크스페이스에서 Project Wiki 추천 시작점을 노출.
10. File Tree Sync fix — 파일 생성/삭제/수정이 자동 watcher와 수동 재스캔 양쪽에서 트리에 반영되도록 보강.
11. Team Snapshot MVP — Project Wiki에서 팀 공유용 프로젝트 상태 Markdown을 복사할 수 있게 추가.
12. Viewer usability — 도면/이미지 transform 줌·grab-pan·휠 줌·더블클릭·키보드 조작·단축키 힌트, 현재 파일 위치 열기, 현재 파일 앱 열기, 마크다운 원본 복사, 축소 화면 읽기 바 보정을 추가.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.13-arm64-free.zip` | `1eb41629215dc87bde629e0d79024b5a8eef1afa78942a95bd6809a323d15ecc` |
| `dist/Markwand-0.4.0-beta.13-x64-free.zip` | `8a2b4ff04bfc17b79d1f47a716c73110a3b8a5601ded8b964fa3e17313ec4dcd` |

## Open Product Work
- Next: `docs/plans/productization-backlog.md` 기준 P2 Team/Workspace Layer — workspace health snapshot/export를 검토하되 SSH workspace 성능을 악화시키지 않는 local-first 설계가 우선.
- Guardrail: SSH workspace 성능 보호 유지. Remote Git exec는 아직 도입하지 않고 local Git Pulse 결과만 문서 판단에 보수적으로 연결.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
