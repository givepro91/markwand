# Markwand Global Commercialization Ideas

작성일: 2026-05-01

## Positioning

Markwand의 글로벌 상용화 포지션은 단순한 Markdown viewer가 아니라 **AI 작업 산출물 운영체제**에 가깝다.

Claude Code, Codex, Cursor, Cline, Aider가 만들어낸 문서들은 시간이 지나면 파일 더미가 된다. Markwand는 그 더미를 읽고, 연결하고, 설명하고, 다시 작업 가능한 맥락으로 바꾸는 제품이어야 한다.

핵심 문장:

> Markwand turns scattered AI-generated project notes into a living project map.

## Core Bet

현재 기능만으로도 “찾기와 보기”는 된다. 하지만 상용 제품이 되려면 사용자가 돈을 낼 만큼의 마법이 필요하다.

그 마법은 다음 세 가지다.

1. 이해: 프로젝트가 어떤 상태인지 바로 알 수 있다.
2. 신뢰: 문서와 실제 코드가 얼마나 맞는지 알 수 있다.
3. 재진입: 다음 작업을 바로 시작할 수 있는 맥락을 만들어준다.

## Hero Feature: Project Wiki

사용자 아이디어인 md 기반 위키는 Markwand의 가장 강한 차별점 후보다.

### Concept

프로젝트 폴더 안의 `.md`, frontmatter, drift 상태, 파일 트리, 최근 변경 흐름을 분석해 자동으로 **프로젝트 위키**를 만든다.

위키는 문서를 다시 나열하는 화면이 아니라 다음 질문에 답해야 한다.

- 이 프로젝트는 무엇인가?
- 최근 어떤 방향으로 움직였나?
- 핵심 결정은 무엇인가?
- 지금 위험한 부분은 무엇인가?
- 새 사람이 들어오면 무엇부터 읽어야 하나?
- 다음으로 할 만한 작업은 무엇인가?

### MVP Shape

- `Overview`: 프로젝트 한 줄 설명, 목적, 현재 단계
- `Timeline`: 최근 문서와 결정 흐름
- `Decision Log`: ADR, plan, review, release note에서 결정만 추출
- `Onboarding Path`: 처음 읽을 문서 5개 추천
- `Risk Board`: drift, stale docs, 깨진 링크, 오래된 TODO
- `Glossary`: 프로젝트 용어와 약어 자동 수집

### Why It Is Special

일반 노트 앱은 사용자가 정리해야 한다. Markwand는 이미 흩어진 문서에서 구조를 복원한다.

이 기능이 잘 되면 Markwand는 “문서 뷰어”가 아니라 “프로젝트를 이해시켜주는 도구”가 된다.

## Product Ideas

### 1. Project Memory Map

문서 간 참조, 코드 참조, 날짜, frontmatter, 폴더 구조를 이용해 프로젝트 지도를 만든다.

사용자는 “문서 목록” 대신 “프로젝트의 두뇌 구조”를 본다. 큰 노드는 계획, 설계, 릴리스, 회고, 운영 문서가 되고, drift가 있는 노드는 신뢰도 낮음으로 표시한다.

상용 포인트: 큰 프로젝트일수록 가치가 커진다.

### 2. AI Handoff Brief

현재 선택한 프로젝트 또는 문서 묶음을 기반으로 Claude Code, Codex, Cursor에 바로 붙여넣을 수 있는 handoff brief를 만든다.

예시:

- 현재 목표
- 관련 파일과 문서
- 최근 결정
- 알려진 리스크
- 하지 말아야 할 것
- 추천 첫 작업

상용 포인트: AI 도구를 많이 쓸수록 매일 쓰게 된다.

### 3. Freshness Score

각 프로젝트와 문서에 “신뢰 점수”를 붙인다.

점수 요소:

- 참조한 코드 파일이 존재하는가
- 코드보다 문서가 오래되었는가
- 최근 계획과 구현 커밋이 맞는가
- release note와 실제 버전이 맞는가
- TODO가 오래 방치되었는가

