# Markwand — 녹화 스토리보드 (LinkedIn 용)

> 목표: **10~14 초 GIF** · 960×600 전후 · < 8 MB (LinkedIn 피드 자동재생 여유)
> 도구: **Kap.app** (무료, 출력 포맷 선택 가능) 또는 **QuickTime Player**
> 변환: ffmpeg 2-pass palette (아래 명령)

## 준비 (보안 체크리스트)

녹화 시작 전 반드시 확인:

- [ ] **워크스페이스 1개만 등록** — markwand repo 자체(`/Users/keunsik/develop/givepro91/markwand`) 만 추가, 다른 업무 폴더 제거
- [ ] **집중 모드(Focus) 켜기** — Slack/메일/메시지 알림 차단
- [ ] **Dock 숨기기** (Cmd+Option+D)
- [ ] **메뉴바에 보이는 업무 앱 아이콘** 확인 — 배경에 걸리면 Kap 영역에서 앱 창만 선택해 제외
- [ ] **데스크톱 바탕화면 정리** — 파일 이름이 보이지 않게 (또는 "스테이지 매니저"로 비우기)
- [ ] **앱 종료 → 깨끗한 상태로 재시작** — 활성 프로젝트 없는 빈 상태부터 시작

## 시나리오 (10초 / 60fps 기준 샷 리스트)

타임라인은 "대략" — Kap 는 컷편집 없이 한 번에 녹화하므로 자연스러운 템포 유지.

| T | 장면 | 조작 | 강조 포인트 |
|---|---|---|---|
| 0.0~1.5s | **빈 상태** | 앱 방금 실행한 상태. "+ 워크스페이스 추가" CTA 노출 | 깨끗한 첫인상 |
| 1.5~3.0s | **폴더 추가** | CTA 클릭 → Finder 열림 → `markwand` 폴더 선택 → 열기 | "한 번에 등록" |
| 3.0~4.5s | **스캔 프로그레스** | 워크스페이스 분석 → 프로젝트 카드 그리드 팝업 (1~2개 카드면 충분) | "빠름" 인상 |
| 4.5~6.5s | **프로젝트 진입** | `markwand` 카드 클릭 → ProjectView 전환 | — |
| 6.5~8.5s | **🌟 최근 7일 문서 패널** | 좌측 사이드바 상단의 "최근 7일 문서" 섹션에 마우스 오버 → 항목 1개 클릭 → 마크다운 렌더 | **신기능 스포트라이트** |
| 8.5~10.0s | **필터 / drift** | FilterBar 에서 "7일" 칩 클릭 → (있다면) drift 배지 hover | "정리된 느낌" |
| 10.0~11.5s | **⌘K 팔레트** (선택) | ⌘K 눌러 커맨드 팔레트 띄움 → 곧바로 ESC 로 닫기 | 속도감 |
| 11.5~12.5s | **로고 정지** | 최종 프레임에서 1초 멈춤 → cover 느낌 | CTA 여운 |

> 🎯 **핵심 비주얼 메시지**: (1) 빠른 등록 (2) 최근 7일 패널 NEW (3) 필터/drift — 이 3개만 남도록 루즈한 장면 생략.

## 녹화 명령 (Kap 기준)

1. **Kap 설치**: `brew install --cask kap` 또는 https://getkap.co
2. **Kap 실행 → 창 영역 선택**:
   - "Window" 탭에서 Markwand 창만 선택 → 다른 앱 배경 포함 방지
   - FPS: **30** (LinkedIn 용량 기준)
3. **녹화 시작** → 스토리보드대로 실행 → **Stop**
4. 출력 포맷:
   - 직접 GIF 출력도 가능하지만 용량 큼
   - **MP4 로 저장한 뒤 ffmpeg 변환**을 권장 (용량/화질 trade-off 세밀 조절)

## ffmpeg 변환 — MP4 → GIF (2-pass palette)

### 표준 설정 (권장: 960 × auto · 10 fps · palette)

