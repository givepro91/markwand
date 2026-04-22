# macOS 설치 가이드 — v0.3.0-beta.2

Markwand 는 Apple 코드사이닝·공증 미적용 베타 빌드입니다. **ad-hoc 서명** 이 적용되어 있어 터미널 명령 없이 우클릭 → 열기 로 실행할 수 있습니다.

> 이 버전은 **베타** 입니다. 릴리스 노트: [release-notes/v0.3.0-beta.2.md](./release-notes/v0.3.0-beta.2.md)

---

## 1. DMG 다운로드

본인 Mac 기종에 맞는 파일을 받으세요.

- **Apple Silicon (M1/M2/M3/M4)**: `Markwand-0.3.0-beta.2-arm64.dmg`
- **Intel Mac**: `Markwand-0.3.0-beta.2.dmg`

## 2. SHA256 무결성 확인 (선택)

다운로드한 파일이 변조되지 않았는지 터미널에서 확인할 수 있습니다.

```bash
shasum -a 256 ~/Downloads/Markwand-0.3.0-beta.2-arm64.dmg
# 또는
shasum -a 256 ~/Downloads/Markwand-0.3.0-beta.2.dmg
```

예상 해시 (2026-04-22 빌드):

```
4a616f3bc00c460467fea8d4015da36c2c9756cfe195c80d1439aca100034151  Markwand-0.3.0-beta.2-arm64.dmg
8a046629b8a563ea78994209a994054c63c7f446aaa9a7f157493c3c2011d624  Markwand-0.3.0-beta.2.dmg
```

## 3. DMG 마운트 + Applications 로 드래그

1. 다운로드한 DMG 를 더블클릭하면 창이 뜹니다.
2. **Markwand 아이콘을 Applications 폴더 아이콘 위로 드래그** 합니다.

## 4. 첫 실행 (중요)

### 방법 A — 우클릭 → 열기 (권장)

1. Finder → Applications → **`Markwand`** 를 **우클릭** (또는 Control+클릭)
2. 메뉴에서 **열기** 선택
3. 팝업 경고창에서 다시 **열기** 클릭

이 절차는 해당 앱 **한 번만** 거치면 되고, 이후부터는 더블클릭으로 바로 실행됩니다.

### 방법 B — 시스템 설정 허용 (A 가 안 될 때)

1. 더블클릭 시 "확인되지 않은 개발자" 경고 팝업이 뜨면 일단 닫습니다.
2. **시스템 설정 → 개인정보 보호 및 보안** 으로 이동.
3. 아래로 스크롤하면 "`Markwand` 이(가) 확인되지 않은 개발자가 배포했기 때문에…" 문구 옆에 **그래도 열기** 버튼이 있습니다. 클릭.
4. 한 번 더 팝업이 뜨면 **열기** 클릭.

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
xattr -dr com.apple.quarantine ~/Downloads/Markwand-0.3.0-beta.2*.dmg
```

다시 더블클릭하면 마운트됩니다.

---

## DMG 언마운트 (선택)

설치 후 Finder 사이드바의 `Markwand` 옆 ⏏ 아이콘 클릭, 또는:

```bash
hdiutil detach "/Volumes/Markwand 0.3.0-beta.2-arm64"
```
