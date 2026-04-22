# macOS 설치 가이드 (unsigned dmg) — v0.3.0-beta.1

Markwand는 현재 Apple 코드사이닝 미적용 빌드입니다.
아래 절차대로 진행하면 Gatekeeper 차단 없이 실행할 수 있습니다.

> 이 버전은 **베타** 입니다. 원격 SSH 서버 지원이 포함됐으며, 예상치 못한 동작이 있을 수 있습니다.
> 릴리스 노트: [release-notes/v0.3.0-beta.1.md](./release-notes/v0.3.0-beta.1.md)

---

## 0. SHA256 무결성 확인

다운로드한 dmg 파일이 변조되지 않았는지 확인합니다. Apple Silicon(M1/M2/M3) 은 `arm64`, Intel Mac 은 `x64` 파일을 받으세요.

```bash
# Apple Silicon
shasum -a 256 ~/Downloads/Markwand-0.3.0-beta.1-arm64.dmg

# Intel
shasum -a 256 ~/Downloads/Markwand-0.3.0-beta.1.dmg
```

예상 해시 (2026-04-22 빌드):
```
39c19fc6973867f2797c94713cdc769c7e28b50938cc22f0be899ed02e983dc8  Markwand-0.3.0-beta.1-arm64.dmg
8206eea58ad546c9a8ef444be0fa009dac2a9445262d36773afc4e2281ad12cc  Markwand-0.3.0-beta.1.dmg
```

출력값이 위와 일치하면 안전한 파일입니다.

---

## 1. dmg 마운트

Finder에서 `Markwand-*.dmg`를 더블클릭하거나 터미널에서 마운트합니다.

```bash
hdiutil attach ~/Downloads/Markwand-*.dmg
```

> <!-- 스크린샷: dmg 마운트 후 Finder 창에 Markwand 아이콘과 Applications 폴더 별칭이 표시된 모습 -->

---

## 2. /Applications 복사

dmg 창에서 `Markwand.app`을 `Applications` 폴더로 드래그하거나 터미널에서 복사합니다.

```bash
cp -R /Volumes/Markwand/Markwand.app /Applications/
```

> <!-- 스크린샷: /Applications/Markwand.app 복사 완료 모습 -->

---

## 3. quarantine 속성 제거

macOS는 인터넷에서 내려받은 앱에 quarantine 플래그를 붙입니다.
아래 명령으로 플래그를 재귀적으로 제거합니다.

```bash
xattr -dr com.apple.quarantine /Applications/Markwand.app
```

명령이 성공하면 출력 없이 프롬프트로 돌아옵니다.
제거 여부를 확인하려면:

```bash
xattr /Applications/Markwand.app
# quarantine 줄이 없으면 정상
```

> <!-- 스크린샷: 터미널에서 xattr -dr 실행 후 빈 출력 확인 모습 -->

---

## 4. 실행 확인

```bash
open /Applications/Markwand.app
```

또는 Finder → Applications → `Markwand` 더블클릭.

Gatekeeper 경고 없이 앱이 바로 열리면 설치 완료입니다.

> <!-- 스크린샷: Markwand 메인 화면 첫 실행 모습 -->

---

## 문제 해결

### "개발자를 확인할 수 없습니다" 경고가 계속 나올 때

xattr 명령이 정상 완료됐는지 확인하고, quarantine 줄이 남아있으면 다시 실행합니다.

```bash
xattr -l /Applications/Markwand.app | grep quarantine
# 출력이 없어야 함
```

### 우클릭으로 열기 (터미널 사용 불가 시 대안)

1. Finder에서 `/Applications/Markwand.app` 우클릭
2. **열기** 선택
3. 경고 팝업에서 **그래도 열기** 클릭

이 방법은 해당 실행에만 적용되므로, 이후에도 같은 경고가 나올 수 있습니다.
영구 해제는 `xattr -dr` 방법을 권장합니다.

---

## dmg 언마운트 (선택)

```bash
hdiutil detach /Volumes/Markwand
```
