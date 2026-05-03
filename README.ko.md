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

# macOS 무료 ZIP 빌드
pnpm dist:mac
```

## macOS 설치 (무료 ZIP)

현재 베타는 Apple Developer Program 없이 배포되는 ad-hoc signed ZIP 입니다.
완전한 공증 앱처럼 더블클릭 한 번으로 끝나지는 않지만, 일반 경로는 Terminal 없이 설치할 수 있습니다.

1. [GitHub Releases](https://github.com/givepro91/markwand/releases)에서 내 Mac에 맞는 `*-free.zip`을 받습니다.
2. ZIP을 더블클릭해 압축을 풉니다.
3. **Markwand.app**을 Applications 폴더로 드래그합니다.
4. Applications에서 **Markwand.app**을 우클릭 또는 Control+클릭 → **열기**를 한 번 실행합니다.

최신 macOS에서 우클릭 열기로도 "휴지통으로 이동 / 완료"만 보이면 아래 fallback을 한 번 실행하세요.

```bash
xattr -cr /Applications/Markwand.app
open /Applications/Markwand.app
```

자세한 설치/무결성 확인은 [상세 가이드](docs/install-macos.md)를 참고하세요.

## 요구사항

- macOS (Apple Silicon / Intel 모두 지원)
- Node.js 18+
- pnpm 8+
