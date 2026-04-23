# Markwand — Show HN template

HN rewards terse, honest, technical posts. Keep the hype out.

---

## Title (80 char max)

Primary:
> **Show HN: Markwand – a local viewer for the markdown my AI tools scatter around**

Alternatives:
- `Show HN: Markwand – desktop curator for Claude Code / Codex / Cursor output`
- `Show HN: A read-only inventory for every .md your AI coding tools generate`

Avoid: emoji, exclamation marks, marketing adjectives ("beautiful", "powerful"). HN readers downvote those on sight.

## Post body

I kept losing track of the markdown files my AI coding tools left behind — specs from Claude Code, refactor plans from Codex, ADRs from Cursor — spread across ~17 different repos with no shared index. My hacked-together `find | grep` loop stopped scaling, so I built Markwand.

It's a macOS desktop app that registers any number of project roots as workspaces, then treats every `.md` inside them as a first-class entry: sorted by mtime, filterable by frontmatter (`tags`, `source`, `status`), with a "Recent 7 days" panel for whatever your AI wrote this week.

A few design choices worth calling out:

- **Read-only.** Markwand never writes to your files. Edit in your own editor.
- **Local only.** No telemetry. No uploads. No account. The only network I/O is the optional SSH remote-workspace feature.
- **Drift detection.** When a doc references a code file (`src/foo.ts`), Markwand compares against the git tree and flags stale/missing references with a badge.
- **Images as first-class.** PNG/JPG/SVG/GIF sit alongside `.md` and share the same filter/search UI.
- **Sanitized rendering.** All markdown goes through rehype-sanitize — untrusted doc content never reaches the DOM as raw HTML.

Stack: Electron 33, React 19, TypeScript, Zustand, chokidar for watching, ssh2 for the remote transport. MIT.

It's beta — ad-hoc signed DMG, not Apple-notarized, so first launch needs one trip through System Settings → Privacy & Security → "Open Anyway". After that it's normal. Step-by-step in the repo.

Happy to discuss the architecture — particularly the drift detection (which is naïve regex + git currently — I'd love harder heuristics), the frontmatter schema decisions, or how the SSH transport fakes a local filesystem for the UI.

Repo: https://github.com/givepro91/markwand
Releases: https://github.com/givepro91/markwand/releases

## First comment (author — drop ~5 min after post)

A couple of things I didn't cram into the post:

**Why not just Obsidian/VS Code/Bear/Logseq?**
Those are editors or PKM systems. Markwand is the *inventory* layer on top of files that already exist. It pairs with whatever editor you already use — it doesn't try to replace one. I tried to model my own workflow honestly rather than reinvent note-taking.

**Why electron?**
Solo maker, macOS-first, Electron gave me chokidar + ssh2 + react out of the box without rewriting a file-watching layer. Main-process RSS stays around 158 MB across 17 projects / 2377 `.md` / 11k watched dirs, which is acceptable for my use.

**What's ahead:**
- Windows build
- Full-text search backend behind ⌘K (currently filename + path)
- Writable workspaces behind an explicit opt-in
- MCP endpoint so an agent can query the inventory directly

Would especially love feedback from folks running Aider, Cline, or Continue workflows — the frontmatter `source` taxonomy was built around Claude Code / Codex output patterns, so I'd like to hear where it mismatches other tools.

## Anticipated pushback & honest answers

| Likely critique | How to respond |
|---|---|
| "Why Electron / 158 MB RSS?" | Acknowledge honestly; explain chokidar + ssh2 + react shortcut; link to the RSS figure as *actual* data, not a guess. |
| "This is just a markdown viewer" | Agree it's a viewer — the differentiator is the *inventory + drift + frontmatter filter* layer, not the rendering. Show the recent-7 panel. |
| "Why not CLI?" | A CLI for inventory/search is viable; the desktop UI pays off for *browsing* recent AI output, not for grepping. Not against shipping a CLI companion later. |
| "Privacy concerns (Electron auto-update / telemetry)" | No telemetry. Update check is opt-in and only queries GitHub Releases. All code is MIT — grep the repo. |
| "Unsigned is a non-starter" | Legitimate concern. Signed + notarized builds are the v1.0 gate, not a beta gate. Ad-hoc signing + System Settings path is documented. |

## Scheduling

- Best windows: Tuesday–Thursday, 08:00–10:00 PT (peaks EU + US morning).
- Avoid: Monday morning (overflow from weekend submits), any US holiday week.
- Do NOT ask friends to upvote — HN detects ring-voting and penalizes.
- Do NOT cross-post to /r/programming in the same hour (looks spammy).
