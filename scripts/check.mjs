/**
 * Package check for pi-darksakana.
 *
 * Validates the manifest, both theme files, both extension packs, the config
 * samples and the documented "one pack at a time" contract. Run with:
 *
 *   npm run check
 */
import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path, encoding = "utf8") => readFile(resolve(root, path), encoding);

const manifest = JSON.parse(await read("package.json"));
assert.equal(manifest.name, "pi-darksakana");
assert.equal(manifest.keywords.includes("pi-package"), true);
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);

// ── manifest resources must exist on disk ───────────────────────────────────
const isGlob = (pattern) => /[*?[]/.test(pattern);

// Extension entry points are declared explicitly — each must resolve.
for (const path of manifest.pi.extensions) {
	assert.equal(isGlob(path), false, `declare extension entry points explicitly: ${path}`);
	await access(resolve(root, path));
}
assert.equal(manifest.pi.extensions.length, 6);

// Themes are declared as a glob; expand it the way Pi's discovery does.
assert.equal(manifest.pi.themes.length, 1, "themes are declared as a single glob");
const themeGlob = manifest.pi.themes[0];
assert.match(themeGlob, /^\.\/themes\//, "theme glob must stay inside themes/");
const themePattern = themeGlob.replace(/^.*\//, "");
const themeMatcher = new RegExp(`^${themePattern.replace(/\./g, "\\.").replace(/\*/g, ".*")}$`);
// ── themes ──────────────────────────────────────────────────────────────────
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

const themeFiles = (await readdir(resolve(root, "themes")))
	.filter((file) => themeMatcher.test(file))
	.sort();
assert.deepEqual(themeFiles, ["dark-sakana.json", "violet-cyberdeck.json"], `theme glob ${themeGlob} did not match the shipped themes`);

const themes = new Map();
for (const file of themeFiles) {
	const theme = JSON.parse(await read(`themes/${file}`));
	assert.equal(theme.name, file.replace(/\.json$/, ""), `theme name must match file name: ${file}`);
	assert.ok(theme.colors, `${file} has no colors block`);
	for (const color of requiredColors) {
		assert.ok(color in theme.colors, `${file} is missing theme color: ${color}`);
	}
	// Every color value must resolve: a hex literal or a declared var.
	const vars = theme.vars ?? {};
	for (const [key, value] of Object.entries(theme.colors)) {
		if (value === "") continue; // "" means "inherit / no background"
		assert.ok(
			typeof value === "string" && (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) || value in vars),
			`${file}: color "${key}" points at undeclared var "${value}"`,
		);
	}
	assert.ok(theme.export, `${file} is missing the export block used by /export`);
	themes.set(theme.name, theme);
}

// ── violet-cyberdeck palette guard ──────────────────────────────────────────
// The fork ships a violet palette. Catch a stray pink/peach literal sneaking
// back in — in the theme or anywhere in the cyberdeck extension pack.
const violetTheme = themes.get("violet-cyberdeck");
for (const name of ["violet", "lilac", "lavender", "periwinkle"]) {
	assert.ok(name in violetTheme.vars, `missing theme var: ${name}`);
}
assert.equal(violetTheme.vars.violet, "#B79CF0");

const bannedPink = ["#F2A7C6", "#FCC9B9", "#EFC3E6", "#F6BC9A", "#C7B8F5", "#9FD3F2", "#FF8FA3"];
const themeSource = await read("themes/violet-cyberdeck.json");
for (const hex of bannedPink) {
	assert.equal(themeSource.includes(hex), false, `pink palette literal ${hex} came back in the theme`);
}

// ── cyberdeck pack contracts ────────────────────────────────────────────────
const cyberdeckSource = async (path) => read(`extensions/cyberdeck/${path}`);
const allCyberdeckSources = await Promise.all(
	["header/index.ts", "matrix/index.ts", "zentui/index.ts", "claude-shimmer/index.ts"].map(cyberdeckSource),
);
for (const hex of bannedPink) {
	assert.equal(
		allCyberdeckSources.some((source) => source.includes(hex)),
		false,
		`pink palette literal ${hex} came back in the cyberdeck extensions`,
	);
}

// The editorBorder sentinel is a user-facing config value and must stay stable.
const gradientSource = await cyberdeckSource("zentui/gradient.ts");
assert.match(gradientSource, /SAKURA_MACARON_GRADIENT = "sakura-macaron-gradient"/);

// Fixed-editor regression: when the pinned cluster shrinks, rows above its new
// start belong to the transcript. paintCluster runs after transcript output and
// must not clear them.
const compositor = await cyberdeckSource("zentui/fixed-editor/compositor.ts");
assert.match(compositor, /const clearStart = startRow;/);
assert.doesNotMatch(compositor, /const clearStart = previous \? Math\.min\(previous\.startRow, startRow\)/);
const previousCluster = { startRow: 34, lineCount: 7 };
const nextCluster = { startRow: 37, lineCount: 4 };
const clearEnd = Math.max(
	previousCluster.startRow + previousCluster.lineCount - 1,
	nextCluster.startRow + nextCluster.lineCount - 1,
);
const postPaintClears = Array.from(
	{ length: clearEnd - nextCluster.startRow + 1 },
	(_, index) => nextCluster.startRow + index,
);
assert.deepEqual(postPaintClears, [37, 38, 39, 40]);
assert.equal(postPaintClears.some((row) => row >= 34 && row <= 36), false);

// Mouse ownership: transcript events stay in the compositor; fresh cluster
// clicks pass through to below-editor widgets.
assert.match(compositor, /mouseEv && this\.handleMouseEvent\(mouseEv\)/);
assert.match(compositor, /if \(!this\.selection\.isDragging\) return false;/);

// HUD keeps one useful clock: total turn time, not a transient thought timer.
const shimmer = await cyberdeckSource("claude-shimmer/index.ts");
assert.doesNotMatch(shimmer, /thinkingDuration|THOUGHT_DISPLAY_MS|thoughtTimer/);
assert.match(shimmer, /parts\.push\(rgbAnsi\(MUTED, formatDigital\(elapsed\)\)\)/);

// Pi 0.84+: the fixed editor must stay off by default and hard-block native
// sticky TUI layouts (it patches private TUI APIs).
const zentuiConfig = await cyberdeckSource("zentui/config.ts");
assert.match(zentuiConfig, /fixedEditor:\s*\{\s*\/\/[\s\S]*?enabled:\s*false|fixedEditor:\s*\{\s*enabled:\s*false/);
const fixedEditorIndex = await cyberdeckSource("zentui/fixed-editor/index.ts");
assert.match(fixedEditorIndex, /function isNativeStickyEditorPi/);
assert.match(fixedEditorIndex, /Hard block on Pi 0\.84\+/);
assert.match(fixedEditorIndex, /if \(isNativeStickyEditorPi\(tui\)\)/);

// ── dark-sakana pack contracts ──────────────────────────────────────────────
// Footer: full footer replacement with folder/git on the left and
// context/tokens/cache on the right, plus the model hint line below the editor.
const footer = await read("extensions/darksakana/footer-info.ts");
assert.match(footer, /ctx\.ui\.setFooter/);
assert.match(footer, /footerData\.getGitBranch\(\)/);
assert.match(footer, /footerData\.onBranchChange/);
assert.match(footer, /ctx\.model\?\.id/);
assert.match(footer, /process\.cwd\(\)/);
assert.match(footer, /SEPARATOR/);
assert.match(footer, /ctx\.thinkingLevel/);
assert.match(footer, /THINKING_COLORS/);
assert.match(footer, /ctx\.getContextUsage\(\)/);
assert.match(footer, /contextWindow/);
assert.match(footer, /buildContextGauge/);
assert.match(footer, /cacheRead/);
assert.match(footer, /latestCacheHitRate/);
assert.match(footer, /model_select/);
assert.match(footer, /thinking_level_select/);
assert.match(footer, /message_end/);
// Colors stay theme-driven so the footer adapts to whichever theme is active.
assert.match(footer, /theme\.fg\(/);

// Header: installed on session_start, cleared on session_shutdown.
const startupHeader = await read("extensions/darksakana/startup-header.ts");
assert.match(startupHeader, /pi\.on\("session_start"/);
assert.match(startupHeader, /ctx\.ui\.setHeader/);
assert.match(startupHeader, /pi\.on\("session_shutdown"/);

// ── config samples ──────────────────────────────────────────────────────────
const configFiles = (await readdir(resolve(root, "config"))).filter((file) => file.endsWith(".json")).sort();
assert.deepEqual(configFiles, [
	"sakura-cyberdeck-matrix.json",
	"sakura-cyberdeck-zentui.json",
	"settings.snippet.json",
]);
for (const file of configFiles) JSON.parse(await read(`config/${file}`));

const snippet = JSON.parse(await read("config/settings.snippet.json"));
assert.equal(snippet.theme, "violet-cyberdeck");
assert.ok(Array.isArray(snippet.packages));
// The snippet is documented as secret-free: no keys, tokens or absolute paths.
for (const key of ["apiKey", "apiKeys", "providerKeys", "auth", "token"]) {
	assert.equal(key in snippet, false, `settings snippet must not carry "${key}"`);
}
assert.equal(JSON.stringify(snippet).includes("C:/Users"), false, "settings snippet must not carry absolute paths");

// ── mutex documentation guard ───────────────────────────────────────────────
// Both packs own the header/footer surfaces, so the README must say so and
// show how to narrow the package to a single pack.
const readme = await read("README.md");
assert.match(readme, /mutually exclusive|only one pack|one pack at a time/i);
assert.match(readme, /"extensions": \[/);
for (const file of themeFiles) {
	const name = file.replace(/\.json$/, "");
	assert.ok(readme.includes(name), `README must document theme ${name}`);
}

console.log(
	`OK: ${manifest.name} v${manifest.version} — ${themeFiles.length} themes ` +
		`(${themeFiles.join(", ")}), ${manifest.pi.extensions.length} extension entries, ${configFiles.length} config samples`,
);