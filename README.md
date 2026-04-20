# md-viewer

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

## macOS Gatekeeper 우회 (첫 실행)

코드사이닝이 없는 unsigned 빌드이므로 첫 실행 시 Gatekeeper가 차단할 수 있다.

**방법 1 — 우클릭 열기**
1. Finder에서 md-viewer.app 우클릭
2. "열기" 선택
3. "그래도 열기" 클릭

**방법 2 — 터미널 quarantine 제거**
```bash
xattr -d com.apple.quarantine "/Applications/md-viewer.app"
```

## 요구사항

- macOS (Apple Silicon / Intel 모두 지원)
- Node.js 18+
- pnpm 8+
