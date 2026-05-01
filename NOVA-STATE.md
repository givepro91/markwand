# Nova State

## Current
- **Goal**: v0.4.0-beta.10 quit/CPU hotfix 공개 완료.
- **Phase**: **released** — code/tag/artifacts/local smoke/GitHub prerelease PASS.
- **Blocker**: none
- **Last Activity**: v0.4.0-beta.10 GitHub Release 공개 — arm64/x64 ZIP 업로드, beta.8 deprecated title 정리, local quit smoke PASS (2026-05-01).
- **Remote**: `origin/main` = `21c0f9e`; tag `v0.4.0-beta.10` = `deacb77`; Release: https://github.com/givepro91/markwand/releases/tag/v0.4.0-beta.10

## Recently Done
1. v0.4.0-beta.10 — quit/CPU hotfix. Startup file watcher default-off (`MARKWAND_ENABLE_STARTUP_WATCH=1` opt-in), quit hides windows immediately, cleanup watchdog 500ms, startup watcher timer cancelled on quit.
2. v0.4.0-beta.9 — packaged app no longer honors dev-only renderer/debug env vars. Added `runtimeMode` unit tests.
3. v0.4.0-beta.8 — removed `.command` helper and corrected unsigned free-install docs to Terminal `xattr -cr` fallback.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.10-arm64-free.zip` | `291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d` |
| `dist/Markwand-0.4.0-beta.10-x64-free.zip` | `1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022` |

## Open Product Work
- UX/UI polish and QA hardening remain active goals after the release blocker is cleared.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
