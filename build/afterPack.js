// electron-builder afterPack hook — 패키징 이후 DMG 생성 이전에 앱을 ad-hoc 서명한다.
//
// 왜 필요한가:
//   electron-builder 는 `identity: null` 일 때 코드사이닝을 아예 건너뛴다. 그러면 Electron
//   바이너리의 기본 `linker-signed` 서명만 남는데, Identifier 가 `Electron` 인 채로 배포되어
//   macOS Sequoia(15+) Gatekeeper 가 "손상된 앱" 으로 취급할 여지가 생긴다.
//
//   ad-hoc 서명 ( codesign --sign - )은 무료이며, 앱 identifier 를 고유 값으로 고정해
//   "확인되지 않은 개발자" 경고(우클릭→열기로 통과 가능) 까지는 완화해준다. 공증은 생략.

const { execSync } = require('node:child_process')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`
  const identifier = context.packager.appInfo.id // tech.spacewalk.markwand
  console.log(`[afterPack] ad-hoc signing ${appPath} (identifier=${identifier})`)
  try {
    execSync(
      `codesign --force --deep --sign - --identifier "${identifier}" "${appPath}"`,
      { stdio: 'inherit' },
    )
  } catch (err) {
    console.warn(`[afterPack] codesign failed (계속 진행):`, err?.message)
  }
}
