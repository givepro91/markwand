# macOS Distribution

Markwand currently defaults to free macOS ZIP archives that do not require the Apple Developer Program. They cannot fully remove Gatekeeper warnings, but they keep installation to the shortest free path: unzip, drag to Applications, then first launch via Control-click > Open.

For a fully smooth double-click install, ship a Developer ID-signed and notarized DMG later.

## Free Distribution Path

Run:

```bash
pnpm dist:mac
```

This aliases to `pnpm dist:mac:free` and builds ad-hoc signed ZIP files:

- `dist/Markwand-<version>-arm64-free.zip`
- `dist/Markwand-<version>-x64-free.zip`

Expected first-launch user flow:

1. Unzip the archive for the user's Mac.
2. Drag `Markwand.app` to Applications.
3. In Applications, Control-click or right-click `Markwand`.
4. Choose `Open`.
5. Confirm `Open` once.
6. If macOS still shows only `Move to Trash` / `Done`, use the documented Terminal fallback:
   `xattr -cr /Applications/Markwand.app && open /Applications/Markwand.app`.

This avoids telling users to manually find Privacy & Security settings. It still shows a macOS warning because the app is not notarized.

## Free Build Notes

- `CSC_IDENTITY_AUTO_DISCOVERY=false` prevents accidental local certificate signing.
- `MARKWAND_ADHOC_SIGN=1` enables the `build/afterPack.js` ad-hoc signing hook.
- `mac.hardenedRuntime` and `mac.notarize` are disabled by default because notarization is not available without Apple Developer Program credentials.
- The ZIP includes `First Run Guide.html` with first-run instructions. The source file is `build/처음 실행 안내.html`.
- Do not ship `.command`, `.app` helper, or Automator helper fallbacks in the free path unless they are tested by Finder double-click after browser-style quarantine. They can be blocked by the same Gatekeeper check.

## Paid Release Path

1. Join the Apple Developer Program and create a `Developer ID Application` certificate.
2. Configure notarization credentials in CI or the local release keychain.
3. Run `pnpm dist:mac:release`.
4. Verify Gatekeeper on a clean Mac:
   - Download the DMG from the same channel users will use.
   - Drag `Markwand.app` into Applications.
   - Launch by double-clicking. It should not require Privacy & Security approval.
   - Run `spctl -a -vv /Applications/Markwand.app` and confirm the app is accepted.

## Required Environment

Use Apple API key credentials when possible:

```bash
export APPLE_API_KEY=/absolute/path/AuthKey_XXXXXXXXXX.p8
export APPLE_API_KEY_ID=XXXXXXXXXX
export APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

The electron-builder notarization integration also supports Apple ID credentials:

```bash
export APPLE_ID=release@example.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=XXXXXXXXXX
```

Code-signing identity can be provided through the macOS keychain or electron-builder variables:

```bash
export CSC_LINK=/absolute/path/developer-id-application.p12
export CSC_KEY_PASSWORD=...
```

## Local Unsigned Build

This alias is kept for compatibility:

```bash
pnpm dist:mac:unsigned
```

It currently points to the same free ad-hoc ZIP path as `pnpm dist:mac:free`.

## Current Config Intent

- `dist:mac` points to `dist:mac:free` until the project is ready to pay for Apple Developer Program.
- `dist:mac:free` uses `electron-builder --dir` plus `scripts/package-mac-free.mjs` to avoid DMG `hdiutil` fragility in the free path.
- `dist:mac:release` keeps the future Developer ID + notarization path.
- `mac.hardenedRuntime` is disabled in the free path and enabled by CLI override in the release path.
- `build/entitlements.mac.plist` keeps the runtime exceptions Electron needs.
- The old DMG "open Privacy & Security first" helper is not used.
- `build/afterPack.js` ad-hoc signs only when `MARKWAND_ADHOC_SIGN=1`, so paid release signing is not overwritten.

## References

- Apple: Notarizing macOS software before distribution — https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
- Apple: Signing Mac Software with Developer ID — https://developer.apple.com/developer-id/
- electron-builder: macOS code signing — https://www.electron.build/code-signing-mac.html
- electron-builder: MacConfiguration notarize/identity — https://www.electron.build/electron-builder.Interface.MacConfiguration.html
