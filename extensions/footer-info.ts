/**
 * dark-sakana footer: left = thinking level + model | folder | git repo,
 * right = context gauge | token totals | cache hit rate.
 *
 * Replaces the built-in footer via ctx.ui.setFooter().
 *
 * - Thinking level: [OFF]/[MIN]/[LOW]/[MED]/[HIGH]/[XHIGH]/[MAX], tinted with
 *   the theme's thinking* tokens.
 * - Context: 10-cell gauge + percent/context-window from ctx.getContextUsage()
 *   and ctx.model.contextWindow; tier-colored (warning >= 70%, error >= 90%).
 * - Tokens: accumulated input/output across the session (assistant usage).
 * - Cache hit rate: latest assistant usage cacheRead / (input + cacheRead + cacheWrite).
 *
 * Colors come from the active theme (dark-sakana by default) through theme.fg(...).
 */
import { homedir } from "node:os";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ThemeColor } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const SEPARATOR = " | ";

// ─── load marker (diagnostics) ─────────────────────────────────────────────
// Written once per process at load time so the extension's load state is
// observable without TUI access: ~/.pi/agent/state/pi-dark-footer-loaded.json
try {
  const stateDir = join(getAgentDir(), "state");
  writeFileSync(
    join(stateDir, "pi-dark-footer-loaded.json"),
    JSON.stringify({ loadedAt: new Date().toISOString(), pid: process.pid }, null, 2) + "\n",
    "utf8",
  );
} catch {
  // marker is best-effort only
}
// ─── thinking level ────────────────────────────────────────────────────────

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

const THINKING_LABELS: Record<ThinkingLevel, string> = {
  off: "OFF",
  minimal: "MIN",
  low: "LOW",
  medium: "MED",
  high: "HIGH",
  xhigh: "XHIGH",
  max: "MAX",
};

const THINKING_COLORS: Record<ThinkingLevel, ThemeColor> = {
  off: "thinkingOff",
  minimal: "thinkingMinimal",
  low: "thinkingLow",
  medium: "thinkingMedium",
  high: "thinkingHigh",
  xhigh: "thinkingXhigh",
  max: "thinkingMax",
};

// ─── helpers ───────────────────────────────────────────────────────────────

/** Basename of the current working directory ("~" when inside the home dir). */
function folderName(): string {
  const cwd = process.cwd();
  if (cwd === homedir()) return "~";
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? cwd;
}

