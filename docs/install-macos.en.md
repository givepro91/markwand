# macOS Installation Guide — v0.4.0-beta.6

> **English** · [한국어](./install-macos.md)

Markwand is distributed as a **free beta ZIP** without the Apple Developer Program. The app is ad-hoc signed, so it still shows a macOS warning on first launch, but installation does not require Terminal for the normal path.

> Release notes: [release-notes/v0.4.0-beta.6.md](./release-notes/v0.4.0-beta.6.md)

---

## 1. Download the ZIP

Choose the file for your Mac:

- **Apple Silicon (M1 / M2 / M3 / M4)**: `Markwand-0.4.0-beta.6-arm64-free.zip`
- **Intel Mac**: `Markwand-0.4.0-beta.6-x64-free.zip`

Latest release: https://github.com/givepro91/markwand/releases

## 2. Verify SHA-256 (optional)

```bash
shasum -a 256 ~/Downloads/Markwand-0.4.0-beta.6-arm64-free.zip
# or
shasum -a 256 ~/Downloads/Markwand-0.4.0-beta.6-x64-free.zip
```

Expected hashes:

```text
8af452461ad818163ca3ebff9a62a4c3800650aab01e96b123b69a980156be27  Markwand-0.4.0-beta.6-arm64-free.zip
fc01630535457b989c9e4df681e32be0e8a6252ef4858d2a8847c85f4c50c154  Markwand-0.4.0-beta.6-x64-free.zip
```

## 3. Unzip and move to Applications

1. Double-click the downloaded ZIP.
2. Open the `Markwand Free Install` folder.
3. Drag **Markwand.app** into Applications.

## 4. First launch

1. In Applications, right-click or Control-click **Markwand.app**.
2. Choose **Open**.
3. Click **Open** again in the macOS warning dialog.

After this one-time step, normal double-click launch should work.

## 5. If you get stuck

The ZIP includes `First Run Guide.html`. Open it if the first-launch flow is unclear.

If macOS says the app is damaged, quarantine was applied aggressively. Use Terminal only for this fallback:

```bash
xattr -cr /Applications/Markwand.app
open /Applications/Markwand.app
```

---

## Note

A fully smooth double-click installer requires Apple Developer Program membership, Developer ID signing, and notarization. beta.6 intentionally prioritizes the shortest free distribution path.
