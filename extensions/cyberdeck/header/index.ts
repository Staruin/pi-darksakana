import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

type RGB = readonly [number, number, number];

function rgb([r, g, b]: RGB, text: string, bold = false): string {
  return `${bold ? BOLD : ""}\x1b[38;2;${r};${g};${b}m${text}${RESET}`;
}

function gradient(text: string, from: RGB, to: RGB, bold = false): string {
  const chars = [...text];
  const span = Math.max(1, chars.length - 1);
  return chars.map((char, index) => {
    if (char === " ") return char;
    const t = index / span;
    const color: RGB = [
      Math.round(from[0] + (to[0] - from[0]) * t),
      Math.round(from[1] + (to[1] - from[1]) * t),
      Math.round(from[2] + (to[2] - from[2]) * t),
    ];
    return rgb(color, char, bold);
  }).join("");
}

// ANSI Shadow "PI" — keeps the startup block small and legible.
const PI_ART = [
  "██████╗ ██╗",
  "██╔══██╗██║",
  "██████╔╝██║",
  "██╔═══╝ ██║",
  "██║     ██║",
  "╚═╝     ╚═╝",
] as const;

function getAvailableRows(tui: unknown): number {
  try {
    const terminal = (tui as { terminal?: { rows?: unknown } }).terminal;
    const rows = terminal?.rows;
    return typeof rows === "number" && Number.isFinite(rows) ? Math.max(0, Math.floor(rows)) : 0;
  } catch {
    return 0;
  }
}

function renderHeader(width: number, availableRows = 0): string[] {
  if (width <= 0) return [];

  const violet: RGB = [183, 156, 240];
  const periwinkle: RGB = [148, 169, 240];
  const lilac: RGB = [216, 194, 245];
  const telemetry = "◈  PI CYBERDECK  ◈";
  const artWidth = Math.max(...PI_ART.map((line) => [...line].length));
  const visibleArtWidth = Math.min(width, artWidth);
  const telemetryWidth = [...telemetry].length;
  // Artwork, divider and label share one width so the block reads as a single
  // panel: never narrower than the artwork, never narrower than the label.
  const railWidth = Math.max(1, Math.min(width, Math.max(visibleArtWidth, telemetryWidth)));
  const artPad = " ".repeat(Math.max(0, Math.floor((width - visibleArtWidth) / 2)));
  const rail = "━".repeat(railWidth);
  const railPad = " ".repeat(Math.max(0, Math.min(width - railWidth, Math.floor((width - railWidth) / 2))));
  const visibleTelemetry = [...telemetry].slice(0, width).join("");
  const visibleTelemetryWidth = [...visibleTelemetry].length;
  const telemetryPad = " ".repeat(Math.max(0, Math.min(width - visibleTelemetryWidth, Math.floor((width - visibleTelemetryWidth) / 2))));

  const art = PI_ART.map((line) => {
    const clipped = [...line].slice(0, visibleArtWidth).join("");
    return `${artPad}${gradient(clipped, violet, periwinkle)}`;
  });

  const visualHeight = PI_ART.length + 3; // artwork + gap + divider + label
  const extraTopPadding = Math.max(0, Math.floor((availableRows - visualHeight) / 2) - 1);

  return [
    ...Array(extraTopPadding).fill(""),
    "",
    ...art,
    "",
    `${railPad}${gradient(rail, violet, periwinkle)}`,
    `${telemetryPad}${gradient(visibleTelemetry, lilac, periwinkle, true)}`,
    "",
  ];
}

export default function violetCyberdeckHeader(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    ctx.ui.setHeader((tui) => ({
      render: (width) => renderHeader(width, getAvailableRows(tui)),
      invalidate() {},
    }));
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setHeader(undefined);
  });
}
