# Nova State

## Current
- **Goal**: v0.4.0-beta.9 packaged runtime guard 완료, GitHub Release 생성 대기.
- **Phase**: **release-blocked** — code/tag/artifacts/local smoke PASS, GitHub Release API는 `givepro91` 계정 `workflow` scope 갱신 필요.
- **Blocker**: `gh release create` 실패: active `jay-swk` has `workflow` scope but no repo push/release permission; `givepro91` has repo permission but lacks `workflow` scope.
- **Last Activity**: v0.4.0-beta.9 로컬 설치 smoke PASS — forced `ELECTRON_RENDERER_URL`/`MD_VIEWER_DEBUG` ignored in packaged app, app loaded `app.asar`, no Markwand DevTools/chrome-error process, quit left no Markwand process (2026-05-01).
- **Remote**: `origin/main` = `d21561f`; tag `v0.4.0-beta.9` = `b95bc05`; GitHub Release object is not created yet.

## Recently Done
1. v0.4.0-beta.9 — packaged app no longer honors dev-only renderer/debug env vars. Added `runtimeMode` unit tests. QA: `pnpm typecheck` PASS, full `pnpm test` PASS (377), `pnpm dist:mac:free` PASS, `/Applications/Markwand.app` forced-env smoke PASS.
2. v0.4.0-beta.8 — removed `.command` helper and corrected unsigned free-install docs to Terminal `xattr -cr` fallback.
3. v0.4.0-beta.6 — Project Wiki MVP, Knowledge Map/Risk Board/Start Here, refreshed UI/icon, free ZIP packaging.

## Release Artifacts
| Artifact | SHA256 |
|---|---|
| `dist/Markwand-0.4.0-beta.9-arm64-free.zip` | `ce2f572b96049b3d2bd7652bfad840063e2b334b28217ceedf5f8fbc67bec918` |
| `dist/Markwand-0.4.0-beta.9-x64-free.zip` | `e4d1650f1c90ef616383d52cb68127b8f58b5318c9768d7cf6c110cd5137a60d` |

## Next
1. Refresh GitHub CLI auth for `givepro91`: `gh auth switch -u givepro91 && gh auth refresh -h github.com -s workflow`.
2. Create prerelease: `gh release create v0.4.0-beta.9 dist/Markwand-0.4.0-beta.9-arm64-free.zip dist/Markwand-0.4.0-beta.9-x64-free.zip --repo givepro91/markwand --title "v0.4.0-beta.9 — production launch guard" --notes-file docs/release-notes/v0.4.0-beta.9.md --prerelease --verify-tag`.
3. Mark v0.4.0-beta.8 deprecated after beta.9 release is visible.
4. Commit/push this state update after release status is finalized.

## Open Product Work
- UX/UI polish and QA hardening remain active goals after the release blocker is cleared.
- Apple Developer ID notarization remains the cleanest install path, but current goal is free distribution without paid Developer Program.