상용 포인트: 팀/회사 환경에서 문서 신뢰 문제가 바로 비용이 된다.

### 4. Explain This Project

비개발자도 이해할 수 있는 설명 모드다.

버튼 하나로 “이 프로젝트를 PM에게 설명”, “신입 개발자에게 설명”, “투자자/고객에게 설명”, “운영 담당자에게 설명” 같은 관점별 요약을 제공한다.

상용 포인트: 개발자 전용 도구에서 팀 전체 도구로 확장된다.

### 5. Change Narrative

Git diff나 최근 문서 변경을 보고 “이번 주 이 프로젝트에서 무슨 일이 있었는가”를 이야기 형태로 정리한다.

예시:

- 새로 생긴 계획
- 완료된 스프린트
- 바뀐 아키텍처
- 남은 리스크
- 다음 주 추천 액션

상용 포인트: weekly report, standup, manager update로 바로 연결된다.

### 6. Doc Debt Radar

문서 부채를 자동으로 잡아준다.

감지 항목:

- 중복된 계획 문서
- 더 이상 참조되지 않는 release note
- 같은 주제를 다루지만 결론이 다른 문서
- 오래된 설치 가이드
- 코드에는 없는 기능을 설명하는 문서

상용 포인트: “정리해야지”를 실제 태스크로 바꿔준다.

### 7. Local Private AI Index

상용화를 고려하면 클라우드 AI만 전제로 두면 민감한 회사 문서에서 막힌다.

로컬 embedding 또는 사용자가 고른 provider를 붙일 수 있는 구조가 좋다.

모드:

- Local only: embedding/search는 로컬
- Bring your own key: OpenAI/Anthropic/Gemini API key 사용
- Team server: 회사 내부 인덱스 서버

상용 포인트: 개인정보와 보안이 구매 결정의 핵심이 된다.

## Differentiation

Obsidian은 사람이 지식 그래프를 만든다.

Notion은 사람이 페이지를 정리한다.

GitHub은 코드와 PR 중심이다.

Markwand는 AI가 남긴 프로젝트 문서를 자동으로 읽고, 코드와 비교하고, 다음 작업 맥락으로 재구성한다.

가장 날카로운 차별점:

> Markwand understands project documentation as an operational artifact, not a note collection.

## Recommended Roadmap

### Phase 1: Trust Foundation

- 깨진 테스트 0 유지
- `⌘K` 검색 backend 실제 구현
- drift false positive/false negative 개선
- frontmatter/source/tag 정리 UX

### Phase 2: Project Wiki MVP

- 프로젝트별 Overview 자동 생성
- 읽을 문서 추천
- Decision Log 추출
- Risk Board 연결
- 모든 생성 결과에 source citation 제공

### Phase 3: AI Handoff

- Claude/Codex/Cursor용 handoff brief 생성
- 선택 문서 묶음 기반 prompt composer 고도화
- “다음 작업 시작” 템플릿 제공

### Phase 4: Commercial Layer

- 개인 Pro: 로컬 인덱스, wiki, AI brief
- Team: 공유 정책, team index, role-based summary
- Enterprise: local-only mode, audit log, private model/provider support

## First MVP Proposal

가장 먼저 만들 기능은 **Project Wiki: Overview + Onboarding Path + Risk Board**가 좋다.

이유:

- 현재 Markwand의 기존 스캔/문서/드리프트 데이터와 자연스럽게 연결된다.
- 사용자가 말한 “문서가 많아져서 파악하기 힘들다”는 고통을 정면으로 해결한다.
- 글로벌 사용자에게 설명하기 쉽다.
- 데모 영상에서 차별점이 바로 보인다.

성공 기준:

- 새 프로젝트를 열었을 때 30초 안에 “아, 이 앱은 내 프로젝트를 이해하게 해주는구나”가 느껴져야 한다.
- 사람이 만든 위키처럼 완벽할 필요는 없지만, 처음 들어온 사람의 첫 1시간을 10분으로 줄여야 한다.
