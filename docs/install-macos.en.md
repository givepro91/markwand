# macOS Installation Guide — v0.4.0-beta.4

> [English](./install-macos.en.md) · [한국어](./install-macos.md)

Markwand is currently distributed as a **beta DMG without Apple code-signing or notarization**. Builds are **ad-hoc signed**, so you can open them without touching the terminal.

> Release notes: [release-notes/v0.4.0-beta.4.md](./release-notes/v0.4.0-beta.4.md)

---

## 1. Download the DMG

Grab the file that matches your Mac:

- **Apple Silicon (M1 / M2 / M3 / M4)**: `Markwand-0.4.0-beta.4-arm64.dmg`
- **Intel Mac**: `Markwand-0.4.0-beta.4.dmg`

Latest release → https://github.com/givepro91/markwand/releases

## 2. Verify SHA-256 (optional but recommended)

```bash
shasum -a 256 ~/Downloads/Markwand-0.4.0-beta.4-arm64.dmg
# or
shasum -a 256 ~/Downloads/Markwand-0.4.0-beta.4.dmg
```

Expected hashes (2026-04-29 build):

```
a657927ac82bf2e41fc7d32dcb315750f9d5545dbca9cf920413270ca909955e  Markwand-0.4.0-beta.4-arm64.dmg
b5d4bdec2c91deb2314c37e12ae5306958fe4572d6075e66db957bd851025bd4  Markwand-0.4.0-beta.4.dmg
```

## 3. Mount the DMG and drag into Applications

1. Double-click the downloaded DMG — a window will open.
2. **Drag the Markwand icon onto the Applications folder icon.**

## 4. First launch (path depends on your macOS version)

### macOS Sequoia (15+) / Tahoe (26+) — via System Settings

On these versions, the right-click → Open trick is gone. You must **allow the app from System Settings**:

1. Open Applications → double-click **Markwand**
2. You'll see *"Apple could not verify 'Markwand.app' is free of malware…"* — click **Done** (close)
3. Open System Settings — pick any of:
   - (recommended) Double-click **`여기를 먼저 더블클릭.html`** in the mounted DMG window → Safari opens a helper page that deep-links into System Settings
   - If you're reading this in a browser: 👉 **[Open System Settings → Privacy & Security](x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension)**
   - Manually: Spotlight (⌘Space) → search "Privacy & Security" → System Settings
4. Scroll down until you see **"'Markwand.app' was blocked…"** — click the **Open Anyway** button
5. Enter your macOS password or use Touch ID
6. Go back to Applications → double-click **Markwand** → click **Open** on the final confirmation

One-time ceremony. After this, double-click launches it normally.

### macOS Sonoma and earlier (14 / 13 / 12) — right-click → Open

1. Go to Applications and **right-click** (or Control-click) **Markwand**
2. Select **Open**
3. In the popup, click **Open** again

### Check your macOS version

```bash
sw_vers -productVersion
```

`15.x` → Sequoia path. `14.x` or earlier → right-click path.

---

## Troubleshooting

### "The application is damaged and can't be opened" (rare)

Recent macOS versions apply quarantine very aggressively. In Terminal:

```bash
xattr -cr /Applications/Markwand.app
open /Applications/Markwand.app
```

### The DMG itself won't open

```bash
xattr -dr com.apple.quarantine ~/Downloads/Markwand-0.4.0-beta.4*.dmg
```

Then double-click again to mount.

---

## Unmounting the DMG (optional)

Click the ⏏ icon next to `Markwand` in the Finder sidebar, or:

```bash
hdiutil detach "/Volumes/Markwand 0.3.0-beta.2-arm64"
```