/** Compact token count: 144 → "144", 1234 → "1.2k", 12345 → "12k", 1.2e6 → "1.2M". */
function formatCount(value: number): string {
  if (value < 1000) return value.toString();
  if (value < 10_000) return `${(value / 1000).toFixed(1)}k`;
  if (value < 1_000_000) return `${Math.round(value / 1000)}k`;
  if (value < 10_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return `${Math.round(value / 1_000_000)}M`;
}

/** 10-cell context gauge: filled cells + empty cells. */
function buildContextGauge(percent: number | null, width = 10): string {
  if (percent === null) return "░".repeat(width);
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
}

type ContextTier = "normal" | "warning" | "error";

function contextTier(percent: number | null): ContextTier {
  if (percent === null) return "normal";
  if (percent >= 90) return "error";
  if (percent >= 70) return "warning";
  return "normal";
}

// ─── extension-status text handling ─────────────────────────────────────────

/** Status keys to hide entirely from the footer (empty by default). */
const HIDDEN_STATUS_KEYS: readonly string[] = ["pi-cache-stats"];

/**
 * Compact pi-cache-optimizer footer stats (key "pi-cache-stats"):
 *   "· DS 70/70·4.07M/4.12M 98.9% ⚠️ compat" → "DS 98.9% ⚠"
 * Keeps the provider label and hit rate, drops request/token counters, and
 * retains a ⚠ marker when the plugin flags a compat gap. Any text that does
 * not match this shape is returned unchanged.
 */
function compactStatusText(text: string): string {
  const match = text.match(/^(?:·\s*)?(\S+)\s+\d+\/\d+·\S+\s+(\d+(?:\.\d+)?)%(.*)$/);
  if (!match) return text;
  const [, label, percent, tail] = match;
  const warn = tail.includes("⚠") ? " ⚠" : "";
  return `${label} ${percent}%${warn}`;
}


type UsageTotals = {
  input: number;
  output: number;
  /** Cache hit rate of the most recent assistant message with usage. */
  latestCacheHitRate: number | undefined;
};

function computeUsageTotals(branch: readonly unknown[]): UsageTotals {
  let input = 0;
  let output = 0;
  let latestCacheHitRate: number | undefined;

  for (const entry of branch) {
    const e = entry as { type?: string; message?: { role?: string; usage?: unknown } };
    if (e.type !== "message" || e.message?.role !== "assistant") continue;
    const usage = (e.message as AssistantMessage).usage;
    if (!usage) continue;

    const entryInput = usage.input ?? 0;
    const entryCacheRead = usage.cacheRead ?? 0;
    const entryCacheWrite = usage.cacheWrite ?? 0;
    input += entryInput;
    output += usage.output ?? 0;

    const promptTokens = entryInput + entryCacheRead + entryCacheWrite;
    if (promptTokens > 0) {
      latestCacheHitRate = (entryCacheRead / promptTokens) * 100;
    }
  }

  return { input, output, latestCacheHitRate };
}

// ─── extension ─────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // Registered once per extension load; forwards to the active footer so
  // model / thinking-level switches and new messages repaint immediately.
  let requestRender: (() => void) | undefined;
  pi.on("model_select", () => requestRender?.());
  pi.on("thinking_level_select", () => requestRender?.());
  pi.on("message_end", () => requestRender?.());

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;

    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsubBranch = footerData.onBranchChange(() => tui.requestRender());
      requestRender = () => tui.requestRender();

      return {
        dispose() {
          unsubBranch();
          requestRender = undefined;
        },
        invalidate() {},
        render(width: number): string[] {
          // ── left: thinking level + model | folder | git repo ──────────
          const level: ThinkingLevel = ctx.thinkingLevel ?? "off";
          const model = ctx.model?.id ?? "no model";
          const branch = footerData.getGitBranch();
          const git =
            branch === null ? "no git" : branch === "detached" ? "detached" : branch;

          const left =
            theme.fg(THINKING_COLORS[level], `[${THINKING_LABELS[level]}]`) +
            " " +
            theme.fg("accent", truncateToWidth(model, 24)) +
            theme.fg("dim", SEPARATOR) +
            theme.fg("text", folderName()) +
            theme.fg("dim", SEPARATOR) +
            (branch === null
              ? theme.fg("dim", git)
              : branch === "detached"
                ? theme.fg("warning", git)
                : theme.fg("success", git));

          // ── right: context | tokens | cache hit rate ───────────────────
          const usage = ctx.getContextUsage();
          const contextWindow = ctx.model?.contextWindow ?? usage?.contextWindow;
          const percent = usage?.percent ?? null;
          const tier = contextTier(percent);
          const tierColor: ThemeColor =
            tier === "error" ? "error" : tier === "warning" ? "warning" : "accent";
          const contextLabel =
            contextWindow && contextWindow > 0
              ? `${percent === null ? "?" : `${Math.round(percent)}%`}/${formatCount(contextWindow)}`
              : "--";
          const contextSegment =
            theme.fg(tierColor, `[${buildContextGauge(percent)}]`) +
            " " +
            theme.fg(tierColor, contextLabel);

          const { input, output, latestCacheHitRate } = computeUsageTotals(
            ctx.sessionManager.getBranch(),
          );
          const tokensSegment = theme.fg(
            "muted",
            `↑${formatCount(input)} ↓${formatCount(output)}`,
          );
          const cacheSegment =
            latestCacheHitRate === undefined
              ? theme.fg("dim", "cache --")
              : theme.fg("success", `cache ${Math.round(latestCacheHitRate)}%`);

          // ── right tail: extension statuses (setStatus) ──────────────────
          const statusSegments = [...footerData.getExtensionStatuses().entries()]
            .filter(([key]) => !HIDDEN_STATUS_KEYS.includes(key))
            .map(([, status]) => theme.fg("muted", compactStatusText(status)));

          const right = [contextSegment, tokensSegment, cacheSegment, ...statusSegments].join(
            theme.fg("dim", SEPARATOR),
          );

          const pad = " ".repeat(
            Math.max(1, width - visibleWidth(left) - visibleWidth(right)),
          );
          return [truncateToWidth(left + pad + right, width)];
        },
      };
    });
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setFooter(undefined);
  });
}
