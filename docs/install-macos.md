# macOS 설치 가이드 — v0.4.0-beta.7

> [English](./install-macos.en.md) · **한국어**

Markwand 는 Apple Developer Program 없이 배포되는 **무료 베타 ZIP** 입니다. 앱은 ad-hoc 서명되어 있으며, 완전한 공증 앱처럼 더블클릭 한 번으로 끝나지는 않지만 터미널 없이 설치할 수 있게 구성했습니다.

> 릴리스 노트: [release-notes/v0.4.0-beta.7.md](./release-notes/v0.4.0-beta.7.md)

---

## 1. ZIP 다운로드

본인 Mac 기종에 맞는 파일을 받으세요.

- **Apple Silicon (M1/M2/M3/M4)**: `Markwand-0.4.0-beta.7-arm64-free.zip`
- **Intel Mac**: `Markwand-0.4.0-beta.7-x64-free.zip`

최신 릴리스: https://github.com/givepro91/markwand/releases

## 2. SHA256 무결성 확인 (선택)

```bash
shasum -a 256 ~/Downloads/Markwand-0.4.0-beta.7-arm64-free.zip
# 또는
shasum -a 256 ~/Downloads/Markwand-0.4.0-beta.7-x64-free.zip
```

예상 해시:

```text
dbbcc2be96340d9b53d4bf8081872d45b217631896de850c389a1a719a0c9bde  Markwand-0.4.0-beta.7-arm64-free.zip
8c04d24c12f2c23dd4106605642b90bb3e671e03bc6adda38145d00bd4b1a92d  Markwand-0.4.0-beta.7-x64-free.zip
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

최신 macOS에서는 우클릭 → 열기로도 **휴지통으로 이동 / 완료**만 보이는 경우가 있습니다. 이때는 ZIP 안의 `Open Markwand.command`를 더블클릭하세요. Terminal 창이 잠깐 열리며 quarantine 플래그를 제거하고 Markwand를 실행합니다.

직접 명령으로 처리하려면:

```bash
xattr -cr /Applications/Markwand.app
open /Applications/Markwand.app
```

---

## 참고

완전히 매끄러운 더블클릭 설치는 Apple Developer Program 가입 후 Developer ID 서명 + 공증이 필요합니다. 현재 beta.6은 비용 없이 가장 짧은 설치 경로를 우선한 무료 배포판입니다.
