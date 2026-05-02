# [Plan] Productization Backlog

> 작성일: 2026-05-02
> 작성자: Codex
> Mode: investor/productization review
> Status: ready

## Thesis

Markwand의 상용화 포지션은 "Markdown viewer"가 아니라 **AI 시대의 프로젝트 이해 레이어**다.
투자자 관점에서 중요한 질문은 기능 수가 아니라 다음 세 가지다.

- 사용자가 5분 안에 "내 프로젝트를 이해했다"는 aha moment를 얻는가?
- 비개발자/PM/Founder도 개발 문서 더미를 안전하게 읽을 수 있는가?
- AI에게 넘기기 전 신뢰·리스크·현재성 판단을 Markwand가 대신 줄여주는가?

## Prioritized Backlog

### P0 — First Project Aha Path

목표: 첫 실행 후 프로젝트를 추가한 사용자가 바로 "한눈에 요약 → 확인할 문제 → AI에게 전달" 흐름을 경험한다.

작업:

- 첫 프로젝트 추가 직후 Project Wiki로 자연스럽게 유도
- 빈 상태/첫 스캔 상태에서 "다음 행동"을 한 문장으로 명확히 표시
- Wiki 상단에 "지금 보면 좋은 것" 1개를 primary action으로 제시
- Git Pulse/Trust/Drift가 없거나 숨겨진 경우에도 빈 카드 대신 조용한 설명 제공

성공 기준:

- 새 사용자 기준 5분 안에 프로젝트 요약 복사 또는 첫 문서 열기 완료
- 기술 용어를 몰라도 "무엇을 보면 되는지"가 보임

### P0 — Shareable AI Handoff

목표: Markwand의 핵심 가치를 "AI에게 좋은 컨텍스트를 넘긴다"로 명확히 만든다.

작업:

- Handoff 복사 결과에 Project Brief, Trust, Git Context, role guidance를 더 읽기 쉬운 구조로 정리
- "AI에게 전달하기" 버튼을 사용자가 기대하는 행동으로 재명명/설명
- 복사 후 success state에 "이제 Claude/Codex에 붙여넣으세요" 같은 다음 행동 표시
- 팀 공유용 plain markdown export 후보 검토

성공 기준:

- 사용자가 별도 설명 없이 AI handoff를 제품의 핵심 기능으로 인식
- 복사 결과가 AI에게 바로 붙여넣어도 실행 가능한 구조

### P1 — Trust Calibration

목표: 경고가 많아도 불안하지 않고, 경고가 적어도 맹신하지 않게 만든다.

작업:

- Trust/Drift 설명에 "왜 이 문서는 낮은 우선순위인지" reason 표시
- 오래된 plan/design은 "보존 가능한 기록"으로 별도 tone 제공
- operational/currentGuide만 상단 점검 신호로 승격
- risk item마다 "고치기 / 확인만 / 무시"의 차이를 더 명확히 표시

성공 기준:

- "오래된 문서 = 무조건 갱신" 오해 감소
- 사용자가 AI에게 넘기기 전 확인해야 할 문서만 빠르게 선별

### P1 — Installation Confidence

목표: 무료 배포 제약 안에서 설치 불안을 줄인다.

작업:

- 무료 배포 설치 가이드를 앱/릴리스 문서 양쪽에 명확히 배치
- Gatekeeper/xattr 흐름을 "왜 필요한지"와 함께 안내
- Apple Developer Program/Notarization을 향후 paid distribution milestone로 분리
- 릴리스 QA 체크리스트에 로컬 설치, 첫 실행, 종료 시간, devtools 미노출 검증 포함

성공 기준:

- 사용자가 보안 경고를 보고도 설치 중단하지 않음
- 릴리스 전 로컬 설치/실행 검증 누락 방지

### P2 — Team/Workspace Layer

목표: 개인 도구를 넘어 팀 지식 흐름 제품으로 확장한다.

작업:

- workspace별 project health snapshot
- 최근 7일 변경/문서/리스크 요약을 팀 공유용으로 export
- SSH workspace는 성능 보호 유지, remote Git exec는 명시 opt-in/beta로만 검토
- future: GitHub API/PR/Issue 연결은 local Git Pulse 이후 별도 integration tier로 설계

성공 기준:

- 개인 desktop tool에서 team context dashboard로 확장 가능한 내러티브 확보
- SSH 사용자 경험 악화 없이 enterprise/remote use case 대응

## Release Gate Additions

릴리스 전에 반드시 확인한다.

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm dev` 실제 부팅
- Markwand/Electron dev 프로세스 종료 후 고아 프로세스 없음
- macOS 무료 배포 zip 설치/우클릭 열기/xattr 안내 검증
- 종료 시간이 비정상적으로 길지 않은지 확인
- DevTools가 사용자 빌드에서 열리지 않는지 확인

## Next Sprint Recommendation

다음 구현은 **P0 First Project Aha Path**를 추천한다.
이유: Git Pulse/Trust/Drift가 좋아져도 첫 사용자가 그 의미를 발견하지 못하면 상용화 전환율이 낮다. 첫 프로젝트 추가 직후 "한눈에 요약 → 확인할 문제 → AI에게 전달"까지 한 번에 안내하는 것이 가장 높은 제품 임팩트를 낸다.
