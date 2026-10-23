// Описание дизайна для внешних агентов (MCP): компактный вывод, рамки нод
// относительно корня, свойства векторов, сводка токенов. Чистая логика над
// сериализованным деревом — проверяется тестами без Figma.
export type Spec = { [key: string]: unknown; id?: string; name?: string; type?: string; children?: Spec[] };

export interface NodeExtra {
	// [x, y, w, h] от левого верхнего угла запрошенного корня.
	box?: [number, number, number, number];
	// Свойства вектора/линии: заливка, обводка, поворот.
	vector?: Record<string, unknown>;
	// Имена привязанных переменных/стилей: {fill|color|stroke|textStyle: "green"}.
	vars?: Record<string, string>;
	// Ассет для экспорта: фото (png) или иконка (svg).
	asset?: { kind: "photo" | "icon"; format: "png" | "svg" };
	// Свойства экземпляра компонента и прототипные переходы.
	props?: Record<string, unknown>;
	reactions?: { trigger?: string; action?: string; to?: string }[];
}

// Значения по умолчанию, которые в выводе только шумят.
function isDefault(key: string, value: unknown, node: Spec): boolean {
	if (key === "padding") return Array.isArray(value) && value.every((v) => v === 0);
	if (key === "gap") return value === 0 || node.align === "space-between";
	if (key === "align" || key === "cross") return value === "start" || (node.type === "text" && value === "left");
	if (key === "fontWeight") return false;
	if (key === "textCase" || key === "textDecoration") return value === "none";
	if (key === "opacity") return value === 1;
	return false;
}

// Убирает значения по умолчанию и дубли «имя слоя = текст» (в name остаётся только осмысленное).
export function compactSpec<T extends Spec>(spec: T): T {
	const out: Spec = {};
	const soft = softText(spec);
	for (const [k, v] of Object.entries(spec)) {
		if (k === "children") continue;
		if (soft && k === "text") continue;
		if (isDefault(k, v, spec)) continue;
		if (k === "name" && spec.type === "text" && typeof spec.text === "string" && v === spec.text.replace(/\s+/g, " ").trim()) continue;
		out[k] = v;
	}
	if (soft) {
		out.text = soft.text;
		out.lines = soft.lines;
	}
	if (Array.isArray(spec.children)) out.children = spec.children.map((c) => compactSpec(c));
	return out as T;
}

// Перенос, поставленный дизайнером ради ширины блока, — не настоящий разрыв:
// склеиваем в пробел и сообщаем число строк в макете (lines). Абзацы без
// пробела перед переводом строки остаются как есть.
function softText(spec: Spec): { text: string; lines: number } | null {
	if (spec.type !== "text" || typeof spec.text !== "string" || Array.isArray(spec.spans)) return null;
	if (!/[ \t]\n/.test(spec.text)) return null;
	const lines = spec.text.split("\n").length;
	return { text: spec.text.replace(/[ \t]*\n/g, " ").replace(/ {2,}/g, " ").trim(), lines };
}

// Добавляет рамки и свойства векторов по id (extras строятся в плагине обходом нод).
export function mergeExtras<T extends Spec>(spec: T, extras: Map<string, NodeExtra>): T {
	const out: Spec = { ...spec };
	const extra = typeof spec.id === "string" ? extras.get(spec.id) : undefined;
	if (extra?.box) out.box = extra.box;
	if (extra?.vector) Object.assign(out, extra.vector);
	if (extra?.vars) out.vars = extra.vars;
	if (extra?.asset) out.asset = extra.asset;
	if (extra?.props) out.props = extra.props;
	if (extra?.reactions) out.reactions = extra.reactions;
	if (Array.isArray(spec.children)) out.children = spec.children.map((c) => mergeExtras(c, extras));
	return out as T;
}

// ── Токены ──────────────────────────────────────────────────────────────────
interface Count<T> {
	value: T;
	count: number;
}

function bump<T>(map: Map<string, Count<T>>, key: string, value: T): void {
	const item = map.get(key);
	if (item) item.count++;
	else map.set(key, { value, count: 1 });
}

const byCount = <T>(m: Map<string, Count<T>>, limit: number) =>
	[...m.values()].sort((a, b) => b.count - a.count).slice(0, limit);

export interface Tokens {
	colors: { hex: string; name?: string; count: number; usage: string[] }[];
	fonts: { family: string; weight: string; size: number; lineHeight?: number; textCase?: string; count: number }[];
	radius: { value: string | number; count: number }[];
	gap: { value: number; count: number }[];
	padding: { value: string; count: number }[];
	shadows: { value: string; count: number }[];
	nodes: number;
}

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

