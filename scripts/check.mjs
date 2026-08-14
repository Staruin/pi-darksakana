import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));

assert.equal(manifest.name, "pi-dark-sakana");
assert.equal(manifest.keywords.includes("pi-package"), true);

// Every declared resource must exist on disk.
for (const path of [...manifest.pi.extensions, ...manifest.pi.themes]) {
  await access(resolve(root, path));
}

// Theme must be the dark template under a new name, with all required tokens.
const theme = JSON.parse(await readFile(resolve(root, "themes/dark-sakana.json"), "utf8"));

const requiredColors = [
  "accent", "border", "borderAccent", "borderMuted", "success", "error", "warning",
  "muted", "dim", "text", "thinkingText", "selectedBg", "userMessageBg",
  "userMessageText", "customMessageBg", "customMessageText", "customMessageLabel",
  "toolPendingBg", "toolSuccessBg", "toolErrorBg", "toolTitle", "toolOutput", "mdHeading",
  "mdLink", "mdLinkUrl", "mdCode", "mdCodeBlock", "mdCodeBlockBorder", "mdQuote",
  "mdQuoteBorder", "mdHr", "mdListBullet", "toolDiffAdded", "toolDiffRemoved",
  "toolDiffContext", "syntaxComment", "syntaxKeyword", "syntaxFunction", "syntaxVariable",
  "syntaxString", "syntaxNumber", "syntaxType", "syntaxOperator", "syntaxPunctuation",
  "thinkingOff", "thinkingMinimal", "thinkingLow", "thinkingMedium", "thinkingHigh",
  "thinkingXhigh", "bashMode",
];

assert.equal(theme.name, "dark-sakana");
for (const color of requiredColors) assert.ok(color in theme.colors, `missing theme color: ${color}`);

// Footer contract: full footer replacement with model/folder/git + context/tokens/cache.
const footer = await readFile(resolve(root, "extensions/footer-info.ts"), "utf8");
assert.match(footer, /ctx\.ui\.setFooter/);
assert.match(footer, /footerData\.getGitBranch\(\)/);
assert.match(footer, /footerData\.onBranchChange/);
assert.match(footer, /ctx\.model\?\.id/);
assert.match(footer, /process\.cwd\(\)/);
assert.match(footer, /SEPARATOR/);
// Left: thinking level chip + model
assert.match(footer, /ctx\.thinkingLevel/);
assert.match(footer, /THINKING_COLORS/);
// Right: context gauge, token totals, cache hit rate
assert.match(footer, /ctx\.getContextUsage\(\)/);
assert.match(footer, /contextWindow/);
assert.match(footer, /buildContextGauge/);
assert.match(footer, /cacheRead/);
assert.match(footer, /latestCacheHitRate/);
// Live refresh wiring
assert.match(footer, /model_select/);
assert.match(footer, /thinking_level_select/);
assert.match(footer, /message_end/);

console.log(`OK: ${manifest.name} v${manifest.version} — ${manifest.pi.themes.length} theme(s), ${manifest.pi.extensions.length} extension(s)`);
