# macOS 설치 가이드 — v0.4.0-beta.10

> [English](./install-macos.en.md) · **한국어**

Markwand 는 Apple Developer Program 없이 배포되는 **무료 베타 ZIP** 입니다. 앱은 ad-hoc 서명되어 있으며, 완전한 공증 앱처럼 더블클릭 한 번으로 끝나지는 않지만 터미널 없이 설치할 수 있게 구성했습니다.

> 릴리스 노트: [release-notes/v0.4.0-beta.11.md](./release-notes/v0.4.0-beta.11.md)

---

## 1. ZIP 다운로드

본인 Mac 기종에 맞는 파일을 받으세요.

- **Apple Silicon (M1/M2/M3/M4)**: `Markwand-0.4.0-beta.10-arm64-free.zip`
- **Intel Mac**: `Markwand-0.4.0-beta.10-x64-free.zip`

최신 릴리스: https://github.com/givepro91/markwand/releases

## 2. SHA256 무결성 확인 (선택)

```bash
shasum -a 256 ~/Downloads/Markwand-0.4.0-beta.10-arm64-free.zip
# 또는
shasum -a 256 ~/Downloads/Markwand-0.4.0-beta.10-x64-free.zip
```

예상 해시:

```text
291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d  Markwand-0.4.0-beta.10-arm64-free.zip
1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022  Markwand-0.4.0-beta.10-x64-free.zip
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

## 5. "열지 않음" 창이 계속 뜰 때

최신 macOS에서는 우클릭 → 열기로도 **휴지통으로 이동 / 완료**만 보이는 경우가 있습니다. 이 경우 무료 배포판에서 검증된 fallback은 Terminal 한 줄입니다.

Terminal 앱을 열고 아래 명령을 한 번 실행하세요.

```bash
xattr -cr /Applications/Markwand.app
open /Applications/Markwand.app
```

---

## 참고

완전히 매끄러운 더블클릭 설치는 Apple Developer Program 가입 후 Developer ID 서명 + 공증이 필요합니다. 현재 beta.10은 비용 없이 가능한 경로를 정직하게 안내하는 무료 배포판입니다.
