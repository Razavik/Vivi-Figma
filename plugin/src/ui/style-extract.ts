// Извлечение «стиля» из сериализованной ноды (спеки): частотные цвета,
// шрифты по ролям, радиусы, шкала отступов, тень. Нужен для запроса
// «сделай как этот блок» — модель получает компактную сводку источника.
type Spec = {
	type?: string;
	name?: string;
	fill?: unknown;
	color?: string;
	stroke?: string;
	fontFamily?: string;
	fontSize?: number;
	fontWeight?: string;
	radius?: number | number[];
	gap?: number;
	padding?: number | number[];
	shadow?: unknown;
	children?: Spec[];
};

export type StyleSummary = {
	fills: string[];
	textColors: string[];
	strokes: string[];
	fonts: { role: string; family: string; size: number; weight: string }[];
	radii: number[];
	gaps: number[];
	paddings: number[];
	shadow?: unknown;
};

const HEX = /^#[0-9a-f]{6,8}$/i;
const colorOf = (f: unknown): string | null => {
	if (typeof f === "string" && HEX.test(f)) return f.toUpperCase();
	if (f && typeof f === "object" && typeof (f as { color?: unknown }).color === "string") {
		const c = (f as { color: string }).color;
		return HEX.test(c) ? c.toUpperCase() : null;
	}
	return null;
};

function top<T>(counts: Map<T, number>, n: number): T[] {
	return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

export function extractStyle(root: Spec): StyleSummary {
	const fills = new Map<string, number>();
	const texts = new Map<string, number>();
	const strokes = new Map<string, number>();
	const radii = new Map<number, number>();
	const gaps = new Map<number, number>();
	const pads = new Map<number, number>();
	const fonts: { family: string; size: number; weight: string }[] = [];
	let shadow: unknown;
	const bump = <K,>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) || 0) + 1);

	const walk = (n: Spec) => {
		const f = colorOf(n.fill);
		if (f) bump(fills, f);
		if (n.type === "text") {
			if (n.color && HEX.test(n.color)) bump(texts, n.color.toUpperCase());
			if (typeof n.fontSize === "number")
				fonts.push({ family: n.fontFamily || "Inter", size: n.fontSize, weight: n.fontWeight || "regular" });
		}
		if (n.stroke && HEX.test(n.stroke)) bump(strokes, n.stroke.toUpperCase());
		for (const r of Array.isArray(n.radius) ? n.radius : [n.radius])
			if (typeof r === "number" && r > 0) bump(radii, r);
		if (typeof n.gap === "number" && n.gap > 0) bump(gaps, n.gap);
		for (const p of Array.isArray(n.padding) ? n.padding : [n.padding])
			if (typeof p === "number" && p > 0) bump(pads, p);
		if (n.shadow && !shadow) shadow = n.shadow;
		for (const c of n.children ?? []) walk(c);
	};
	walk(root);

	// Роли по размеру: самый крупный — заголовок, самый частый — текст, самый мелкий — подпись.
	const sorted = [...fonts].sort((a, b) => b.size - a.size);
	const roles: StyleSummary["fonts"] = [];
	if (sorted.length) {
		roles.push({ role: "heading", ...sorted[0] });
		const sizes = new Map<number, number>();
		// Основной текст — самый частый из НЕ самых крупных кеглей.
		for (const f of fonts) if (f.size < sorted[0].size || fonts.every((x) => x.size === f.size)) bump(sizes, f.size);
		const bodySize = top(sizes, 1)[0];
		const body = fonts.find((f) => f.size === bodySize);
		if (body && body.size !== sorted[0].size) roles.push({ role: "body", ...body });
		const small = sorted[sorted.length - 1];
		if (small.size < (body?.size ?? Infinity)) roles.push({ role: "caption", ...small });
	}
	return {
		fills: top(fills, 5),
		textColors: top(texts, 4),
		strokes: top(strokes, 2),
		fonts: roles,
		radii: top(radii, 3),
		gaps: top(gaps, 4),
		paddings: top(pads, 4),
		shadow,
	};
}
