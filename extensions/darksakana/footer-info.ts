/**
 * dark-sakana footer: left = folder | git repo,
 * right = context gauge | token totals | cache hit rate.
 * Plus a model hint line (row 1, directly below the input box):
 *   [thinking] model ──pad── 🔌 MCP: <n> | ● <PI-spawned processes>
 * via ctx.ui.setWidget(..., { placement: "belowEditor" }).
 *
 * Replaces the built-in footer via ctx.ui.setFooter().
 *
 * - Thinking level: [OFF]/[MIN]/[LOW]/[MED]/[HIGH]/[XHIGH]/[MAX], tinted with
 *   the theme's thinking* tokens.
 * - Context: 10-cell gauge + percent/context-window from ctx.getContextUsage()
 *   and ctx.model.contextWindow; tier-colored (warning >= 70%, error >= 90%).
 * - Tokens: accumulated input/output across the session (assistant usage).
 * - Cache hit rate: latest assistant usage cacheRead / (input + cacheRead + cacheWrite).
 * - MCP services: pi-mcp-adapter's "mcp" status compacted to "🔌 MCP: <connected>" on row 1 (accent).
 *
 * Colors come from the active theme (dark-sakana by default) through theme.fg(...).
 */
import { homedir } from "node:os";
import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { Text, stripTerminalSequences, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ReadonlyFooterDataProvider, Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
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

/** Status keys hidden from the footer. "mcp" moved to the model hint line (row 1). */
const HIDDEN_STATUS_KEYS: readonly string[] = ["pi-cache-stats", "mcp"];

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

/**
 * Compact pi-mcp-adapter footer status (key "mcp") into a short label:
 *   "🔌 MCP: 4 servers enabled (3 connected) (1 disabled)" → "🔌 MCP: 3"
 *   "MCP: 3 servers enabled" (no connections yet)         → "🔌 MCP: 3"
 *   "MCP 3/4" (the adapter's own compact mode)            → "🔌 MCP: 3"
 * Transient texts like "connecting to 2 servers..." are returned unchanged.
 * The adapter pre-colors the status with ANSI, so strip it before parsing.
 */
function compactMcpStatus(text: string): string {
  const plain = stripTerminalSequences(text);
  // "(3 connected)" → connected count (most informative when present)
  let count = plain.match(/\((\d+)\s+connected\)/)?.[1];
  // the adapter's own compact mode: "MCP 3/4" → connected count
  if (count === undefined) count = plain.match(/MCP\s+(\d+)\s*\/\s*\d+/)?.[1];
  // full mode without connections: "MCP: 3 servers enabled" → enabled count
  if (count === undefined) count = plain.match(/MCP[:]?\s+(\d+)\s+servers?\s+enabled/i)?.[1];
  // transient statuses ("connecting to N servers...") stay verbatim
  if (count === undefined) return text;
  return `🔌 MCP: ${count}`;
}

// ─── live process count (background terminals PI has spawned) ──────────────
let lastProcessCount: number | null = null;
let lastProcessCountAt = 0;
const PROCESS_COUNT_THROTTLE_MS = 1000;

/**
 * Number of living descendant processes of the current pi process (the
 * terminal/shell processes PI has spawned that are still running). Computed
 * from a throttled `ps` snapshot (1s), skipping zombies and excluding the
 * transient `ps` we spawn for the snapshot. Returns null when ps is unavailable.
 */
function countLivingDescendants(): number | null {
  const now = Date.now();
  if (lastProcessCount !== null && now - lastProcessCountAt < PROCESS_COUNT_THROTTLE_MS) {
    return lastProcessCount;
  }
  let count: number | null = null;
  try {
    const result = spawnSync("ps", ["-eo", "pid=,ppid=,stat="], { encoding: "utf8" });
    if (result.status === 0 && result.stdout) {
      const children = new Map<string, string[]>();
      const statMap = new Map<string, string>();
      for (const line of result.stdout.split("\n")) {
        const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)(?:\s|$)/);
        if (!m) continue;
        const [, pid, ppid, stat] = m;
        statMap.set(pid, stat);
        const list = children.get(ppid);
        if (list) list.push(pid);
        else children.set(ppid, [pid]);
      }
      children.delete(String(result.pid)); // don't count the ps we just spawned
      const stack = children.get(String(process.pid)) ?? [];
      const seen = new Set(stack);
      let n = 0;
      while (stack.length > 0) {
        const pid = stack.pop()!;
        const stat = statMap.get(pid) ?? "";
        if (stat && !stat.includes("Z")) n++; // skip zombies/defunct
        for (const c of children.get(pid) ?? []) {
          if (!seen.has(c)) { seen.add(c); stack.push(c); }
        }
      }
      count = n;
    }
  } catch {
    count = null;
  }
  lastProcessCount = count;
  lastProcessCountAt = now;
  return count;
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

    // ── model hint line (row 1, below the input box) ───────────────────
    // A single row directly under the editor's bottom border (above the
    // footer), via the public ctx.ui.setWidget(..., { placement: "belowEditor" })
    // API — no PI source modification required. Row 1 layout:
    //   [thinking] model  ──pad──  🔌 MCP: <n> | ● <live processes>
    // MCP is shown here (not in the footer) and the live-process count is
    // the number of terminal/shell processes PI has spawned (throttled ps).
    // A padding-0 Text keeps the row flush with the left edge.
    const hintKey = "dark-sakana-model-hint";
    let lastHintText: string | undefined;
    const refreshModelHint = (theme: Theme, width: number, footerData: ReadonlyFooterDataProvider) => {
      const level: ThinkingLevel = ctx.thinkingLevel ?? "off";
      const model = ctx.model?.id ?? "no model";
      const left =
        theme.fg(THINKING_COLORS[level], `[${THINKING_LABELS[level]}]`) +
        " " +
        theme.fg("accent", truncateToWidth(model, 24));

      // ── right: MCP (moved here from the footer) + live terminal count ──
      const rightParts: string[] = [];
      const rawMcp = footerData.getExtensionStatuses().get("mcp");
      if (rawMcp !== undefined && rawMcp !== "") {
        rightParts.push(theme.fg("accent", compactMcpStatus(rawMcp)));
      }
      const processCount = countLivingDescendants();
      rightParts.push(theme.fg("muted", `● ${processCount === null ? "?" : processCount}`));
      const right = rightParts.join(theme.fg("dim", SEPARATOR));

      const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
      const text = truncateToWidth(left + pad + right, width);
      if (text !== lastHintText) {
        lastHintText = text;
        ctx.ui.setWidget(hintKey, (tui, t) => new Text(text, 0, 0), { placement: "belowEditor" });
      }
    };

    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsubBranch = footerData.onBranchChange(() => tui.requestRender());
      requestRender = () => tui.requestRender();

      return {
        dispose() {
          unsubBranch();
          ctx.ui.setWidget(hintKey, undefined);
          requestRender = undefined;
        },
        invalidate() {},
        render(width: number): string[] {
          // Keep the hint line in sync with the current model/thinking/theme/MCP.
          refreshModelHint(theme, width, footerData);
          // ── left: folder | git repo (model + thinking live on the hint ─
          //    line below the input box instead) ────────────────────────
          const branch = footerData.getGitBranch();
          const git =
            branch === null ? "no git" : branch === "detached" ? "detached" : branch;

          const left =
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
