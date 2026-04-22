# Markwand — LinkedIn 포스트 (한국어)

**대상 릴리스**: v0.3.0-beta.7 · 2026-04-22
**톤**: 개인 빌더 / 프로덕트 소개 (A 방향)
**글자 수**: 각 variant 한국어 800~1200자 (LinkedIn "더 보기" 접힘 전 노출 최적)
**첨부 이미지**: `docs/launch/cover.svg` → PNG 변환, 그리고 녹화 가능 시 `docs/launch/recording-storyboard.md` 따라 10초 GIF

---

## Variant A — 문제 정의 → 해결 (정석)

> Claude Code 로 PRD 하나 뽑고,
> Codex 로 리팩터 플랜 쓰고,
> 다음 날 "그거 어디다 저장했더라…" 🥲

AI 에게 받은 산출물이 프로젝트 곳곳에 흩어지는 문제, 저만 겪는 건 아니더군요.

그래서 만들었습니다 — **Markwand**, macOS 용 마크다운 문서 뷰어입니다.

🗂 여러 프로젝트 폴더(예: `~/develop/*`)를 워크스페이스로 한 번에 등록
📅 최근 7일에 수정된 문서를 사이드바에서 바로 확인 (v0.3.0-beta.7 신규)
🏷 frontmatter 의 `tags`·`source`(claude/codex/design/review)·`status` 로 즉시 필터링
🔍 문서 안 검색 + ⌘K 크로스 프로젝트 팔레트
🔗 drift 감지 — 문서에서 참조한 코드 파일이 없거나 바뀌었으면 배지 표시
🖼 이미지도 1급 자산 — PNG/JPG/SVG/GIF 같이 관리
🌐 원격 SSH 서버 폴더까지 읽기 전용으로 (베타)
🇰🇷🇺🇸 한국어 / 영어 자동 전환

**파일은 전부 로컬에서만 처리합니다.** 외부 서버로 문서 내용을 보내지 않아요. 코드사이닝은 아직 없지만(베타) ad-hoc 서명으로 우클릭 한 번이면 실행됩니다.

Electron + React + TypeScript, MIT 라이선스.
베타 배포 중 — DMG 받아서 바로 써보실 수 있습니다.

👉 https://github.com/givepro91/markwand/releases/tag/v0.3.0-beta.7

피드백·버그 리포트 환영합니다. 특히 다른 AI 툴(Cursor, Cline, Aider 등) 산출물 워크플로 쓰시는 분들의 "이런 게 있으면 좋겠다" 를 듣고 싶어요.

#AI #Markdown #개발자도구 #ClaudeCode #Codex #오픈소스 #macOS #Electron

---

## Variant B — Before/After 비교

**Before.** 어제 Claude 로 쓴 스펙 문서, 지난주 Codex 로 만든 ADR — "그거 어디 있더라?" 하면서 `find` + `grep` 콤보. 😵

**After.** 프로젝트 17개를 워크스페이스로 한 번 등록해두면, 사이드바 하나에서 모든 AI 산출물이 날짜·태그·프로젝트별로 정렬되어 있습니다.

그래서 만든 게 **Markwand** — macOS 용 AI 산출물 큐레이터입니다.

이번 v0.3.0-beta.7 에서 추가한 것:

✨ 좌측 사이드바 **최근 7일 문서** 패널 — 방금 Claude/Codex 가 만든 문서가 맨 위로
🏷 `source: claude/codex/design/review` 기반 출처별 칩 필터
🔗 drift 배지 — 문서에서 언급한 코드 파일이 변경됐으면 "◐ stale" 표시
🌐 원격 SSH 서버 (읽기 전용, 베타)
🇰🇷🇺🇸 한국어 / 영어

개발 중 가장 신경 쓴 부분:
- **데이터 로컬 보관** — 모든 스캔·파싱·검색이 로컬. 네트워크 전송 0 (SSH 워크스페이스 제외)
- **읽기 전용 설계** — Markwand 는 파일을 절대 쓰지 않습니다. 편집은 본인의 에디터에서
- **가볍게** — 17 프로젝트·2,377 md 파일·11k 감시 디렉토리에서 메인 프로세스 RSS ~158 MB

