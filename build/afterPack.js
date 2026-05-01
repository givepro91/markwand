// electron-builder afterPack hook — 무료 배포/로컬 테스트 빌드에서 앱을 ad-hoc 서명한다.
//
// 왜 필요한가:
//   무료 배포용 `dist:mac:free` 는 Apple Developer Program 없이 만들 수 있어야 한다.
//   이때 완전한 Gatekeeper 신뢰는 불가능하지만, ad-hoc 서명으로 앱 identifier 를 고정하면
//   "손상된 앱" 류의 더 나쁜 실패를 줄이고 첫 실행을 Control-click > Open 흐름으로 안내할 수 있다.
//
//   ad-hoc 서명 (codesign --sign -)은 무료이며, 앱 identifier 를 고유 값으로 고정해
//   공증 릴리스(`dist:mac:release`)에서는 MARKWAND_ADHOC_SIGN 을 설정하지 않아
//   Developer ID 서명을 덮어쓰지 않는다.

const { execSync } = require('node:child_process')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (process.env.MARKWAND_ADHOC_SIGN !== '1') {
    console.log('[afterPack] skip ad-hoc signing')
    return
  }

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
