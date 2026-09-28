/**
 * Truecolor preview of this pack's startup header and footer, rendered with the
 * same math the extensions use. Handy for iterating on the palette without
 * restarting Pi.
 *
 *   node scripts/preview.mjs          # header + footer
 *   node scripts/preview.mjs header   # header only
 *   node scripts/preview.mjs footer   # footer only
 */
const RESET = "\x1b[0m";
const fg = (rgb, text, bold = false) =>
	`\x1b[${bold ? "1;" : ""}38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}\x1b[${bold ? "22;" : ""}39m`;
const mix = (a, b, t) => {
	const k = Math.max(0, Math.min(1, t));
	return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k));
};
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const wide = (s) => [...strip(s)].length;

// ── palette (mirrors themes/violet-cyberdeck.json + zentui gradient stops) ──
const VIOLET = [183, 156, 240];
const VIOLET_IRO = [201, 174, 245];
const LILAC = [216, 194, 245];
const LAVENDER = [159, 134, 232];
const PERIWINKLE = [148, 169, 240];
const APRICOT = [232, 168, 124];
const MINT = [143, 224, 188];
const BUTTER = [233, 207, 126];
const ROSE = [232, 99, 127];
const MUTED = [167, 155, 184];
const DIM = [110, 103, 120];
const STOP_5 = [VIOLET, VIOLET_IRO, LILAC, LAVENDER, PERIWINKLE];

function sampleStops(stops, position, phase = 0) {
	let n = Math.max(0, Math.min(1, position));
	if (phase !== 0) n = (((n + phase) % 1) + 1) % 1;
	const scaled = n * (stops.length - 1);
	const i = Math.min(stops.length - 2, Math.floor(scaled));
	return mix(stops[i], stops[i + 1] ?? stops[i], scaled - i);
}
function gradient(text, from, to, bold = false) {
	const chars = [...text];
	const span = Math.max(1, chars.length - 1);
	return chars.map((c, i) => (c === " " ? c : fg(mix(from, to, i / span), c, bold))).join("");
}

// ── header (mirrors extensions/header/index.ts) ────────────────────────────
const PI_ART = [
	"██████╗ ██╗",
	"██╔══██╗██║",
	"██████╔╝██║",
	"██╔═══╝ ██║",
	"██║     ██║",
	"╚═╝     ╚═╝",
];
function header(width = 100) {
	const telemetry = "◈  PI CYBERDECK  ◈";
	const artWidth = Math.min(width, Math.max(...PI_ART.map(wide)));
	const tWidth = wide(telemetry);
	const railWidth = Math.max(1, Math.min(width, Math.max(artWidth, tWidth)));
	const artPad = " ".repeat(Math.max(0, Math.floor((width - artWidth) / 2)));
	const railPad = " ".repeat(Math.max(0, Math.floor((width - railWidth) / 2)));
	const telPad = " ".repeat(Math.max(0, Math.floor((width - tWidth) / 2)));
	return [
		"",
		...PI_ART.map((l) => artPad + gradient(l, VIOLET, PERIWINKLE)),
		"",
		railPad + gradient("━".repeat(railWidth), VIOLET, PERIWINKLE),
		telPad + gradient(telemetry, LILAC, PERIWINKLE, true),
		"",
	];
}

// ── footer (mirrors extensions/zentui/footer.ts with default config) ───────
function gauge(percent, width = 10, phase = 0) {
	const tier = percent >= 90 ? "error" : percent >= 70 ? "warning" : "normal";
	const lit = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width);
	let out = "";
	for (let i = 0; i < width; i++) {
		if (i < lit) {
			let base;
			if (tier === "warning")
				base = BUTTER;
			else if (tier === "error") base = ROSE;
			else base = sampleStops(STOP_5, i / Math.max(1, lit - 1), phase * 0.2);
			const wave = 0.5 + 0.5 * Math.sin((i / width + phase) * Math.PI * 2);
			out += fg(mix(base, [253, 251, 255], wave * 0.15), "█");
		} else {
			out += fg([168, 158, 184], "░");
		}
	}
	return out;
}
function footer({ width = 110, pct = 42, git = "[!?+]", phase = 0 } = {}) {
	const tier = pct >= 90 ? "error" : pct >= 70 ? "warning" : "normal";
	const ctxColor = tier === "error" ? ROSE : tier === "warning" ? BUTTER : PERIWINKLE;
	const sep = fg(DIM, " › ");
	const left =
		gradient("\uf17a", VIOLET, PERIWINKLE, false) +
		"  " +
		gradient("pi-darksakana", VIOLET, PERIWINKLE, false) +
		"  on " +
		fg(LAVENDER, "\uf418") +
		" " +
		fg(LAVENDER, "main", true) +
		(git ? " " + fg(APRICOT, git, true) : "") +
		"  " +
		fg(PERIWINKLE, "via") +
		" " +
		fg(MINT, "node 24.20");
	const right =
		"[" + gauge(pct, 10, phase) + "] " + fg(ctxColor, `${Math.round(pct)}%/200k`, tier !== "normal") +
		"  " + fg(MUTED, "↑12.3k ↓4.5k") +
		"  " + fg(APRICOT, "$0.06");
	const gap = " ".repeat(Math.max(1, width - 2 - wide(left) - wide(right)));
	return " " + left + gap + right + " ";
}

// ── demo ───────────────────────────────────────────────────────────────────
const mode = process.argv[2];
const label = (t) => `\n\x1b[2m── ${t} ${"─".repeat(Math.max(0, 60 - t.length))}\x1b[0m`;

if (mode !== "footer") {
	console.log(label("startup header (width 100)"));
	for (const line of header(100)) console.log(line);
	console.log(label("startup header, narrow terminal (width 20)"));
	for (const line of header(20)) console.log(line);
}
if (mode !== "header") {
	console.log(label("footer — normal (<70%)"));
	console.log(footer({ pct: 42 }));
	console.log(label("footer — warning (70-89%)"));
	console.log(footer({ pct: 78 }));
	console.log(label("footer — error (>=90%)"));
	console.log(footer({ pct: 96 }));
	console.log(label("footer — pulse frames"));
	for (const phase of [0, 0.25, 0.5, 0.75]) console.log(footer({ pct: 55, phase }));
}
console.log();