```bash
INPUT=recording.mp4
OUTPUT=markwand-demo.gif

# 1-pass: palette 생성
ffmpeg -i "$INPUT" \
  -vf "fps=10,scale=960:-1:flags=lanczos,palettegen=stats_mode=diff" \
  -y palette.png

# 2-pass: palette 적용해 GIF 생성
ffmpeg -i "$INPUT" -i palette.png \
  -lavfi "fps=10,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5" \
  -y "$OUTPUT"

# 용량 확인
ls -lh "$OUTPUT"
```

### 더 가벼운 설정 (용량 우선 — 8 MB 이하 타겟)

```bash
ffmpeg -i "$INPUT" \
  -vf "fps=8,scale=720:-1:flags=lanczos,palettegen=max_colors=128" \
  -y palette.png

ffmpeg -i "$INPUT" -i palette.png \
  -lavfi "fps=8,scale=720:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=sierra2_4a" \
  -y "$OUTPUT"
```

### 더 가볍게 (MP4 로 업로드)

LinkedIn 은 **GIF 보다 MP4(H.264) 가 화질/용량 모두 유리**할 수 있습니다. GIF 자동재생이 꼭 필요하지 않다면:

```bash
ffmpeg -i "$INPUT" \
  -vf "scale=1280:-2:flags=lanczos" \
  -c:v libx264 -pix_fmt yuv420p -crf 23 -preset slow \
  -movflags +faststart -an \
  -y markwand-demo.mp4
```

## Kap 대체 도구 (취향별)

- **QuickTime Player** (기본 설치): 파일 → 새로운 화면 기록 → Option 키 + 마우스로 창 선택. 출력은 .mov
- **Cleanshot X** (유료): 창 감지·커서 시각 효과 자동
- **LICEcap** (무료, 직접 GIF 출력): 퀄리티는 Kap·ffmpeg 조합 대비 떨어지나 one-step

## 체크 — 업로드 전

- [ ] 파일에 실 경로 문자열이 캡처되지 않았는지 (브레드크럼/상태바)
- [ ] 캡션 문자열에 회사 이름 / 내부 코드명 없는지
- [ ] LinkedIn 미리보기로 **썸네일 프레임** 확인 (가장 첫 프레임이 썸네일)
- [ ] 모바일 미리보기에서 글자 가독성 확인 (작은 화면에서 파일명이 보일 정도)

## 녹화 없이 갈 경우

GIF 불가 상황이면 **정적 캐러셀 5장** 권장:
1. 커버 이미지 (`docs/launch/cover.svg` → PNG 변환)
2. 빈 상태 스크린샷
3. 프로젝트 뷰 + 최근 7일 패널 (하이라이트)
4. FilterBar + drift 배지
5. ⌘K 팔레트

LinkedIn 은 이미지 여러 장 업로드 시 자동 캐러셀 레이아웃.

## SVG 커버 → PNG 변환 명령

> ⚠️ 이 저장소 현재 환경에는 `rsvg-convert` / Inkscape 미설치. macOS 내장 `qlmanage` 는 1200×1200 정사각으로 렌더링되고 콘텐츠가 잘려 쓸 수 없었고, ImageMagick 내장 SVG 파서는 한글 font-family 해석에 실패합니다. 아래 셋 중 하나 권장:

### 1) librsvg 설치 (권장, 1분)

```bash
brew install librsvg
rsvg-convert -w 1200 -h 630 docs/launch/cover.svg -o docs/launch/cover.png
```

### 2) macOS Preview → Export as PNG

1. Finder 에서 `docs/launch/cover.svg` 더블클릭 → 미리보기 앱에서 열림
2. File → Export → Format: **PNG**, Resolution: **144 pixels/inch**
3. 저장 — 크기는 SVG 그대로 1200×630 유지됨

### 3) Figma / Canva / Sketch 에서 import

1. 새 파일 → SVG 드래그
2. Export → PNG 2x (2400×1260) · PNG 1x (1200×630)

## 참고 — LinkedIn 미디어 제약

- 이미지: 최대 5 MB · 권장 1200 × 627
- GIF: 최대 ~100 MB · 권장 10 MB 이하 (모바일에서 끊김)
- MP4: 최대 5 GB · 최대 10분 — 사실상 무제한
