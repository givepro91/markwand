# [Plan] Project Context Signal

> Nova Engineering — CPS Framework
> 작성일: 2026-05-02
> 작성자: Codex
> Mode: product-design + implementation plan
> Status: Sprint 3 complete

---

## Context

Markwand의 다음 제품 방향은 Markdown viewer가 아니라 **AI 시대의 프로젝트 이해 레이어**다.
현재 Project Wiki는 문서 묶음, 결정 흐름, Drift/Trust, AI handoff를 제공하지만, 아직 일부 판단이 단순하다.

핵심 보정:

- 오래된 문서가 항상 문제는 아니다.
- 바이브코딩에서는 과거 계획서, 설계서, 실험 기록이 자연스럽게 쌓인다.
- Markwand는 문서 최신화를 강요하지 말고, 문서의 역할과 조치 필요성을 구분해야 한다.

제품 원칙:

> Markwand는 문서를 최신화하라고 압박하지 않는다. 대신 이 문서가 현재 가이드인지, 과거 기록인지, 운영 리스크인지 판단해준다.

## Problem

현재 Wiki/Trust/Drift 흐름의 허점:

- `stale`/`old` 신호가 과거 기록 문서에도 과하게 적용될 수 있다.
- 코드 변경과 문서 변경을 단순 비교하면 “문서 갱신 필요” 오탐이 늘어난다.
- 경고가 많아질수록 사용자는 “그래서 지금 뭘 하라는가”를 놓친다.
- Git 신호를 바로 붙이면 branch/commit/diff 같은 개발자 용어가 비개발자에게 부담이 될 수 있다.
- SSH workspace에서 Git 분석을 무겁게 수행하면 성능과 안정성을 해칠 수 있다.

## Solution

### Product Direction

Project Wiki를 “문제 목록”이 아니라 “상황 판단판”으로 전환한다.

사용자가 알아야 할 것은 단순한 경고 수가 아니라:

- 지금 믿고 봐도 되는 문서
- 과거 기록으로 보존하면 되는 문서
- AI에게 넘기기 전에 확인할 문서
- 운영/설치/배포처럼 틀리면 위험한 문서
- 최근 Git 흐름상 프로젝트가 어디로 움직이는지

### Document Role Model

문서마다 별도 역할을 산출한다.

| Role | 설명 | 최신성 민감도 | 예시 |
|---|---|---:|---|
| `currentGuide` | 현재 참고해야 하는 입문/작업 가이드 | 높음 | README, CLAUDE, AGENTS, setup |
| `operational` | 운영/배포/마이그레이션 절차 | 매우 높음 | deploy, ops, runbook, migration |
| `reference` | API/구조/사용법 참조 | 중~높음 | api, architecture, schema |
| `decisionRecord` | 결정/설계/리뷰 기록 | 중간 | design, ADR, review |
| `workLog` | 계획/스프린트/회고/작업 로그 | 낮음 | plans, sprint, retrospective |
| `archive` | 과거 보존/아카이브 | 낮음 | archived, old, legacy |
| `ideaDraft` | 아이디어/초안/브레인스토밍 | 낮음 | brief, proposal, brainstorm |

### Signal Interpretation

같은 신호도 역할별로 다르게 해석한다.

- 오래된 `deploy.md`: `운영 절차라 점검 권장`
- 오래된 `docs/plans/2026-04-x.md`: `과거 계획으로 보임`
- 깨진 참조가 `archive` 문서에 있음: 낮은 우선순위
- 깨진 참조가 `currentGuide`/`operational` 문서에 있음: 높은 우선순위
- 설계 문서 이후 관련 커밋이 많음: `설계가 실행된 흔적`
- 코드 변경은 많지만 README가 그대로임: `입문 문서 최신성 확인`

### Git Pulse

Git/GitHub는 “현재 상황 센서”로 붙인다.
처음에는 GitHub API가 아니라 로컬 Git 명령으로 제한한다.

수집 후보:

- 현재 브랜치
- 최근 커밋 N개
- 최근 7/14일 변경 파일 영역
- dirty state
- 최근 태그/릴리스

표현은 개발자 용어를 그대로 노출하지 않고 사용자 언어로 번역한다.

