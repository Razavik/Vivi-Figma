// Сложные фигуры: геометрия контуров и svg для createNodeFromSvg. Чистая
// логика без Figma — проверяется тестами. Все контуры считаются в координатах
// 0..w, 0..h; в сборку попадают через svg, а потом flatten в одну векторную ноду.
export const SHAPE_KINDS = ["path", "polygon", "star", "blob", "wave", "ring"] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];
export const BOOL_OPS = ["union", "subtract", "intersect", "exclude"] as const;
export type BoolOp = (typeof BOOL_OPS)[number];

export interface ShapeParams {
	shape?: string;
	d?: string;
	viewBox?: number[];
	rule?: string;
	sides?: number;
	points?: number;
	inner?: number;
	seed?: number | string;
	amplitude?: number;
	periods?: number;
	thickness?: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (v: unknown, lo: number, hi: number, d: number) =>
	Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d;

// Детерминированный генератор (mulberry32): тот же seed — тот же blob.
export function seeded(seed: number | string | undefined): () => number {
	let h = 2166136261;
	for (const ch of String(seed ?? "vivi")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
	let a = h >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function poly(pts: [number, number][]): string {
	return `M${pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join("L")}Z`;
}

// Правильный многоугольник, вписанный в эллипс w×h; вершина сверху.
export function polygonPath(sides: unknown, w: number, h: number): string {
	const n = Math.round(clamp(sides, 3, 24, 6));
	const pts: [number, number][] = [];
	for (let i = 0; i < n; i++) {
		const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
		pts.push([w / 2 + (w / 2) * Math.cos(a), h / 2 + (h / 2) * Math.sin(a)]);
	}
	return poly(pts);
}

// Звезда: points лучей, inner — доля внутреннего радиуса (0.2–0.9).
export function starPath(points: unknown, inner: unknown, w: number, h: number): string {
	const n = Math.round(clamp(points, 3, 24, 5));
	const k = clamp(inner, 0.2, 0.9, 0.45);
	const pts: [number, number][] = [];
	for (let i = 0; i < n * 2; i++) {
		const a = -Math.PI / 2 + (i * Math.PI) / n;
		const m = i % 2 ? k : 1;
		pts.push([w / 2 + ((w / 2) * m) * Math.cos(a), h / 2 + ((h / 2) * m) * Math.sin(a)]);
	}
	return poly(pts);
}

// Органичное пятно: замкнутая гладкая кривая (Catmull-Rom → кубики Безье)
// через 7–9 точек вокруг центра с разным радиусом.
export function blobPath(seed: number | string | undefined, w: number, h: number): string {
	const rand = seeded(seed);
	const n = 7 + Math.floor(rand() * 3);
	const pts: [number, number][] = [];
	for (let i = 0; i < n; i++) {
		const a = (i * 2 * Math.PI) / n + rand() * 0.25;
		const rad = 0.72 + rand() * 0.28;
		pts.push([w / 2 + (w / 2) * rad * Math.cos(a), h / 2 + (h / 2) * rad * Math.sin(a)]);
	}
	let d = `M${r2(pts[0][0])} ${r2(pts[0][1])}`;
	for (let i = 0; i < n; i++) {
		const p0 = pts[(i - 1 + n) % n];
		const p1 = pts[i];
		const p2 = pts[(i + 1) % n];
		const p3 = pts[(i + 2) % n];
		const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
		const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
		d += `C${r2(c1[0])} ${r2(c1[1])} ${r2(c2[0])} ${r2(c2[1])} ${r2(p2[0])} ${r2(p2[1])}`;
	}
	return d + "Z";
}

// Волна как заливка: верх — синусоида (periods периодов, размах amplitude),
// ниже она закрашена до нижнего края — разделитель секций.
export function wavePath(amplitude: unknown, periods: unknown, w: number, h: number): string {
	const amp = clamp(amplitude, 1, h / 2, Math.max(4, h / 4));
	const per = Math.round(clamp(periods, 1, 12, 2));
	const step = w / (per * 2);
	let d = `M0 ${r2(amp)}`;
	for (let i = 0; i < per * 2; i++) {
		const x0 = i * step;
		d += `Q${r2(x0 + step / 2)} ${i % 2 ? r2(amp * 2) : 0} ${r2(x0 + step)} ${r2(amp)}`;
	}
	return d + `L${r2(w)} ${r2(h)}L0 ${r2(h)}Z`;
}

// Кольцо (бублик) одним контуром с evenodd: внешний и внутренний круги.
export function ringPath(thickness: unknown, w: number, h: number): string {
	const t = clamp(thickness, 1, Math.min(w, h) / 2 - 1, Math.min(w, h) / 8);
	const circle = (rx: number, ry: number) =>
		`M${r2(w / 2 - rx)} ${r2(h / 2)}a${r2(rx)} ${r2(ry)} 0 1 0 ${r2(rx * 2)} 0a${r2(rx)} ${r2(ry)} 0 1 0 ${r2(-rx * 2)} 0Z`;
	return circle(w / 2, h / 2) + circle(w / 2 - t, h / 2 - t);
}

// d и правило заливки для вида фигуры; null — вид не распознан/нет данных.
export function shapeGeometry(
	p: ShapeParams,
	w: number,
	h: number,
): { d: string; rule: "nonzero" | "evenodd"; viewBox: [number, number] } | null {
	const kind = String(p.shape || (p.d ? "path" : "")).toLowerCase();
	let d = "";
	let rule: "nonzero" | "evenodd" = p.rule === "evenodd" ? "evenodd" : "nonzero";
	let viewBox: [number, number] = [w, h];
	switch (kind) {
		case "path": {
			if (typeof p.d !== "string" || !/^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/.test(p.d) || !/[Mm]/.test(p.d))
				return null;
			d = p.d.trim().slice(0, 8000);
			const vb = p.viewBox;
			if (Array.isArray(vb) && vb.length >= 2 && vb[0] > 0 && vb[1] > 0)
				viewBox = [Number(vb[vb.length - 2]), Number(vb[vb.length - 1])];
			break;
		}
		case "polygon":
			d = polygonPath(p.sides, w, h);
			break;
		case "star":
			d = starPath(p.points, p.inner, w, h);
			break;
		case "blob":
			d = blobPath(p.seed, w, h);
			break;
		case "wave":
			d = wavePath(p.amplitude, p.periods, w, h);
			break;
		case "ring":
			d = ringPath(p.thickness, w, h);
			rule = "evenodd";
			break;
		default:
			return null;
	}
	return { d, rule, viewBox };
}

// svg для figma.createNodeFromSvg: размер w×h, контур масштабируется viewBox'ом.
export function shapeSvg(
	p: ShapeParams,
	w: number,
	h: number,
): { svg: string; rule: "nonzero" | "evenodd" } | null {
	const g = shapeGeometry(p, w, h);
	if (!g) return null;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${r2(w)}" height="${r2(h)}" viewBox="0 0 ${g.viewBox[0]} ${g.viewBox[1]}" preserveAspectRatio="none"><path d="${g.d}" fill="#000" fill-rule="${g.rule}"/></svg>`;
	return { svg, rule: g.rule };
}

// Размер фигуры: числовой w/h, иначе 100.
export function shapeSize(w: unknown, h: unknown): [number, number] {
	const n = (v: unknown) => (typeof v === "number" && v > 0 ? Math.min(v, 4000) : 100);
	const sw = n(w);
	return [sw, typeof h === "number" && h > 0 ? Math.min(h, 4000) : sw];
}
