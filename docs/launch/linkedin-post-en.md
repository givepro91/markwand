# Markwand — LinkedIn Post (English)

**Target release**: v0.3.0-beta.7 · 2026-04-22
**Tone**: solo-builder product launch (variant A), problem/solution punch (variant B), build-in-public log (variant C)
**Length**: each variant ~800–1200 chars (optimized for the "see more" fold)
**Media**: `docs/launch/cover.svg` → PNG, and the 10-second demo GIF at `docs/launch/markwand-demo.gif`

---

## Variant A — Problem → Solution (classic)

> Draft a PRD in Claude Code.
> Outline a refactor plan in Codex.
> Next morning: *"where did I save that file?"* 🥲

If you build with AI coding tools, your markdown output is scattered across a dozen projects and indexed nowhere. I got tired of it, so I built **Markwand** — a local, read-only desktop curator for the docs your AI wrote.

🗂 Register `~/develop/*` (or any roots) as workspaces — every project in one sidebar
📅 "Recent 7 days" panel — whatever Claude/Codex just wrote floats to the top (new in beta.7)
🏷 Filter by frontmatter `tags` · `source` (claude / codex / design / review) · `status`
🔍 In-doc search + ⌘K cross-project palette
🔗 Drift badges — if a doc references a code file that changed or vanished, you see it
🖼 Images as first-class assets — PNG / JPG / SVG / GIF next to your `.md`
🌐 Remote SSH workspaces (beta, read-only)
🇺🇸 🇰🇷 English / Korean, auto-switched

**Everything is local.** No telemetry, no doc content leaves your machine. Unsigned beta for now, but ad-hoc signed — one right-click to open.

Electron + React + TypeScript. MIT.

👉 https://github.com/givepro91/markwand

Especially curious to hear from people using Cursor, Cline, Aider, or Continue — what kind of curation layer do you wish existed on top of your AI output?

#AI #DeveloperTools #Markdown #ClaudeCode #Codex #Cursor #OpenSource #macOS #Electron

---

## Variant B — Before / After

**Before.** Spec written in Claude yesterday. ADR generated in Codex last week. Now it's Monday, and you're running `find . -name "*.md" | xargs grep` across 17 repos. 😵

**After.** Register those 17 repos as a workspace once. Every AI-written doc, sorted by date / tag / project, in one sidebar. A "Recent 7 days" panel surfaces whatever got touched this morning.

That's **Markwand** — a macOS-first curator for the markdown files your AI coding tools leave behind.

What's in v0.3.0-beta.7:

✨ **Recent-7-days panel** in the project sidebar — latest Claude/Codex output rises to the top
🏷 **`source` filter chip** — `claude` / `codex` / `design` / `review`, driven by frontmatter
🔗 **Drift badge** — when a doc references code that's stale or missing, you see `◐ stale`
🌐 Read-only **SSH** workspaces (beta)
🇺🇸 🇰🇷 English / Korean

Design priorities:
- **Local by default** — all scanning, parsing, and search runs on your machine. Zero network I/O except the SSH feature you explicitly configure.
- **Read-only** — Markwand never writes to your files. Edit in your own editor.
- **Lightweight** — 17 projects, 2,377 `.md` files, 11k watched dirs → main process RSS ~158 MB

Electron + React + TypeScript · MIT · https://github.com/givepro91/markwand

#AI #DeveloperTools #Markdown #ClaudeCode #Codex #Cursor #OpenSource

---

## Variant C — Build-in-public log

Five days of pair-programming with Claude Code, and today I'm shipping **Markwand v0.3.0-beta.7**.

It started as a plain `.md` viewer. But when you spend enough of your week moving between projects where Claude, Codex, and Cursor each dropped design docs, ADRs, and review notes — the viewer becomes a *curator*. There was no local app that did this the way I wanted, so I built it.

What's new in beta.7:

📅 **Recent 7 days panel** — separate sidebar section. Whatever you wrote this morning sits on top.
🧹 **i18n cleanup** — 100% of user-facing labels come from translation resources (ko/en).
🏷 **Full rename** — internal `md-viewer` → `Markwand` down to the electron-store key.

Before beta.7:
- SSH remote filesystem transport (5 sprints)
- Drift detection (doc ↔ code reference integrity)
- Images promoted to first-class assets
- ⌘K palette (full-text search backend still ahead)
- i18n, app icon, ad-hoc signing, MIT LICENSE

All open source · MIT · macOS-first for now.

A large share of this was built with Claude Code, orchestrated through a personal meta-workflow I call Nova (Plan → Design → independent Evaluator gate). Keeping the quality gate stable while moving fast is the actual lesson — writing that up separately.

DMG (unsigned, ad-hoc signed) → https://github.com/givepro91/markwand/releases
Repo → https://github.com/givepro91/markwand

Feedback welcome 🙏

#ClaudeCode #BuildInPublic #AI #Markdown #OpenSource #Electron #macOS

---

## Picking a variant

| Situation | Pick |
|---|---|
| Broad developer audience, product-first pitch | **A** |
| Punchy "problem → answer" scroll-stopper | **B** |
| Builder / AI-workflow community, story-driven | **C** |

Recommended cadence: lead with **A**, follow up 1–2 days later with **C** for the behind-the-scenes layer.

## Media options

1. **Cover only (minimum)** — `docs/launch/cover.svg` → PNG
2. **Demo GIF (recommended)** — `docs/launch/markwand-demo.gif`, 10s loop, auto-plays in the LinkedIn feed
3. **Carousel (3–5 images)** — empty state / tree+recent / filter active / viewer with drift badge

LinkedIn auto-plays GIFs in the feed — good for dwell time.

## Hashtag sets

**Core (3–5 per post)**: `#ClaudeCode #DeveloperTools #Markdown #OpenSource #macOS`
**Extended**: `#Electron #AI #Codex #Cursor #BuildInPublic`
**Situational**: `#VibeCoding #SideProject #ProductHunt`