- `커밋 24개` → `최근 변경이 활발함`
- `dirty files 5` → `아직 저장/정리되지 않은 작업 있음`
- `tag 이후 변경` → `릴리스 이후 바뀐 내용 있음`

SSH 정책:

- 자동 전체 스캔 중 Git 명령 실행 금지
- 프로젝트 화면 진입 시 lazy load
- 최근 N개/최근 14일 제한
- timeout 필수
- 실패 시 조용한 fallback
- remote exec가 안전하게 준비되기 전까지 SSH Git Pulse는 beta/off

## Sprint Plan

### Sprint 1 — Document Role & Judgment

목표: Trust/Drift의 기본 판단을 “경고”에서 “역할 기반 해석”으로 바꾼다.

작업:

- `projectWiki.ts`에 `WikiDocRole` 타입 추가
- 문서 role classifier 구현
- 기존 cluster와 role을 분리
- Doc Debt / Trust Score 가중치를 role별로 조정
- Project Wiki 카피를 `갱신 필요` 중심에서 `확인 필요 / 과거 기록 / 운영 점검 / AI 전달 주의` 중심으로 변경
- AI Handoff Brief에 role별 문서 섹션 추가

Done:

- old plan은 갱신 강요 대상이 아니다.
- old deploy/runbook은 점검 권장 대상이다.
- archive 문서의 broken ref는 낮은 우선순위다.
- currentGuide 문서의 broken ref는 높은 우선순위다.
- 역할별 판단 문구가 ko/en i18n에 반영된다.
- targeted vitest + typecheck + full test + build PASS.

### Sprint 2 — Local Git Pulse v1

목표: Project Wiki가 문서뿐 아니라 실제 repo 변경 흐름도 요약한다.

작업:

- main process에 local Git summary IPC 추가
- `git -C <root>` 기반 read-only 명령만 사용
- timeout/caching 적용
- Project Wiki 상단에 “최근 변경 흐름” 카드 추가
- Git 없는 폴더에서는 UI가 조용히 숨거나 fallback

Done:

- local Git repo에서 branch/recent commits/changed areas/dirty/tag 정보를 읽는다.
- Git 명령 실패가 앱 에러로 번지지 않는다.
- SSH workspace에서는 기본 비활성 또는 안전 fallback이다.
- Project Wiki가 Git 정보를 쉬운 언어로 표시한다.

### Sprint 3 — Docs x Git Interpretation

목표: Git 변경 신호와 문서 역할을 결합해 더 정확한 판단을 만든다.

작업:

- 최근 변경 파일 영역과 관련 문서 role 매칭
- 운영/가이드 문서만 높은 점검 신호로 승격
- plan/design은 `실행 흔적` 또는 `기록 문서`로 해석
- AI Handoff Brief에 Git context 포함

Done:

- `code changed, old docs`를 무조건 문제로 표시하지 않는다.
- role-sensitive 판단만 상단 Pulse에 노출한다.
- 상세 Git 신호는 접힘 영역에서 확인 가능하다.

## Risk Map

| 리스크 | 영향 | 완화 |
|---|---|---|
| Role classifier 오탐 | 사용자 신뢰 하락 | role reason 표시, conservative default, 테스트 fixture 확대 |
| 경고 감소가 무관심처럼 보임 | 제품 가치 약화 | “왜 낮은 우선순위인지” 설명 제공 |
| Git Pulse 성능 저하 | 앱 체감 저하 | lazy load, timeout, HEAD 기반 캐시 |
| SSH Git 지원 과욕 | 원격 사용성 저하 | Sprint 2에서 local-only, SSH는 명시 beta |
| 비개발자에게 Git 용어 난해 | 확장성 저하 | UI 카피는 사용자 언어, raw Git은 상세에 숨김 |

## Context Restore Contract

컨텍스트 압축 또는 새 세션 후에는 다음 순서로 복원한다.

1. `NOVA-STATE.md`의 Current와 Open Product Work 확인.
2. 이 문서 `docs/plans/project-context-signal.md`를 읽고 Sprint 1부터 이어간다.
3. Sprint 1 완료 전에는 Git Pulse 구현을 시작하지 않는다.
4. 구현 전 핵심 원칙을 재확인한다: “오래된 문서 = 무조건 갱신 필요”가 아니다.
5. 사용자 승인 없이 릴리스/태그/GitHub Release를 진행하지 않는다.
