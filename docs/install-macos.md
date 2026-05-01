# macOS 설치 가이드 — v0.4.0-beta.6

> [English](./install-macos.en.md) · **한국어**

Markwand 는 Apple Developer Program 없이 배포되는 **무료 베타 ZIP** 입니다. 앱은 ad-hoc 서명되어 있으며, 완전한 공증 앱처럼 더블클릭 한 번으로 끝나지는 않지만 터미널 없이 설치할 수 있게 구성했습니다.

> 릴리스 노트: [release-notes/v0.4.0-beta.6.md](./release-notes/v0.4.0-beta.6.md)

---

## 1. ZIP 다운로드

본인 Mac 기종에 맞는 파일을 받으세요.

- **Apple Silicon (M1/M2/M3/M4)**: `Markwand-0.4.0-beta.6-arm64-free.zip`
- **Intel Mac**: `Markwand-0.4.0-beta.6-x64-free.zip`

최신 릴리스: https://github.com/givepro91/markwand/releases

## 2. SHA256 무결성 확인 (선택)

```bash
shasum -a 256 ~/Downloads/Markwand-0.4.0-beta.6-arm64-free.zip
# 또는
shasum -a 256 ~/Downloads/Markwand-0.4.0-beta.6-x64-free.zip
```

예상 해시:

```text
8af452461ad818163ca3ebff9a62a4c3800650aab01e96b123b69a980156be27  Markwand-0.4.0-beta.6-arm64-free.zip
fc01630535457b989c9e4df681e32be0e8a6252ef4858d2a8847c85f4c50c154  Markwand-0.4.0-beta.6-x64-free.zip
```

## 3. 압축 해제 + Applications 로 이동

1. 다운로드한 ZIP 을 더블클릭합니다.
2. `Markwand Free Install` 폴더가 생깁니다.
3. 그 안의 **Markwand.app** 을 Applications 폴더로 드래그합니다.

## 4. 첫 실행

1. Applications 폴더에서 **Markwand.app** 을 우클릭 또는 Control+클릭합니다.
2. 메뉴에서 **열기** 를 선택합니다.
3. macOS 경고창에서 다시 **열기** 를 누릅니다.

한 번만 거치면 이후부터는 더블클릭으로 실행됩니다.

## 5. 막힐 때

ZIP 안에는 `First Run Guide.html` 이 함께 들어 있습니다. 위 절차가 막히면 이 파일을 더블클릭해 설치 안내를 확인하세요.

그래도 "손상되었기 때문에 열 수 없습니다" 가 뜨면 quarantine 플래그가 강하게 남은 경우입니다. 이때만 터미널에서:

```bash
xattr -cr /Applications/Markwand.app
open /Applications/Markwand.app
```

---

## 참고

완전히 매끄러운 더블클릭 설치는 Apple Developer Program 가입 후 Developer ID 서명 + 공증이 필요합니다. 현재 beta.6은 비용 없이 가장 짧은 설치 경로를 우선한 무료 배포판입니다.
