# Nova State

## Current
- **Goal**: v0.4.0-beta.10 quit/CPU hotfix 완료, GitHub Release 생성 대기.
- **Phase**: **release-blocked** — code/artifacts/local smoke PASS, GitHub Release API는 `givepro91` 계정 `workflow` scope 갱신 필요.
- **Blocker**: `gh release create` 실패: active `jay-swk` has `workflow` scope but no repo push/release permission; `givepro91` has repo permission but lacks `workflow` scope.
- **Last Activity**: v0.4.0-beta.10 로컬 설치 smoke PASS — startup watcher default-off, forced dev env ignored, 7s running quit 398ms, no Markwand orphan process (2026-05-01).
- **Remote**: `origin/main` = `1115ef4` before beta.10 commit; tag/release `v0.4.0-beta.10` pending.

## Recently Done
1. v0.4.0-beta.10 — quit/CPU hotfix. Startup file watcher default-off (`MARKWAND_ENABLE_STARTUP_WATCH=1` opt-in), quit hides windows immediately, cleanup watchdog 500ms, startup watcher timer cancelled on quit.
2. v0.4.0-beta.9 — packaged app no longer honors dev-only renderer/debug env vars. Added `runtimeMode` unit tests.
3. v0.4.0-beta.8 — removed `.command` helper and corrected unsigned free-install docs to Terminal `xattr -cr` fallback.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.10-arm64-free.zip` | `291e8f4bc58cec6c1ce4886efa9f37585fdf24d3e8144a434540181c49ba726d` |
| `dist/Markwand-0.4.0-beta.10-x64-free.zip` | `1d01f4dd179216746f79ec3d7060666f7fa31504d5e48a1f6f616ce8b6e19022` |

## Next
1. Refresh GitHub CLI auth for `givepro91`: `gh auth switch -u givepro91 && gh auth refresh -h github.com -s workflow`.
2. Commit/push beta.10 hotfix and create tag `v0.4.0-beta.10`.
3. Create prerelease: `gh release create v0.4.0-beta.10 dist/Markwand-0.4.0-beta.10-arm64-free.zip dist/Markwand-0.4.0-beta.10-x64-free.zip --repo givepro91/markwand --title "v0.4.0-beta.10 — faster quit guard" --notes-file docs/release-notes/v0.4.0-beta.10.md --prerelease --verify-tag`.
4. Mark v0.4.0-beta.8/v0.4.0-beta.9 deprecated after beta.10 release is visible.

## Open Product Work
- UX/UI polish and QA hardening remain active goals after the release blocker is cleared.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
