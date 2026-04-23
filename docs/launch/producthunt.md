# Markwand — Product Hunt launch copy

**Target launch date**: TBD (propose a Tuesday/Wednesday 00:01 PT)
**Category primary**: Developer Tools
**Category secondary**: Productivity
**Topics**: Markdown, macOS, Open Source, Artificial Intelligence, Electron

---

## Tagline (60 chars max — PH hard limit)

Primary:
> **The curator for every markdown file your AI wrote**

Alternatives (if the primary is taken or feels off):
- `Find the docs Claude and Codex left behind — locally`
- `A local home for your AI coding output`
- `Markdown inbox for Claude Code, Codex, and Cursor`

## Description (260 chars max)

> Markwand is a local, read-only macOS curator for the markdown docs your AI coding tools scatter across dozens of projects. Register folders as workspaces, surface the last 7 days, filter by frontmatter tags, detect drift against source — all offline. MIT.

## First comment (maker post) — longer form

Hey Product Hunt 👋

I'm the maker — I built Markwand because my own AI workflow got out of hand.

I use Claude Code for PRDs, Codex for refactor plans, Cursor for ADRs, and between those I was generating dozens of markdown files a week — spread across 17 different project folders. The "where did I save that?" tax was real, and nothing on my machine was built for the rhythm of AI-assisted development.

**What Markwand does:**

- 🗂 Register any number of project roots as workspaces
- 📅 A "Recent 7 days" panel surfaces whatever Claude/Codex just wrote
- 🏷 Filter by frontmatter `tags`, `source` (claude / codex / design / review), `status`
- 🔍 In-doc search + ⌘K cross-project palette
- 🔗 Drift detection — if a doc references code that changed or disappeared, you see a badge
- 🖼 Images (PNG/JPG/SVG/GIF) are first-class — they live next to your docs
- 🌐 Read-only SSH workspaces for remote servers (beta)

**What Markwand is NOT:**

- Not a markdown editor (use yours — Obsidian, Bear, VS Code)
- Not a cloud service (no telemetry, no uploads, no accounts)
- Not a knowledge graph or second brain — just a fast local viewer tuned for AI output

**Privacy:** everything runs locally. Your documents never leave your machine.

**Stack:** Electron 33, React 19, TypeScript, Zustand. MIT. macOS-first (Windows next).

This is a **beta** — ad-hoc signed, not Apple-notarized yet, so first launch needs one trip through System Settings. Step-by-step guide is linked from the repo.

Happy to answer anything — especially curious what curation tools other Cursor / Cline / Aider users have glued together.

🔗 Repo: https://github.com/givepro91/markwand
📦 Latest DMG: https://github.com/givepro91/markwand/releases

— built alongside Claude Code, organized by a personal meta-workflow I'll write about separately.

## Gallery plan

| Slot | Asset | Purpose |
|---|---|---|
| 1 (hero) | `docs/launch/cover.svg` → 1270×760 PNG | First-impression hero |
| 2 | `docs/launch/markwand-demo.gif` | Motion — tree + recent-7 panel + viewer |
| 3 | Screenshot: filter chips active | Proof of frontmatter filtering |
| 4 | Screenshot: drift badge on a doc | Unique angle vs. plain viewers |
| 5 | Screenshot: ⌘K palette across projects | Cross-project search |

(slots 3–5 need actual in-app screenshots — capture at 2560×1600 then downscale to 1270×796 for PH's 1600×800 max.)

## Launch checklist

- [ ] Make sure latest release is stable (v0.3.0-beta.7 or newer)
- [ ] Upload gallery (1270×760) — hero as slot 1
- [ ] Demo GIF under 3 MB (PH inline limit) — compress with `gifsicle -O3 --lossy=80`
- [ ] Pin the Twitter/X and LinkedIn threads before 00:01 PT
- [ ] Pre-line supporters for the first hour (friends, prior shippers)
- [ ] Be online to reply within minutes for the first 4 hours
- [ ] Cross-post to r/macapps and r/LocalLLaMA (not r/SideProject — too noisy)

## Pre-emptive Q&A (first-comment thread)

**Q: Why not just use VS Code / Obsidian / Bear?**
Those are editors. Markwand is the *inventory* layer for files your AI tools already wrote. It pairs with an editor, doesn't replace one.

**Q: Why macOS-first?**
I'm a solo maker, and macOS covers my own tooling. Windows is next on the roadmap.

**Q: Why unsigned?**
Apple Developer ID signing + notarization has a recurring cost and a latency I wanted to defer until v1.0. Ad-hoc signing is the practical compromise for a beta — one-time System Settings trip, then normal launch forever after.

**Q: Does it phone home?**
No. Local only. The only network I/O is the SSH workspace feature (which you configure yourself) and optional update checks against GitHub Releases.

**Q: Does it write to my files?**
Never. Markwand is intentionally read-only. Edit in your own editor.

**Q: MCP / agent integration?**
On the roadmap — the frontmatter-driven inventory is a natural MCP surface.
