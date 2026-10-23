// Детерминированный перенос стиля без модели: сопоставление по рангам и ролям.
// Цвета заливок/текста — по частоте (самый частый ↔ самый частый), шрифты —
// заголовок ↔ заголовок, остальное ↔ основной текст, радиусы — по частоте.
// Структура и тексты цели не меняются. Для сложных случаев есть режим модели.
import type { StyleSummary } from "./style-extract";

type Spec = {
	id?: string;
	type?: string;
	fill?: unknown;
	color?: string;
	fontFamily?: string;
	fontSize?: number;
	radius?: number | number[];
	children?: Spec[];
};

export type StyleOp = { op: "update"; id: string } & Record<string, unknown>;

const HEX = /^#[0-9a-f]{6,8}$/i;
const fillColor = (f: unknown): string | null => {
	if (typeof f === "string" && HEX.test(f)) return f.toUpperCase();
	const c = (f as { color?: unknown } | null)?.color;
	return typeof c === "string" && HEX.test(c) ? c.toUpperCase() : null;
};

function ranked<T>(counts: Map<T, number>): T[] {
	return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

export function styleOps(source: StyleSummary, target: Spec): StyleOp[] {
	const nodes: Spec[] = [];
	const walk = (n: Spec) => {
		nodes.push(n);
		for (const c of n.children ?? []) walk(c);
	};
	walk(target);

	const count = <K,>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) || 0) + 1);
	const fills = new Map<string, number>();
	const texts = new Map<string, number>();
	const radii = new Map<number, number>();
	let maxSize = 0;
	for (const n of nodes) {
		const f = fillColor(n.fill);
		if (f) count(fills, f);
		if (n.type === "text") {
			if (n.color && HEX.test(n.color)) count(texts, n.color.toUpperCase());
			if (typeof n.fontSize === "number") maxSize = Math.max(maxSize, n.fontSize);
		}
		for (const r of Array.isArray(n.radius) ? n.radius : [n.radius])
			if (typeof r === "number" && r > 0) count(radii, r);
	}
	const pick = <T,>(list: T[], i: number): T | undefined =>
		list.length ? list[Math.min(i, list.length - 1)] : undefined;
	const fillMap = new Map(ranked(fills).map((c, i) => [c, pick(source.fills, i)]));
	const textMap = new Map(ranked(texts).map((c, i) => [c, pick(source.textColors, i)]));
	const radiusMap = new Map(ranked(radii).map((r, i) => [r, pick(source.radii, i)]));
	const heading = source.fonts.find((f) => f.role === "heading");
	const body = source.fonts.find((f) => f.role === "body") ?? heading;

	const ops: StyleOp[] = [];
	for (const n of nodes) {
		if (!n.id) continue;
		const set: Record<string, unknown> = {};
		const f = fillColor(n.fill);
		const nf = f ? fillMap.get(f) : undefined;
		if (nf && nf !== f) set.fill = nf;
		if (n.type === "text") {
			const c = n.color && HEX.test(n.color) ? textMap.get(n.color.toUpperCase()) : undefined;
			if (c && c.toUpperCase() !== n.color?.toUpperCase()) set.color = c;
			const role = n.fontSize === maxSize && maxSize > 0 ? heading : body;
			if (role && role.family && role.family !== n.fontFamily) set.fontFamily = role.family;
		}
		if (typeof n.radius === "number" && n.radius > 0) {
			const r = radiusMap.get(n.radius);
			if (r && r !== n.radius) set.radius = r;
		}
		if (Object.keys(set).length) ops.push({ op: "update", id: n.id, ...set });
	}
	return ops;
}
