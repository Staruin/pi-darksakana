# pi-darksakana

Two-theme TUI pack for [Pi](https://pi.dev): the **violet-cyberdeck** and
**dark-sakana** themes, each with its own header / footer / working-indicator
extensions.

Everything here uses the public extension API (`setHeader` / `setFooter` /
`setWidget`), so nothing in the Pi source tree is patched.

## Themes

| Theme | Look | Origin |
|-------|------|--------|
| `violet-cyberdeck` | Deep violet deck: violet accent, lilac/lavender/periwinkle gradients, mint success, butter warning, rose error | Fork of [pi-sakura-cyberdeck](https://github.com/beautifulrem/pi-sakura-cyberdeck) with the pink palette replaced |
| `dark-sakana` | Pi's built-in `dark` palette under a new name — a neutral template base to tweak | Renamed copy of Pi's built-in `dark` theme |

Both are truecolor themes with the full token set (markdown, diffs, syntax,
`thinkingOff` → `thinkingXhigh`, plus an `export` block for `/export`).

### `violet-cyberdeck` palette

| Role | Var | Hex |
|------|-----|-----|
| Background | `bg` | `#131019` |
| Surface / raised | `surface` / `surfaceRaised` | `#1C1726` / `#2B2438` |
| Text / soft | `text` / `textSoft` | `#F3EFF8` / `#D4CBDE` |
| Accent | `violet` | `#B79CF0` |
| Gradient stops | `violetIro` / `lilac` / `lavender` / `periwinkle` | `#C9AEF5` / `#D8C2F5` / `#9F86E8` / `#94A9F0` |
| Success / warning / error | `mint` / `butter` / `rose` | `#8FE0BC` / `#E9CF7E` / `#E8637F` |
| Numbers / inline code | `butter` / `apricot` | `#E9CF7E` / `#E8A87C` |

### `dark-sakana` palette

`accent #8abeb7`, `border #5f87ff`, `borderAccent #00d7ff`, `success #b5bd68`,
`error #cc6666`, `warning #ffff00`, `text #d4d4d4`, plus per-level thinking
tints from `#505050` up to `#ff5fff`.

## Extensions — pick **one** pack

| Pack | Entry points | Takes over |
|------|--------------|-----------|
| **Dark Sakana** | `extensions/darksakana/footer-info.ts`, `startup-header.ts` | Startup header (ASCII `PI`, teal→cyan gradient, changelog) and a 2-row status block below the input box: model hint line (thinking chip + model + MCP + live process count) and the footer (folder \| git on the left; context gauge, tokens, cache hit rate on the right) |
| **Cyberdeck** | `extensions/cyberdeck/{header,matrix,zentui,claude-shimmer}/index.ts` | Header (ANSI Shadow `PI` + gradient divider + `◈ PI CYBERDECK ◈`), matrix rain while working, Zentui editor/prompt rails/footer, violet Claude-style shimmer with an effort HUD |

> **The two packs are mutually exclusive — load one pack at a time.**
> Both install a startup header and both replace the footer, so enabling the
> two together means one silently wins and the other's styling leaks through.
> The themes themselves are independent: whichever pack you load, you can
> select either theme in `/settings`.

### Notes

- **Live process count** (Dark Sakana hint line) reads a throttled `ps -eo pid=,ppid=,stat=` snapshot. Where `ps` does not support that form — Windows, minimal containers — the counter renders `● ?` instead of a number.
- The Dark Sakana footer takes its colors from the active theme via `theme.fg(...)`, so it adapts to `dark-sakana`, `violet-cyberdeck`, or any other theme.

## Install

### Option A — as a package, narrowed to one pack

```bash
pi install git:github.com/Staruin/pi-darksakana
```

Then narrow the package to a single extension pack in
`~/.pi/agent/settings.json` (the object form is what makes this possible):

```json
{
  "theme": "violet-cyberdeck",
  "tuiMode": "fullscreen",
  "packages": [
    {
      "source": "git:github.com/Staruin/pi-darksakana",
      "extensions": ["extensions/darksakana/*.ts"]
    }
  ]
}
```

For the Cyberdeck pack instead:

```json
{
  "packages": [
    {
      "source": "git:github.com/Staruin/pi-darksakana",
      "extensions": [
        "extensions/cyberdeck/header/index.ts",
        "extensions/cyberdeck/matrix/index.ts",
        "extensions/cyberdeck/zentui/index.ts",
        "extensions/cyberdeck/claude-shimmer/index.ts"
      ]
    }
  ]
}
```

Use `"extensions": []` to load the themes with no extensions at all, or run
`pi config` to toggle individual resources interactively.

### Option B — auto-discovery (hot-reloadable)

Pi loads extensions from `~/.pi/agent/extensions/` and themes from
`~/.pi/agent/themes/` on every start, and `/reload` hot-reloads them — the
easiest path while tweaking colors.

```bash
# theme(s)
cp themes/*.json ~/.pi/agent/themes/

# Dark Sakana pack
cp extensions/darksakana/*.ts ~/.pi/agent/extensions/

# …or the Cyberdeck pack
cp -r extensions/cyberdeck ~/.pi/agent/extensions/cyberdeck
```

Then pick the theme in `/settings` (or set `"theme": "violet-cyberdeck"` in
`~/.pi/agent/settings.json`) and **restart Pi** — extension and package changes
made mid-session only take effect on a fresh start.

### Theme only, no extensions

```bash
pi install git:github.com/Staruin/pi-darksakana
```

…and add `"extensions": []` to the package entry. Both themes appear in
`/settings` with no chrome changes.

## Bundled config samples

Theme-relevant excerpts of the live configuration. Copy the keys you want —
never overwrite your whole settings file with them.

| File | Live path | Purpose |
|------|-----------|---------|
| `config/settings.snippet.json` | `~/.pi/agent/settings.json` | `theme`, `tuiMode`, and the package entry with a single-pack filter (no secrets, no absolute paths) |
| `config/sakura-cyberdeck-zentui.json` | `~/.pi/agent/sakura-cyberdeck-zentui.json` | Zentui colours / footer segments / icons (Cyberdeck pack) |
| `config/sakura-cyberdeck-matrix.json` | `~/.pi/agent/sakura-cyberdeck-matrix.json` | Matrix rain on/off, fps, density, height (Cyberdeck pack) |

### Pi 0.84+ sticky editor

Pi 0.84 introduced a native fullscreen TUI with a sticky editor. The Cyberdeck
pack's experimental **fixed editor** compositor patches private TUI APIs and is
off by default (and hard-blocked at runtime on Pi 0.84+ layouts even if
re-enabled in config). Use the native one instead:

```jsonc
// ~/.pi/agent/settings.json
{ "tuiMode": "fullscreen" }
```

## Commands

```text
/zentui                 editor / footer settings (Cyberdeck pack)
/sakura-matrix          rain status
/sakura-matrix on|off
```

## Screenshots

`docs/screenshots/` is the placeholder for pack screenshots — drop a PNG per
theme (`violet-cyberdeck.png`, `dark-sakana.png`) and reference it here, or
point `pi.image` in `package.json` at one for the Pi package gallery.

## Requirements

- Pi `>= 0.80` (Pi `0.84+` fully supported)
- A truecolor terminal
- A Nerd Font if you keep the Cyberdeck pack's icons enabled

## Development

```bash
npm run check     # manifest, both themes, both packs, config samples, docs
npm run smoke     # renders the Dark Sakana footer with a mocked pi + theme
npm run preview   # truecolor render of the Cyberdeck header and footer
```

`npm run check` includes a palette guard: it fails if any of the old pink hexes
sneak back into the theme or the Cyberdeck extensions, or if the
`editorBorder: "sakura-macaron-gradient"` sentinel value changes — that value is
a user-facing config key, so it is intentionally kept from upstream.

## Layout

```text
pi-darksakana/
├── themes/
│   ├── violet-cyberdeck.json
│   └── dark-sakana.json
├── extensions/
│   ├── darksakana/          # footer-info.ts, startup-header.ts
│   └── cyberdeck/           # header/, matrix/, zentui/, claude-shimmer/
├── config/                  # settings snippet + Zentui/Matrix samples
├── licenses/pi-zentui-MIT.txt
├── docs/screenshots/
├── scripts/                 # check.mjs, smoke-render.mjs, preview.mjs
├── NOTICE
└── LICENSE
```

## Conflicts

Load only one of the two packs. Beyond that, avoid stacking the Cyberdeck pack
with `pi-zentui`, `pi-powerline-footer`, `@tifan/pi-fixed-editor`, stock
`pi-claude-shimmer`, or a second copy of this pack — they share the footer,
working-indicator and editor surfaces. Drop `sakura-matrix` if the matrix rain
fights the shimmer for the working indicator.

## License

MIT (see `LICENSE`). Third-party origins are listed in `NOTICE`; the Cyberdeck
pack is a fork of `pi-sakura-cyberdeck` and embeds a modified copy of
`pi-zentui` (MIT, full text in `licenses/pi-zentui-MIT.txt`).

## Changelog

### 0.2.0

- **Repository became a two-theme pack.** `dark-sakana` (header + footer) is
  joined by `violet-cyberdeck` and the whole Cyberdeck extension set, moved
  under `extensions/darksakana/` and `extensions/cyberdeck/`.
- **Manifest renamed** `pi-dark-sakana` → `pi-darksakana` to match the
  repository; both themes and all six extension entry points are declared.
- **Config samples** added under `config/` (theme-relevant settings excerpt,
  Zentui colours, Matrix settings) — no secrets, no absolute paths.
- **`npm run check` unified** to validate both themes and both packs, including
  the violet palette guard and the fixed-editor regression assertions.

### 0.1.0

- `dark-sakana` theme + footer (model \| folder \| git, context \| tokens \|
  cache) + startup `PI` header.