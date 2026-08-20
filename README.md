# pi-dark-sakana

Dark-template pack for [Pi](https://pi.dev): a `dark`-based theme, a custom
footer (**folder | git repo** on the left) and a 2-row status block below the
input box — a model hint line (thinking chip + model id + MCP + live process
count) at the top, the context/token/cache stats footer below it — all via the
public extension API (`setFooter` / `setWidget`), no Pi source modification needed.

## What's inside

| Piece | Role |
|-------|------|
| **Theme** `dark-sakana` | Exact copy of Pi's built-in `dark` theme under a new name (template base for later tweaks) |
| **Startup header** | ASCII "PI" art (teal→cyan gradient) + divider + changelog on session start |
| **Footer + hint line** | 2 rows below the input box, via `setFooter` + `setWidget(belowEditor)`. Row 1 = model hint (thinking + model + MCP + live process count); row 2 = footer `folder \| git` … context gauge, tokens, cache hit rate + statuses |

Layout example:

```text
┌───────────────────────────────────────────────────────────
│ type your message here…
────────────────────────────────────────────────────────────  ← input-box bottom border
[HIGH] deepseek-v4-flash                     🔌 MCP: 3 | ● 2   ← hint line (row 1)
my-project | main   [██░░░░░░░░] 12%/128k | ↑8.0k ↓150 | cache 86% | Codex 36%   ← footer (row 2)
```

**Model hint line (row 1)** — via `setWidget(..., { placement: "belowEditor" })`, flush left (padding-0 Text)
- Thinking level chip `[OFF]/[MIN]/[LOW]/[MED]/[HIGH]/[XHIGH]/[MAX]`, tinted with the theme's `thinking*` colors
- Model id (accent), truncated to 24 cells
- Right side: `🔌 MCP: <connected>` (compacted pi-mcp-adapter status) + `● <n>` live count of terminal/processes PI has spawned (throttled `ps` snapshot, skips zombies)
- Updates live on model switch, thinking-level switch, and every footer repaint

**Footer left side**
- Folder: basename of the working directory (`~` inside home)
- Git repo: current branch (green), `detached` (yellow), `no git` (dim)

**Right side**
- Context: 10-cell gauge + `percent/context-window` from `ctx.getContextUsage()` and `ctx.model.contextWindow`; tier-colored (warning ≥ 70%, error ≥ 90%)
- Tokens: session totals `↑input ↓output` (accumulated assistant usage)
- Cache hit rate: latest message `cacheRead / (input + cacheRead + cacheWrite)`, `cache --` when unavailable
- Tail: any other extension statuses set via `ctx.ui.setStatus()`
- Live refresh on git branch change, model switch, thinking-level switch, and message end

## Install (auto-discovery, recommended)

Pi loads extensions from `~/.pi/agent/extensions/` and themes from
`~/.pi/agent/themes/` on every start, and `/reload` hot-reloads them:

```bash
cp extensions/footer-info.ts ~/.pi/agent/extensions/footer-info.ts
cp themes/dark-sakana.json ~/.pi/agent/themes/dark-sakana.json
```

Then select **dark-sakana** in `/settings` (or set `"theme": "dark-sakana"` in
`~/.pi/agent/settings.json`) and **fully restart Pi** — package/extension
changes made mid-session only take effect on a fresh start.

> Package form (`pi install ./pi-dark-sakana`) also works, but package
> extensions are NOT hot-reloaded by `/reload` and are harder to iterate on.
> The package layout here is kept as a distributable source of truth; the
> live copies live in `~/.pi/agent/extensions|themes`.
## Development

```bash
npm run check     # smoke tests: manifest, theme tokens, footer contract
```

## Notes

- Colors are theme-driven via `theme.fg(...)`, so the footer adapts to
  whatever theme is active — it does not hardcode the palette.
- The footer replaces the built-in one entirely (same mechanism as
  `pi-sakura-cyberdeck`'s zentui footer), so built-in token/cost display is
  not shown unless re-added on the right side.

## License

MIT.