export function collectTokens(root: Spec, limit = 20): Tokens {
	const colors = new Map<string, { hex: string; name?: string; usage: Set<string>; count: number }>();
	const fonts = new Map<string, Count<Tokens["fonts"][number]>>();
	const radius = new Map<string, Count<string | number>>();
	const gap = new Map<string, Count<number>>();
	const padding = new Map<string, Count<string>>();
	const shadows = new Map<string, Count<string>>();
	let nodes = 0;
	const color = (v: unknown, usage: string, name?: string): void => {
		if (typeof v !== "string" || !HEX.test(v)) return;
		const hex = v.toLowerCase();
		const item = colors.get(hex) ?? { hex, usage: new Set<string>(), count: 0 };
		if (name && !item.name) item.name = name;
		item.count++;
		item.usage.add(usage);
		colors.set(hex, item);
	};
	const walk = (n: Spec): void => {
		nodes++;
		const vars = (n.vars ?? {}) as Record<string, string>;
		color(n.fill, "fill", vars.fill);
		color(n.color, "text", vars.color);
		color(n.stroke, "stroke", vars.stroke);
		if (n.type === "text" && typeof n.fontSize === "number") {
			const f = {
				family: String(n.fontFamily ?? ""),
				weight: String(n.fontWeight ?? "regular"),
				size: n.fontSize,
				lineHeight: typeof n.lineHeight === "number" ? n.lineHeight : undefined,
				textCase: typeof n.textCase === "string" ? n.textCase : undefined,
				count: 1,
			};
			bump(fonts, `${f.family}|${f.weight}|${f.size}|${f.lineHeight}|${f.textCase}`, f);
		}
		if (n.radius !== undefined) bump(radius, JSON.stringify(n.radius), n.radius as string | number);
		if (typeof n.gap === "number" && n.gap > 0) bump(gap, String(n.gap), n.gap);
		if (Array.isArray(n.padding) && n.padding.some((v) => v)) bump(padding, n.padding.join(" "), n.padding.join(" "));
		if (n.shadow && typeof n.shadow === "object") bump(shadows, JSON.stringify(n.shadow), JSON.stringify(n.shadow));
		for (const c of n.children ?? []) walk(c);
	};
	walk(root);
	// Счётчики шрифтов копятся в самом элементе (value), а не в Count.
	const fontList = [...fonts.values()].map((c) => ({ ...c.value, count: c.count }));
	return {
		colors: [...colors.values()]
			.sort((a, b) => b.count - a.count)
			.slice(0, limit)
			.map((c) => ({ hex: c.hex, ...(c.name ? { name: c.name } : {}), count: c.count, usage: [...c.usage] })),
		fonts: fontList.sort((a, b) => b.count - a.count).slice(0, limit),
		radius: byCount(radius, limit).map((c) => ({ value: c.value, count: c.count })),
		gap: byCount(gap, limit).map((c) => ({ value: c.value, count: c.count })),
		padding: byCount(padding, limit).map((c) => ({ value: c.value, count: c.count })),
		shadows: byCount(shadows, limit).map((c) => ({ value: c.value, count: c.count })),
		nodes,
	};
}

// ── CSS-режим: готовая вёрстка (HTML + inline-стили) из дерева ───────────────
const FONT_WEIGHT: Record<string, number> = { regular: 400, medium: 500, semibold: 600, bold: 700 };
const JUSTIFY: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end", "space-between": "space-between" };
const TEXT_CASE: Record<string, string> = { upper: "uppercase", lower: "lowercase", title: "capitalize" };

const px = (v: number): string => `${Math.round(v * 100) / 100}px`;

export function cssVarName(name: string): string {
	return "--" + name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}

const asBox = (v: unknown): [number, number, number, number] | null =>
	Array.isArray(v) && v.length === 4 && v.every((x) => typeof x === "number") ? (v as [number, number, number, number]) : null;

function fillCss(fill: unknown, name?: string): string | null {
	if (typeof fill === "string") return name ? `var(${cssVarName(name)}, ${fill})` : fill;
	if (fill && typeof fill === "object") {
		const g = fill as { gradient?: string; angle?: number; stops?: string[] };
		if (g.gradient === "linear" && Array.isArray(g.stops)) return `linear-gradient(${g.angle ?? 180}deg, ${g.stops.join(", ")})`;
		if (g.gradient === "radial" && Array.isArray(g.stops)) return `radial-gradient(circle, ${g.stops.join(", ")})`;
	}
	return null;
}

