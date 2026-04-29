# macOS 설치 가이드 — v0.4.0-beta.4

> [English](./install-macos.en.md) · **한국어**

Markwand 는 Apple 코드사이닝·공증 미적용 베타 빌드입니다. **ad-hoc 서명** 이 적용되어 있어 터미널 명령 없이 우클릭 → 열기 로 실행할 수 있습니다.

> 이 버전은 **베타** 입니다. 릴리스 노트: [release-notes/v0.4.0-beta.4.md](./release-notes/v0.4.0-beta.4.md)

---

## 1. DMG 다운로드

본인 Mac 기종에 맞는 파일을 받으세요.

- **Apple Silicon (M1/M2/M3/M4)**: `Markwand-0.4.0-beta.4-arm64.dmg`
- **Intel Mac**: `Markwand-0.4.0-beta.4.dmg`

## 2. SHA256 무결성 확인 (선택)

다운로드한 파일이 변조되지 않았는지 터미널에서 확인할 수 있습니다.

```bash
shasum -a 256 ~/Downloads/Markwand-0.4.0-beta.4-arm64.dmg
# 또는
shasum -a 256 ~/Downloads/Markwand-0.4.0-beta.4.dmg
```

예상 해시 (2026-04-29 빌드):

```
a657927ac82bf2e41fc7d32dcb315750f9d5545dbca9cf920413270ca909955e  Markwand-0.4.0-beta.4-arm64.dmg
b5d4bdec2c91deb2314c37e12ae5306958fe4572d6075e66db957bd851025bd4  Markwand-0.4.0-beta.4.dmg
```

## 3. DMG 마운트 + Applications 로 드래그

1. 다운로드한 DMG 를 더블클릭하면 창이 뜹니다.
2. **Markwand 아이콘을 Applications 폴더 아이콘 위로 드래그** 합니다.

## 4. 첫 실행 (중요 — macOS 버전에 따라 경로가 다릅니다)

### macOS Sequoia (15+) / Tahoe (26+) — 시스템 설정 경유

이 버전부터는 "우클릭 → 열기" 경로가 막혀 **시스템 설정 허용** 이 유일한 경로입니다.

1. Applications → **Markwand** 더블클릭
2. "Apple은 'Markwand.app' 에… 악성 코드가 없음을 확인할 수 없습니다" 경고가 뜨면 **완료** 클릭 (닫기)
3. 시스템 설정 열기 — 아래 **3가지 중 아무거나**:
   - (권장) 방금 마운트된 DMG 창에 있는 **`여기를 먼저 더블클릭.html`** 을 더블클릭 → Safari 가 열리며 안내 페이지 → 자동으로 시스템 설정 이동
   - 이 문서를 브라우저에서 보는 중이라면 👉 **[시스템 설정 → 개인정보 보호 및 보안 열기](x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension)** 링크 클릭
   - 수동: Spotlight ⌘Space → "개인정보 보호" 검색 → 시스템 설정 앱
4. 아래로 스크롤하면 **"'Markwand.app' 이(가) 차단되었습니다…"** 문구 옆 **그래도 열기** 버튼이 있습니다 → 클릭
5. macOS 암호 또는 Touch ID 입력
6. Applications → Markwand 다시 더블클릭 → **"정말 여시겠습니까?"** 확인창에서 **열기** 클릭

한 번만 거치면 이후부터는 더블클릭으로 바로 실행됩니다.

### macOS Sonoma 이하 (14 / 13 / 12) — 우클릭 → 열기

1. Applications → **Markwand** 를 **우클릭** (또는 Control+클릭)
2. 메뉴에서 **열기** 선택
3. 팝업 경고창에서 다시 **열기** 클릭

### 본인 macOS 버전 확인

```bash
sw_vers -productVersion
```

`15.x` 이면 Sequoia 경로, `14.x` 이하이면 우클릭 경로를 따르세요.

---

## 문제 해결

### "손상되었기 때문에 열 수 없습니다" 가 뜨면 (드문 케이스)

최신 macOS 가 quarantine 플래그를 엄격히 적용한 경우입니다. 터미널에서:

```bash
xattr -cr /Applications/Markwand.app
open /Applications/Markwand.app
```

### DMG 자체가 열리지 않는 경우

```bash
xattr -dr com.apple.quarantine ~/Downloads/Markwand-0.4.0-beta.4*.dmg
```

다시 더블클릭하면 마운트됩니다.

---

## DMG 언마운트 (선택)

설치 후 Finder 사이드바의 `Markwand` 옆 ⏏ 아이콘 클릭, 또는:

```bash
hdiutil detach "/Volumes/Markwand 0.3.0-beta.2-arm64"
```
