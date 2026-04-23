# Markwand

> [English](./README.md) · **한국어**

AI 산출물 큐레이터 — 여러 프로젝트에 산재한 마크다운 문서를 발견·소비·재진입하는 Electron 앱.

## 개발 명령

```bash
# 의존성 설치
pnpm install

# 개발 서버 (HMR)
pnpm dev

# 빌드
pnpm build

# 타입 체크
pnpm typecheck

# 린트
pnpm lint

# macOS unsigned dmg 빌드
pnpm dist:mac
```

## macOS 설치 (unsigned dmg)

코드사이닝이 없는 unsigned 빌드이므로 첫 실행 시 Gatekeeper가 차단됩니다.
아래 4단계로 설치하거나 [상세 가이드](docs/install-macos.md)를 참고하세요.

```bash
# 1. dmg 마운트
hdiutil attach ~/Downloads/Markwand-*.dmg

# 2. /Applications 복사
cp -R /Volumes/Markwand/Markwand.app /Applications/

# 3. quarantine 속성 재귀 제거
xattr -dr com.apple.quarantine /Applications/Markwand.app

# 4. 실행
open /Applications/Markwand.app
```

> 대안: Finder에서 `Markwand.app` 우클릭 → **열기** → **그래도 열기**

## 요구사항

- macOS (Apple Silicon / Intel 모두 지원)
- Node.js 18+
- pnpm 8+
