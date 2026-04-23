<div align="center">

# Markwand

**An AI-output curator for your desktop — discover, read, and re-enter the markdown docs scattered across your AI-driven projects.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey.svg)](#installation-macos)
[![Electron](https://img.shields.io/badge/Electron-33-47848f.svg)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg)](https://www.typescriptlang.org/)
[![Latest Release](https://img.shields.io/github/v/release/givepro91/markwand?include_prereleases&label=release)](https://github.com/givepro91/markwand/releases)

[English](./README.md) · [한국어](./README.ko.md)

</div>

---

## Why Markwand?

You use Claude Code to draft a PRD. Codex to sketch a refactor plan. Cursor to generate an ADR. The next morning: *"where did I save that file?"*

AI-driven workflows produce a lot of markdown — scattered across dozens of project folders, never indexed anywhere. Markwand is a **local, read-only desktop app** that treats those `.md` files as a first-class knowledge stream: recent docs, tags, drift against source code, cross-project search.

![Markwand demo](./docs/launch/markwand-demo.gif)

## Highlights

- 🗂 **Multi-project workspaces** — register `~/develop/*` (or any roots) and browse all projects from one sidebar
- 📅 **Recent 7 days panel** — whatever Claude/Codex just wrote floats to the top
- 🏷 **Frontmatter-native filters** — filter by `tags`, `source` (`claude`, `codex`, `design`, `review`), `status`
- 🔍 **In-doc search + ⌘K cross-project palette**
- 🔗 **Drift detection** — docs reference code files; Markwand flags stale references with a badge
- 🖼 **Images as first-class assets** — PNG / JPG / SVG / GIF live alongside your docs
- 🌐 **Remote SSH workspaces** (beta, read-only) — browse docs on a remote server without leaving the app
- 🇰🇷 🇺🇸 **i18n** — Korean / English, auto-switched from OS locale
- 🔒 **Local-only by default** — no telemetry, no document contents leave your machine (SSH workspaces excluded by design)
- 📝 **Read-only by design** — Markwand never writes to your files; edit in your own editor

## Positioning

| If you use… | Markwand helps you… |
|---|---|
| Claude Code / Codex / Cursor / Cline / Aider | find & re-enter the docs they left behind across projects |
| Obsidian / Bear / IA Writer | complement them — those edit; Markwand indexes your AI output stream |
| A monorepo with scattered READMEs, ADRs, RFCs | get a live, filterable inventory of everything in `*.md` |

Markwand is **not** a markdown editor, **not** a cloud notes service, and **not** a knowledge graph tool. It is a *fast local viewer* optimized for the rhythm of AI-assisted development.

## Installation (macOS)

Markwand ships unsigned (ad-hoc signed) while in beta. Pick the DMG matching your Mac:

- Apple Silicon (M1/M2/M3/M4) → `Markwand-*-arm64.dmg`
- Intel → `Markwand-*.dmg`

Latest: **[Releases](https://github.com/givepro91/markwand/releases)**

First-launch on macOS Sequoia (15+) / Tahoe (26+) requires one trip through **System Settings → Privacy & Security → Open Anyway**. Full step-by-step, including SHA-256 verification and the Sonoma-or-earlier right-click path:

- 🇺🇸 [English install guide](./docs/install-macos.en.md)
- 🇰🇷 [한국어 설치 가이드](./docs/install-macos.md)

> Windows / Linux builds are not shipped yet — Markwand is macOS-first while the core workflow stabilizes.

## Build from source

```bash
# Prerequisites: Node 18+, pnpm 8+
pnpm install

# Dev server (HMR)
pnpm dev

# Production build
pnpm build

# Type check
pnpm typecheck

# Lint
pnpm lint

# Unsigned DMG (macOS)
pnpm dist:mac
```

## Architecture

| Layer | Stack |
|---|---|
| Shell | Electron 33 · electron-vite · electron-builder |
| UI | React 19 · TypeScript · Zustand · react-arborist |
| Markdown | react-markdown · remark-gfm · remark-breaks · rehype-highlight · rehype-sanitize · mermaid |
| Watching | chokidar · fast-glob · gray-matter · picomatch |
| Remote | ssh2 · ssh-config (read-only transport) |
| i18n | i18next · react-i18next |
| Storage | electron-store (local prefs only) |

Rendering goes through `rehype-sanitize` — untrusted document content never reaches the DOM as raw HTML.

## Privacy

- All scanning, parsing, and search happens locally on your machine.
- No analytics, no telemetry, no document content is transmitted to any server.
- The only network I/O Markwand ever performs is the SSH workspace feature you explicitly configure (read-only), and auto-update checks against GitHub Releases (when enabled).

## Roadmap

Near-term:
- Signed + notarized macOS builds
- Windows build
- Full-text search backend for ⌘K (currently filename + path)
- Writable workspaces behind an explicit opt-in

Longer-term: VS Code / JetBrains companion, agent-friendly MCP integration, richer drift heuristics.

## Contributing

Issues, bug reports, and workflow suggestions are welcome — especially from users of other AI coding tools (Cursor, Cline, Aider, Continue, etc.). Please open a [GitHub Issue](https://github.com/givepro91/markwand/issues) describing:

- your AI-output workflow,
- what you tried to find,
- what Markwand got in the way of.

Pull requests: open an issue first so we can align on scope.

## Credits

- Built by [@givepro91](https://github.com/givepro91) with heavy pair-programming against Claude Code.
- Icon & cover art: see [`build/`](./build/) and [`docs/launch/`](./docs/launch/).

## License

[MIT](./LICENSE) © 2026 Spacewalk — free for personal and commercial use, attribution appreciated.
