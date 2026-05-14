# macOS Installation Guide — v0.4.0-beta.16

> **English** · [한국어](./install-macos.md)

Markwand is distributed as a **free beta ZIP** without the Apple Developer Program. The app is ad-hoc signed, so it still shows a macOS warning on first launch, but installation does not require Terminal for the normal path.

> Release notes: [release-notes/v0.4.0-beta.16.md](./release-notes/v0.4.0-beta.16.md)

---

## 1. Download the ZIP

Choose the file for your Mac:

- **Apple Silicon (M1 / M2 / M3 / M4)**: `Markwand-0.4.0-beta.16-arm64-free.zip`
- **Intel Mac**: `Markwand-0.4.0-beta.16-x64-free.zip`

Latest release: https://github.com/givepro91/markwand/releases

## 2. Verify SHA-256 (optional)

```bash
shasum -a 256 ~/Downloads/Markwand-0.4.0-beta.16-arm64-free.zip
# or
shasum -a 256 ~/Downloads/Markwand-0.4.0-beta.16-x64-free.zip
```

Expected hashes:

```text
158c1e9f0b92f4093ee0fc7690dc79feff0b1ce23a9c82edd58a111b67dc3d4f  Markwand-0.4.0-beta.16-arm64-free.zip
2e48322d8b6fd5ee33fa2cfce76414c9aa918f31b6c43d4c29e9f36d25c84823  Markwand-0.4.0-beta.16-x64-free.zip
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

## 5. If macOS still refuses to open it

On recent macOS versions, right-click → Open may still show only **Move to Trash / Done**. In the free distribution path, the verified fallback is one Terminal command.

Open Terminal and run:

```bash
xattr -cr /Applications/Markwand.app
open /Applications/Markwand.app
```

---

## Note

A fully smooth double-click installer requires Apple Developer Program membership, Developer ID signing, and notarization. beta.16 intentionally prioritizes the shortest free distribution path.
