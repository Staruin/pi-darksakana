/**
 * Dev-only smoke test: loads footer-info.ts with mocked pi/ctx/theme and
 * renders one footer line so layout/formatting regressions surface without
 * launching the TUI.
 *
 * Run: node --experimental-strip-types scripts/smoke-render.mjs
 */
import assert from "node:assert/strict";

const { default: extension } = await import("../extensions/footer-info.ts");

// ── mock pi ────────────────────────────────────────────────────────────────
const handlers = new Map();
const pi = {
  on(event, handler) {
    handlers.set(event, handler);
  },
};
extension(pi);

// ── mock session_start → capture footer factory ─────────────────────────────
// NOTE: render() closes over THIS ctx object, so all mocks live on it.
// Real truncateToWidth ignores ANSI escapes; mock theme.fg must emit valid
// escapes so width math matches production. Colors are recorded for tier checks,
// and widget setWidget calls are recorded for the hint-line assertions.
const colorCalls = [];
const widgetCalls = [];
const theme = {
  fg: (color, text) => {
    colorCalls.push(color);
    return `\x1b[38;5;0m${text}\x1b[0m`;
  },
};
const ctx = {
  hasUI: true,
  model: { id: "[OCG]/deepseek-v4-flash", contextWindow: 128_000 },
  thinkingLevel: "high",
  getContextUsage: () => ({ tokens: 15_360, contextWindow: 128_000, percent: 12 }),
  sessionManager: {
    getBranch: () => [
      { type: "message", message: { role: "user", content: "hi" } },
      {
        type: "message",
        message: {
          role: "assistant",
          usage: {
            input: 8_000,
            output: 150,
            cacheRead: 64_000,
            cacheWrite: 2_000,
            cost: { total: 0.01 },
          },
        },
      },
    ],
  },
  ui: {
    theme,
    setFooter(factory) {
      footerFactory = factory;
    },
    setWidget(key, content, options) {
      let forAssert = content;
      if (typeof content === "function") {
        forAssert = content({}, theme); // materialize factory → Text component
      }
      widgetCalls.push({ key, content, options, forAssert });
    },
  },
};

let footerFactory;
handlers.get("session_start")({}, ctx);
assert.equal(typeof footerFactory, "function", "setFooter factory not captured");


const tui = { requestRender() {} };
const footerData = {
  getGitBranch: () => "main",
  onBranchChange: () => () => {},
  getExtensionStatuses: () =>
    new Map([
      // real observed pi-mcp-adapter status (no connections yet): accent pre-coloring
      ["mcp", theme.fg("accent", "MCP: 3 servers enabled")],
      ["quota", "Codex 36%"],
      ["pi-cache-stats", "· DS 70/70·4.07M/4.12M 98.9% ⚠️ compat"],
    ]),
};

const component = footerFactory(tui, theme, footerData);
const lines = component.render(140);
const plain = lines[0].replace(/\x1b\[[0-9;]*m/g, "");

// ── model hint line (setWidget, placement belowEditor) ──────────────────────
const hintCalls = widgetCalls.filter((c) => c.key === "dark-sakana-model-hint");
assert.ok(hintCalls.length >= 1, "setWidget called for the model hint line");
assert.equal(hintCalls[0].options?.placement, "belowEditor", "hint placed below the editor");
const hintText = (call) => {
  const c = call.forAssert;
  if (Array.isArray(c)) return String(c[0] ?? "").replace(/\x1b\[[0-9;]*m/g, "");
  return String(c?.render?.(140)?.[0] ?? "").replace(/\x1b\[[0-9;]*m/g, "");
};
const hintPlain = hintText(hintCalls[0]);
assert.match(hintPlain, /^\[HIGH\]/, "hint is flush-left and starts with thinking chip");
assert.match(hintPlain, /\[OCG\]\/deepseek-v4-flash/, "hint contains model id");
assert.match(hintPlain, /🔌 MCP: 3/, "hint contains compacted MCP");
assert.match(hintPlain, /●\s*\d+/, "hint shows live PI-spawned process count");

console.log(`render(${140}) ->`);
console.log(lines[0]);
console.log("plain  ->", plain);

// ── assertions on the plain text ───────────────────────────────────────────
assert.doesNotMatch(plain, /\[HIGH\]/, "thinking chip moved off the footer");
assert.doesNotMatch(plain, /\[OCG\]\/deepseek-v4-flash/, "model id moved off the footer");
const folder = process.cwd().split(/[\\/]/).filter(Boolean).at(-1);
assert.match(plain, new RegExp(`${folder} \\| main`), "folder + git");
assert.match(plain, /\[█.*░\] 12%\/128k/, "context gauge + label");
assert.match(plain, /↑8\.0k ↓150/, "token totals");
assert.match(plain, /cache 86%/, "cache hit rate");
assert.doesNotMatch(plain, /🔌 MCP/, "mcp moved off the footer onto the hint line");
assert.doesNotMatch(plain, /servers enabled/, "mcp full text dropped");
assert.match(plain, /Codex 36%/, "extension status right side");
assert.doesNotMatch(plain, /DS/, "pi-cache-stats hidden from footer");
assert.doesNotMatch(plain, /4\.07M/, "cache-optimizer counters dropped");
// ── statuses-only case: no usage entries ───────────────────────────────────
ctx.sessionManager.getBranch = () => [
  { type: "message", message: { role: "user", content: "hi" } },
];
const line2 = component.render(140)[0].replace(/\x1b\[[0-9;]*m/g, "");
assert.match(line2, /↑0 ↓0/, "empty totals");
assert.match(line2, /cache --/, "no cache data");

// ── context tier: high percent → warning color used ────────────────────────
ctx.getContextUsage = () => ({ tokens: 100_000, contextWindow: 128_000, percent: 78 });
ctx.thinkingLevel = "max";
colorCalls.length = 0;
const line3 = component.render(140)[0];
assert.ok(colorCalls.includes("warning"), `expected warning tier color, got calls: ${colorCalls.join(",")}`);
assert.doesNotMatch(line3, /MAX/, "thinking chip stays off the footer (on hint line)");
// hint line resyncs to the new thinking level
const latestHint = widgetCalls.filter((c) => c.key === "dark-sakana-model-hint").at(-1);
const latestHintPlain = hintText(latestHint);
assert.ok(latestHintPlain.startsWith("[MAX]"), "hint line resyncs to new thinking level");
console.log("\nAll smoke assertions passed ✅");
