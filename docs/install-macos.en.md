# macOS Installation Guide — v0.4.0-beta.9

> **English** · [한국어](./install-macos.md)

Markwand is distributed as a **free beta ZIP** without the Apple Developer Program. The app is ad-hoc signed, so it still shows a macOS warning on first launch, but installation does not require Terminal for the normal path.

> Release notes: [release-notes/v0.4.0-beta.9.md](./release-notes/v0.4.0-beta.9.md)

---

## 1. Download the ZIP

Choose the file for your Mac:

- **Apple Silicon (M1 / M2 / M3 / M4)**: `Markwand-0.4.0-beta.9-arm64-free.zip`
- **Intel Mac**: `Markwand-0.4.0-beta.9-x64-free.zip`

Latest release: https://github.com/givepro91/markwand/releases

## 2. Verify SHA-256 (optional)

```bash
shasum -a 256 ~/Downloads/Markwand-0.4.0-beta.9-arm64-free.zip
# or
shasum -a 256 ~/Downloads/Markwand-0.4.0-beta.9-x64-free.zip
```

Expected hashes:

```text
ce2f572b96049b3d2bd7652bfad840063e2b334b28217ceedf5f8fbc67bec918  Markwand-0.4.0-beta.9-arm64-free.zip
e4d1650f1c90ef616383d52cb68127b8f58b5318c9768d7cf6c110cd5137a60d  Markwand-0.4.0-beta.9-x64-free.zip
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

A fully smooth double-click installer requires Apple Developer Program membership, Developer ID signing, and notarization. beta.6 intentionally prioritizes the shortest free distribution path.
