/**
 * Startup header for Pi: ASCII "PI" art + divider + changelog.
 *
 * Mirrors pi-sakura-cyberdeck's header extension:
 * - ctx.ui.setHeader() on session_start, cleared on session_shutdown
 * - render(width) returns the header lines; art is centered and clipped to
 *   the terminal width
 * - Art rows get a teal→cyan character gradient (dark-sakana palette); the
 *   divider is a full-width rail under the art; changelog lines follow.
 *
 * Edit CHANGELOG below to customize what shows after the divider.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ─── art ────────────────────────────────────────────────────────────────────

const PI_ART = [
  "██████╗ ██╗",
  "██╔══██╗██║",
  "██████╔╝██║",
  "██╔═══╝ ██║",
  "██║     ██║",
  "╚═╝     ╚═╝",
] as const;

// dark-sakana palette anchors for the gradient (accent → borderAccent).
const FROM: readonly [number, number, number] = [0x8a, 0xbe, 0xb7]; // #8abeb7
const TO: readonly [number, number, number] = [0x00, 0xd7, 0xff]; // #00d7ff

// ─── changelog (edit freely) ────────────────────────────────────────────────

const CHANGELOG = [
  "✦ v0.1.0  dark-sakana footer pack",
  "  · [thinking] model | folder | git",
  "  · context | tokens | cache · startup art",
] as const;

// ─── rendering ──────────────────────────────────────────────────────────────

type RGB = readonly [number, number, number];

function rgb([r, g, b]: RGB, text: string, bold = false): string {
  return `${bold ? "\x1b[1m" : ""}\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}

function gradient(text: string, from: RGB, to: RGB, bold = false): string {
  const chars = [...text];
  const span = Math.max(1, chars.length - 1);
  return chars
    .map((char, index) => {
      if (char === " ") return char;
      const t = index / span;
      const color: RGB = [
        Math.round(from[0] + (to[0] - from[0]) * t),
        Math.round(from[1] + (to[1] - from[1]) * t),
        Math.round(from[2] + (to[2] - from[2]) * t),
      ];
      return rgb(color, char, bold);
    })
    .join("");
}

function renderHeader(width: number): string[] {
  if (width <= 0) return [];

  const artWidth = Math.max(...PI_ART.map((line) => [...line].length));
  const visibleArtWidth = Math.min(width, artWidth);
  // Pad with plain spaces — ANSI-wrapped text must not go through a
  // character-level centering helper (escape sequences would count as width).
  const pad = (len: number) => " ".repeat(Math.max(0, Math.floor((width - len) / 2)));

  const art = PI_ART.map((line) => {
    const clipped = [...line].slice(0, visibleArtWidth).join("");
    return `${pad(visibleArtWidth)}${gradient(clipped, FROM, TO, true)}`;
  });

  const rail = "━".repeat(visibleArtWidth);
  const changelog = CHANGELOG.map((line) => {
    const clipped = [...line].slice(0, width).join("");
    return `${pad([...clipped].length)}${rgb([0x80, 0x80, 0x80], clipped)}`;
  });

  return ["", ...art, "", `${pad(visibleArtWidth)}${rgb(TO, rail)}`, "", ...changelog, ""];
}

// ─── extension ──────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    ctx.ui.setHeader((_tui) => ({
      render: (width) => renderHeader(width),
      invalidate() {},
    }));
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setHeader(undefined);
  });
}
