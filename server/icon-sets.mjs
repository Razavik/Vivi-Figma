// Дополнительные наборы иконок: Phosphor ("ph:heart", "ph:heart:fill"),
// Tabler ("tabler:heart", "tabler:heart:filled") и Material Symbols
// ("ms:home", "ms:home:rounded", "ms:home:fill"). Без префикса — Lucide
// (icons.mjs). Индексы имён строятся лениво.
import { fileURLToPath } from "node:url";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const PH_STYLES = ["regular", "thin", "light", "bold", "fill", "duotone"];
export const TABLER_STYLES = ["outline", "filled"];
// Material Symbols: начертание + заливка; "fill" = outlined + заливка.
export const MS_STYLES = ["outlined", "rounded", "sharp", "fill", "rounded-fill", "sharp-fill"];

const SETS = {
	ph: { styles: PH_STYLES, plain: "regular" },
	tabler: { styles: TABLER_STYLES, plain: "outline" },
	ms: { styles: MS_STYLES, plain: "outlined" },
};
const ALIAS = { phosphor: "ph", material: "ms", tabler: "tabler", ph: "ph", ms: "ms" };

// "ph:Heart:fill" → { set: "ph", name: "heart", style: "fill" }; нет префикса → null.
export function parseSetQuery(query) {
	const m = /^\s*(ph|phosphor|tabler|ms|material)\s*[:/]\s*([^:]+?)(?:\s*:\s*([a-z-]+))?\s*$/i.exec(
		String(query),
	);
	if (!m) return null;
	const set = ALIAS[m[1].toLowerCase()];
	const name = m[2]
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.toLowerCase()
		.replace(/[\s_-]+/g, set === "ms" ? "_" : "-");
	const wanted = (m[3] || "").toLowerCase();
	const style = SETS[set].styles.includes(wanted) ? wanted : SETS[set].plain;
	return { set, name, style };
}

const cache = {};

// Пакеты закрывают package.json через exports — ищем папку напрямую.
const serverDir = dirname(fileURLToPath(import.meta.url));
function dirOf(pkg) {
	const dir = join(serverDir, "node_modules", pkg);
	return existsSync(dir) ? dir : null;
}

// Папка и суффикс файла для стиля набора.
function layout(set, style) {
	if (set === "ph") {
		const root = dirOf("@phosphor-icons/core");
		return root && { dir: join(root, "assets", style), suffix: style === "regular" ? "" : `-${style}` };
	}
	if (set === "tabler") {
		const root = dirOf("@tabler/icons");
		return root && { dir: join(root, "icons", style), suffix: "" };
	}
	const root = dirOf("@material-symbols/svg-400");
	if (!root) return null;
	const filled = style.endsWith("fill");
	const face = style === "fill" ? "outlined" : style.replace(/-fill$/, "");
	return { dir: join(root, face), suffix: filled ? "-fill" : "" };
}

// Каталог набора: { dir, names:Set } для стиля.
function catalog(set, style) {
	const key = `${set}:${style}`;
	if (cache[key]) return cache[key];
	const out = { dir: null, names: new Set(), suffix: "" };
	cache[key] = out;
	const lay = layout(set, style);
	if (!lay || !existsSync(lay.dir)) return out;
	out.dir = lay.dir;
	out.suffix = lay.suffix;
	for (const file of readdirSync(out.dir)) {
		if (!file.endsWith(".svg")) continue;
		const base = file.slice(0, -4);
		const isFill = set === "ms" && base.endsWith("-fill");
		// У Material заливочные файлы лежат рядом с обычными: берём нужный вид.
		if (set === "ms" && isFill !== (out.suffix === "-fill")) continue;
		out.names.add(out.suffix && base.endsWith(out.suffix) ? base.slice(0, -out.suffix.length) : base);
	}
	return out;
}

// Ближайшее имя внутри набора: точное → начинается → содержит (короче лучше).
export function resolveSetName(parsed) {
	const cat = catalog(parsed.set, parsed.style);
	if (!cat.names.size) return null;
	if (cat.names.has(parsed.name)) return parsed.name;
	const all = [...cat.names];
	const starts = all.filter((n) => n.startsWith(parsed.name));
	const pool = starts.length ? starts : all.filter((n) => n.includes(parsed.name));
	return pool.sort((a, b) => a.length - b.length)[0] || null;
}

// SVG иконки набора или null. У Tabler убираем служебный прозрачный контур
// «M0 0h24v24H0z» (в Figma он стал бы лишним невидимым вектором); у Material
// красим через currentColor, чтобы работало поле color.
export function setIconSvg(query) {
	const parsed = parseSetQuery(query);
	if (!parsed) return null;
	const name = resolveSetName(parsed);
	if (!name) return null;
	const cat = catalog(parsed.set, parsed.style);
	try {
		let svg = readFileSync(join(cat.dir, `${name}${cat.suffix}.svg`), "utf-8");
		svg = svg.replace(/<path[^>]*d="M0 0h24v24H0z"[^>]*\/>/g, "");
		svg = svg.replace(/\s*class="[^"]*"/g, "");
		if (parsed.set === "ms") svg = svg.replace("<svg ", '<svg fill="currentColor" ');
		return svg;
	} catch {
		return null;
	}
}

// Каноническое имя "ph:heart:fill" — для имени ноды и учёта набора.
export function setIconName(query) {
	const parsed = parseSetQuery(query);
	if (!parsed) return null;
	const name = resolveSetName(parsed);
	if (!name) return null;
	const plain = parsed.style === SETS[parsed.set].plain;
	return `${parsed.set}:${name}${plain ? "" : `:${parsed.style}`}`;
}
