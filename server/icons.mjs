// Иконки и эмодзи в спеках. Плагин Figma сети не имеет, поэтому библиотеку
// Lucide держит сервер: узел {"type":"icon","icon":"arrow-right"} получает
// готовую SVG-разметку до отправки в плагин. Эмодзи в дизайне запрещены —
// вычищаем их из текстов, чтобы вместо них стояли SVG-иконки.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSetQuery, setIconName, setIconSvg } from "./icon-sets.mjs";

let cache = null;

// Lucide лежит одним файлом icons/lucide.json (собирается scripts/build-icons.mjs):
// svg по имени и теги для нечёткого поиска.
function library() {
	if (cache) return cache;
	cache = { svgs: {}, names: new Set(), tags: new Map() };
	try {
		const file = join(dirname(fileURLToPath(import.meta.url)), "icons", "lucide.json");
		const data = JSON.parse(readFileSync(file, "utf-8"));
		cache.svgs = data.icons || {};
		cache.names = new Set(Object.keys(cache.svgs));
		for (const [name, list] of Object.entries(data.tags || {})) {
			for (const tag of list) {
				const key = String(tag).toLowerCase();
				if (!cache.tags.has(key)) cache.tags.set(key, []);
				cache.tags.get(key).push(name);
			}
		}
	} catch {
		/* icons/lucide.json нет — иконки по имени недоступны (npm run build:icons) */
	}
	return cache;
}

export function iconNames() {
	return [...library().names];
}

// "lucide:Arrow Right" / "ArrowRight" -> "arrow-right".
function normalize(name) {
	return String(name)
		.trim()
		.replace(/^lucide[:/]/i, "")
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.toLowerCase()
		.replace(/[\s_]+/g, "-");
}

// Имя иконки по запросу модели: точное совпадение, затем тег, затем
// ближайшее по началу/вхождению. null — ничего похожего нет.
export function resolveIconName(query) {
	// Префикс набора (ph:, tabler:) — ищем только внутри него.
	if (parseSetQuery(query)) return setIconName(query);
	const lib = library();
	if (!lib.names.size) return null;
	const name = normalize(query);
	if (lib.names.has(name)) return name;
	const byTag = lib.tags.get(name.replace(/-/g, " ")) || lib.tags.get(name);
	if (byTag?.length) return byTag.find((n) => lib.names.has(n)) || null;
	const all = [...lib.names];
	const starts = all.filter((n) => n.startsWith(name));
	const contains = all.filter((n) => n.includes(name));
	const pool = starts.length ? starts : contains;
	return pool.sort((a, b) => a.length - b.length)[0] || null;
}

export function iconSvg(query) {
	if (parseSetQuery(query)) return setIconSvg(query);
	const name = resolveIconName(query);
	return (name && library().svgs[name]) || null;
}

const px = (v) => (typeof v === "number" && v > 0 ? String(Math.round(v * 100) / 100) : null);

// Приводит SVG к нужному виду: убирает комментарии, красит currentColor,
// выставляет размер и толщину линии. Размер задаём в самой разметке —
// ресайз готового фрейма в Figma не масштабирует векторы внутри.
export function tuneSvg(svg, { w, h, color, strokeWidth } = {}) {
	let out = String(svg).replace(/<!--[\s\S]*?-->/g, "").trim();
	const tint = typeof color === "string" && color.trim() ? color.trim() : "#000000";
	out = out.replace(/currentColor/gi, tint);
	const width = px(w) ?? px(h);
	const height = px(h) ?? px(w);
	out = out.replace(/<svg\b[^>]*>/i, (tag) => {
		let t = tag;
		if (width) {
			t = /\swidth="/i.test(t)
				? t.replace(/\swidth="[^"]*"/i, ` width="${width}"`)
				: t.replace(/<svg/i, `<svg width="${width}"`);
		}
		if (height) {
			t = /\sheight="/i.test(t)
				? t.replace(/\sheight="[^"]*"/i, ` height="${height}"`)
				: t.replace(/<svg/i, `<svg height="${height}"`);
		}
		if (typeof strokeWidth === "number" && strokeWidth > 0) {
			t = /\sstroke-width="/i.test(t)
				? t.replace(/\sstroke-width="[^"]*"/i, ` stroke-width="${strokeWidth}"`)
				: t;
		}
		return t;
	});
	return out;
}

// Эмодзи и их служебные символы (селекторы, ZWJ, keycap, флаги). ©, ®, ™ и
// стрелки не трогаем — это обычная типографика, не иконки.
const EMOJI =
	/[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}\u{2B05}-\u{2B07}\u{231A}\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{FE0F}\u{200D}\u{20E3}]/gu;

export function stripEmoji(text) {
	return String(text)
		.replace(EMOJI, "")
		.replace(/[ \t]{2,}/g, " ")
		.replace(/^[ \t]+|[ \t]+$/gm, "");
}

// Обходит спеку/правки: иконки по имени получают svg, SVG от модели
// тюнится, эмодзи из текстов удаляются. Мутирует value, возвращает отчёт.
export function processDesign(value) {
	const report = { icons: 0, unresolved: [], emojiStripped: 0 };
	const walk = (node) => {
		if (Array.isArray(node)) {
			for (const item of node) walk(item);
			return;
		}
		if (!node || typeof node !== "object") return;
		if (node.type === "icon") {
			const opts = {
				w: typeof node.w === "number" ? node.w : 24,
				h: typeof node.h === "number" ? node.h : typeof node.w === "number" ? node.w : 24,
				color: node.color,
				strokeWidth: node.strokeWidth,
			};
			if (typeof node.icon === "string" && node.icon.trim()) {
				const svg = iconSvg(node.icon);
				if (svg) {
					node.svg = tuneSvg(svg, opts);
					report.icons++;
					// Набор иконки — lint следит, чтобы в макете он был один.
					node.meta = { ...(node.meta || {}), iconSet: parseSetQuery(node.icon)?.set ?? "lucide" };
					if (typeof node.name !== "string" || !node.name) {
						node.name = resolveIconName(node.icon) || node.icon;
					}
				} else {
					report.unresolved.push(node.icon);
				}
			} else if (typeof node.svg === "string") {
				node.svg = tuneSvg(node.svg, opts);
			}
			if (typeof node.w !== "number") node.w = opts.w;
			if (typeof node.h !== "number") node.h = opts.h;
		}
		for (const key of ["text", "label"]) {
			if (typeof node[key] === "string") {
				const clean = stripEmoji(node[key]);
				if (clean !== node[key]) {
					report.emojiStripped++;
					node[key] = clean;
				}
			}
		}
		for (const child of Object.values(node)) {
			if (child && typeof child === "object") walk(child);
		}
	};
	walk(value);
	return report;
}

// Поиск имён иконок по слову: точное имя, теги, вхождения. До limit штук.
export function searchIcons(query, limit = 20) {
	const lib = library();
	const q = normalize(query);
	if (!q || !lib.names.size) return [];
	const out = new Set();
	if (lib.names.has(q)) out.add(q);
	for (const n of lib.tags.get(q.replace(/-/g, " ")) || lib.tags.get(q) || []) if (lib.names.has(n)) out.add(n);
	const all = [...lib.names].sort((a, b) => a.length - b.length);
	for (const n of all) if (n.startsWith(q)) out.add(n);
	for (const n of all) if (n.includes(q)) out.add(n);
	return [...out].slice(0, limit);
}