Electron + React + TypeScript · MIT · https://github.com/givepro91/markwand

DMG → https://github.com/givepro91/markwand/releases/tag/v0.3.0-beta.7

#AI #Markdown #ClaudeCode #Codex #Cursor #개발자도구 #오픈소스

---

## Variant C — 빌더 일지 톤

Claude Code 와 함께 5일, **Markwand v0.3.0-beta.7** 를 오늘 공개했습니다.

처음엔 단순한 `.md` 뷰어로 시작했는데, 만들다 보니 "AI 산출물 큐레이터" 가 더 정확한 설명이 됐습니다. 프로젝트 사이를 건너다니며 Claude·Codex 로 뽑은 문서들이 쌓이는데, 그걸 빠르게 다시 찾고 태그·기간별로 관리할 수 있는 로컬 앱이 없어서 직접 만들었습니다.

이번 beta.7 에 새로 들어간 것:

📅 **최근 7일 문서 패널** — ProjectView 좌측에 별도 섹션. 방금 작성한 문서가 맨 위.
🧹 **i18n 잔여 케이스 정리** — 한/영 100% 번역 자원화 (토스트, aria-label, 에러 메시지 포함)
🏷 **md-viewer → Markwand** 이름 전면 통일 — 내부 store key 까지

그동안 해온 것들:
- SSH 원격 파일시스템 transport (5 sprint)
- drift 감지 (문서↔코드 참조 정합성)
- 이미지 1급 자산 승격
- ⌘K 팔레트 (검색 backend 는 아직)
- 다국어, 앱 아이콘, ad-hoc 서명, MIT LICENSE

전부 오픈소스 · MIT · macOS 전용 (현재).

많은 부분을 Claude Code 와의 페어 프로그래밍으로 했는데 — 특히 Nova 라는 제 개인 메타 워크플로 (Plan → Design → 독립 Evaluator) 에 맞춰 AI 를 조율했더니 퀄리티 게이트가 안정적으로 유지됐습니다. 이 부분은 별도 글로 정리할 예정입니다.

DMG (unsigned, ad-hoc 서명) → https://github.com/givepro91/markwand/releases/tag/v0.3.0-beta.7
Repo → https://github.com/givepro91/markwand

피드백 환영합니다 🙏

#ClaudeCode #VibeCoding #AI #Markdown #오픈소스 #Electron #macOS

---

## 선택 가이드

| 상황 | 추천 variant |
|---|---|
| 프로덕트 중심으로 더 넓은 개발자 대상 어필 | **A** |
| "문제 공감 → 즉시 해결" 짧고 직관적 노출 | **B** |
| 빌더 팔로워 커뮤니티 / AI 개발 워크플로 관심층 | **C** |

권장: **A 를 메인**으로 올리고, 1~2일 뒤 **C 를 후속 포스트**로 연결해 "뒷이야기" 레이어 추가.

## 첨부 미디어 옵션

1. **커버 이미지만 (최소)**: `docs/launch/cover.svg` → PNG 변환 1장
2. **GIF 1개 (권장)**: `docs/launch/recording-storyboard.md` 참고. Kap 으로 녹화 → ffmpeg 변환
3. **이미지 캐러셀 3~5장**: 상태별 스크린샷 (빈 상태 / 파일트리+최근문서 / 필터 활성 / 문서 뷰어 + drift 배지)

LinkedIn 은 GIF 가 피드에서 자동재생되어 머무름 시간 확보에 유리.

## 해시태그 셋

**핵심 (포스트당 3~5개)**: `#ClaudeCode #AI개발자도구 #Markdown #오픈소스 #macOS`
**영어 연결**: `#DeveloperTools #Electron #AI #OpenSource`
**부가 (상황에 맞게)**: `#VibeCoding #Codex #Cursor #프로덕트해커 #사이드프로젝트`