function styleOf(n: Spec, parent: Spec | null): string[] {
	const s: string[] = [];
	const vars = (n.vars ?? {}) as Record<string, string>;
	const pLayout = parent?.layout;
	const box = asBox(n.box);
	const pbox = parent ? asBox(parent.box) : null;
	if (pLayout === "none" && box && pbox) s.push("position:absolute", `left:${px(box[0] - pbox[0])}`, `top:${px(box[1] - pbox[1])}`);
	const size = (key: "w" | "h"): void => {
		const v = n[key];
		const prop = key === "w" ? "width" : "height";
		if (typeof v === "number") s.push(`${prop}:${px(v)}`, "flex-shrink:0");
		else if (v === "fill") {
			const main = (key === "w" && pLayout === "horizontal") || (key === "h" && pLayout === "vertical");
			if (main) s.push("flex:1 1 0");
			else if (pLayout === "horizontal" || pLayout === "vertical") s.push("align-self:stretch");
			else s.push(`${prop}:100%`);
		}
	};
	size("w");
	size("h");
	if (n.type === "frame") {
		if (n.layout === "vertical" || n.layout === "horizontal") {
			s.push("display:flex", `flex-direction:${n.layout === "vertical" ? "column" : "row"}`);
			if (typeof n.gap === "number" && n.gap) s.push(`gap:${px(n.gap)}`);
			if (typeof n.align === "string") s.push(`justify-content:${JUSTIFY[n.align] ?? "flex-start"}`);
			if (typeof n.cross === "string") s.push(`align-items:${JUSTIFY[n.cross] ?? "flex-start"}`);
			if (n.wrap) s.push("flex-wrap:wrap");
		} else s.push("position:relative");
		if (Array.isArray(n.padding) && n.padding.some((v) => v)) s.push(`padding:${(n.padding as number[]).map(px).join(" ")}`);
		if (n.clip) s.push("overflow:hidden");
	}
	if (n.type === "text") {
		if (typeof n.fontFamily === "string") s.push(`font-family:'${n.fontFamily}'`);
		if (typeof n.fontSize === "number") s.push(`font-size:${px(n.fontSize)}`);
		if (typeof n.fontWeight === "string") s.push(`font-weight:${FONT_WEIGHT[n.fontWeight] ?? 400}`);
		if (typeof n.lineHeight === "number") s.push(`line-height:${px(n.lineHeight)}`);
		const c = fillCss(n.color, vars.color);
		if (c) s.push(`color:${c}`);
		if (typeof n.align === "string") s.push(`text-align:${n.align}`);
		if (typeof n.textCase === "string" && TEXT_CASE[n.textCase]) s.push(`text-transform:${TEXT_CASE[n.textCase]}`);
		if (n.letterSpacing !== undefined) s.push(`letter-spacing:${typeof n.letterSpacing === "number" ? px(n.letterSpacing) : `${parseFloat(String(n.letterSpacing)) / 100}em`}`);
		if (n.textDecoration === "underline") s.push("text-decoration:underline");
		if (n.textDecoration === "strike") s.push("text-decoration:line-through");
		s.push("margin:0");
	} else {
		const bg = fillCss(n.fill, vars.fill);
		if (bg) s.push(`background:${bg}`);
	}
	if (n.radius !== undefined) s.push(`border-radius:${Array.isArray(n.radius) ? (n.radius as number[]).map(px).join(" ") : px(Number(n.radius))}`);
	if (typeof n.stroke === "string") s.push(`border:${px(Number(n.strokeWidth ?? 1))} solid ${fillCss(n.stroke, vars.stroke)}`);
	const sh = n.shadow as { x: number; y: number; blur: number; color: string } | undefined;
	if (sh && typeof sh === "object") s.push(`box-shadow:${px(sh.x)} ${px(sh.y)} ${px(sh.blur)} ${sh.color}`);
	if (typeof n.opacity === "number" && n.opacity !== 1) s.push(`opacity:${n.opacity}`);
	return s;
}

const esc = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Дерево → HTML со стилями в атрибутах: фреймы с auto-layout становятся flex,
// остальное — позиции по box. Привязанные переменные: var(--имя, #hex), список — в :root.
export function toCss(root: Spec): string {
	const names = new Map<string, string>();
	const lines: string[] = [];
	const collect = (n: Spec): void => {
		const vars = (n.vars ?? {}) as Record<string, string>;
		for (const [prop, name] of Object.entries(vars)) {
			const value = prop === "color" ? n.color : prop === "fill" ? n.fill : prop === "stroke" ? n.stroke : undefined;
			if (typeof value === "string" && !names.has(name)) names.set(name, value);
		}
		for (const c of n.children ?? []) collect(c);
	};
	collect(root);
	const emit = (n: Spec, parent: Spec | null, depth: number): void => {
		const pad = "  ".repeat(depth);
		const style = styleOf(n, parent).join(";");
		const attrs = `data-id="${n.id ?? ""}"${n.name && n.type !== "text" ? ` data-name="${esc(String(n.name))}"` : ""}${style ? ` style="${style}"` : ""}`;
		const asset = n.asset as { kind: string; format: string } | undefined;
		if (n.type === "text") {
			lines.push(`${pad}<p ${attrs}>${esc(String(n.text ?? ""))}</p>${typeof n.lines === "number" ? ` <!-- ${n.lines} стр. в макете из-за ширины, <br> не нужен -->` : ""}`);
		} else if (asset) {
			lines.push(`${pad}<img ${attrs} src="TODO:${asset.kind}.${asset.format}" alt="${esc(String(n.name ?? ""))}">`);
		} else if (n.children?.length) {
			lines.push(`${pad}<div ${attrs}>`);
			for (const c of n.children) emit(c, n, depth + 1);
			lines.push(`${pad}</div>`);
		} else {
			lines.push(`${pad}<div ${attrs}></div>`);
		}
	};
	emit(root, null, 0);
	const rootCss = names.size ? `:root{${[...names].map(([k, v]) => `${cssVarName(k)}:${v}`).join(";")}}\n` : "";
	return rootCss + lines.join("\n");
}
