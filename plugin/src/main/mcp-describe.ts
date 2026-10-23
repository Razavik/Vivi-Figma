// Описание дизайна для внешних агентов (MCP): компактный вывод, рамки нод
// относительно корня, свойства векторов, сводка токенов. Чистая логика над
// сериализованным деревом — проверяется тестами без Figma.
export type Spec = { [key: string]: unknown; id?: string; name?: string; type?: string; children?: Spec[] };

export interface NodeExtra {
	// [x, y, w, h] от левого верхнего угла запрошенного корня.
	box?: [number, number, number, number];
	// Свойства вектора/линии: заливка, обводка, поворот.
	vector?: Record<string, unknown>;
}

// Значения по умолчанию, которые в выводе только шумят.
function isDefault(key: string, value: unknown, node: Spec): boolean {
	if (key === "padding") return Array.isArray(value) && value.every((v) => v === 0);
	if (key === "gap") return value === 0;
	if (key === "align" || key === "cross") return value === "start" || (node.type === "text" && value === "left");
	if (key === "fontWeight") return false;
	if (key === "textCase" || key === "textDecoration") return value === "none";
	if (key === "opacity") return value === 1;
	return false;
}

// Убирает значения по умолчанию и дубли «имя слоя = текст» (в name остаётся только осмысленное).
export function compactSpec<T extends Spec>(spec: T): T {
	const out: Spec = {};
	for (const [k, v] of Object.entries(spec)) {
		if (k === "children") continue;
		if (isDefault(k, v, spec)) continue;
		if (k === "name" && spec.type === "text" && typeof spec.text === "string" && v === spec.text.replace(/\s+/g, " ").trim()) continue;
		out[k] = v;
	}
	if (Array.isArray(spec.children)) out.children = spec.children.map((c) => compactSpec(c));
	return out as T;
}

// Добавляет рамки и свойства векторов по id (extras строятся в плагине обходом нод).
export function mergeExtras<T extends Spec>(spec: T, extras: Map<string, NodeExtra>): T {
	const out: Spec = { ...spec };
	const extra = typeof spec.id === "string" ? extras.get(spec.id) : undefined;
	if (extra?.box) out.box = extra.box;
	if (extra?.vector) Object.assign(out, extra.vector);
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
	colors: { hex: string; count: number; usage: string[] }[];
	fonts: { family: string; weight: string; size: number; lineHeight?: number; textCase?: string; count: number }[];
	radius: { value: string | number; count: number }[];
	gap: { value: number; count: number }[];
	padding: { value: string; count: number }[];
	shadows: { value: string; count: number }[];
	nodes: number;
}

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

export function collectTokens(root: Spec, limit = 20): Tokens {
	const colors = new Map<string, { hex: string; usage: Set<string>; count: number }>();
	const fonts = new Map<string, Count<Tokens["fonts"][number]>>();
	const radius = new Map<string, Count<string | number>>();
	const gap = new Map<string, Count<number>>();
	const padding = new Map<string, Count<string>>();
	const shadows = new Map<string, Count<string>>();
	let nodes = 0;
	const color = (v: unknown, usage: string): void => {
		if (typeof v !== "string" || !HEX.test(v)) return;
		const hex = v.toLowerCase();
		const item = colors.get(hex) ?? { hex, usage: new Set<string>(), count: 0 };
		item.count++;
		item.usage.add(usage);
		colors.set(hex, item);
	};
	const walk = (n: Spec): void => {
		nodes++;
		color(n.fill, "fill");
		color(n.color, "text");
		color(n.stroke, "stroke");
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
			.map((c) => ({ hex: c.hex, count: c.count, usage: [...c.usage] })),
		fonts: fontList.sort((a, b) => b.count - a.count).slice(0, limit),
		radius: byCount(radius, limit).map((c) => ({ value: c.value, count: c.count })),
		gap: byCount(gap, limit).map((c) => ({ value: c.value, count: c.count })),
		padding: byCount(padding, limit).map((c) => ({ value: c.value, count: c.count })),
		shadows: byCount(shadows, limit).map((c) => ({ value: c.value, count: c.count })),
		nodes,
	};
}
