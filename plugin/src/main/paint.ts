/// <reference types="@figma/plugin-typings" />
import type { Fill } from "../spec";
import { isStyleRef, paintStyleHex, queueFillStyle } from "./designsystem";

export const STYLE_BY_WEIGHT: Record<string, string> = {
	thin: "Thin",
	light: "Light",
	regular: "Regular",
	medium: "Medium",
	semibold: "Semi Bold",
	bold: "Bold",
	extrabold: "Extra Bold",
	black: "Black",
};

export const WEIGHT_FROM_STYLE: Record<string, string> = {
	Thin: "thin",
	Light: "light",
	Regular: "regular",
	Medium: "medium",
	"Semi Bold": "semibold",
	SemiBold: "semibold",
	Bold: "bold",
	"Extra Bold": "extrabold",
	ExtraBold: "extrabold",
	Black: "black",
};

export const ALIGN_TO_SPEC: Record<string, string> = {
	MIN: "start",
	CENTER: "center",
	MAX: "end",
	SPACE_BETWEEN: "space-between",
};

const NAMED_COLORS: Record<string, string> = {
	white: "#FFFFFF",
	black: "#000000",
	transparent: "#00000000",
	red: "#FF0000",
	green: "#008000",
	blue: "#0000FF",
	gray: "#808080",
	grey: "#808080",
	yellow: "#FFFF00",
	orange: "#FFA500",
	purple: "#800080",
};

// Модель иногда отдаёт не hex, а "white" / "rgba(0,0,0,0.1)" —
// приводим к hex, иначе цвет молча превращается в чёрный.
function normalizeColor(input: string): string {
	// "style:Brand/Primary" — цвет локального стиля (нет такого — чёрный по умолчанию).
	if (isStyleRef(input)) return paintStyleHex(input) ?? "#000000";
	const value = input.trim().toLowerCase();
	if (NAMED_COLORS[value]) return NAMED_COLORS[value];
	const fn = value.match(/^rgba?\(([^)]+)\)$/);
	if (fn) {
		const parts = fn[1].split(/[\s,\/]+/).filter(Boolean);
		const to2 = (n: number) =>
			Math.round(Math.max(0, Math.min(255, n)))
				.toString(16)
				.padStart(2, "0");
		const rgb = parts.slice(0, 3).map((p) => to2(parseFloat(p)));
		if (rgb.length === 3 && !rgb.some((c) => c.includes("NaN"))) {
			let alpha = "";
			if (parts[3] !== undefined) {
				const a = parts[3].endsWith("%")
					? parseFloat(parts[3]) / 100
					: parseFloat(parts[3]);
				if (Number.isFinite(a)) alpha = to2(a * 255);
			}
			return "#" + rgb.join("") + alpha;
		}
	}
	return input;
}

export function hexToRgba(input: string): { color: RGB; alpha: number } {
	const hex = normalizeColor(input);
	const raw = hex.trim().replace(/^#/, "");
	const full =
		raw.length === 3 || raw.length === 4
			? raw
					.split("")
					.map((c) => c + c)
					.join("")
			: raw.padEnd(6, "0").slice(0, 8);
	const num = parseInt(full.slice(0, 6), 16);
	const alpha = full.length >= 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
	return {
		color: {
			r: ((num >> 16) & 255) / 255,
			g: ((num >> 8) & 255) / 255,
			b: (num & 255) / 255,
		},
		alpha: Number.isFinite(alpha) ? alpha : 1,
	};
}

export function rgbToHex(c: RGB, alpha = 1): string {
	const to2 = (v: number) =>
		Math.round(Math.max(0, Math.min(1, v)) * 255)
			.toString(16)
			.padStart(2, "0");
	const hex = `#${to2(c.r)}${to2(c.g)}${to2(c.b)}`;
	return alpha < 1 ? hex + to2(alpha) : hex;
}

export function firstSolid(
	fills: readonly Paint[] | PluginAPI["mixed"],
): string | undefined {
	// figma.mixed тоже отсекается: Array.isArray по нему вернёт false
	if (!Array.isArray(fills)) return undefined;
	const solid = (fills as readonly Paint[]).find(
		(p) => p.type === "SOLID" && p.visible !== false,
	) as SolidPaint | undefined;
	if (!solid) return undefined;
	return rgbToHex(solid.color, solid.opacity ?? 1);
}

// Линейный градиент в терминах Figma: угол как в CSS (0 — снизу вверх,
// 90 — слева направо, 180 — сверху вниз), цвета равномерно по длине.
export function linearGradient(
	angle: number,
	stops: string[],
): GradientPaint {
	const rad = ((angle - 90) * Math.PI) / 180;
	const c = Math.cos(rad);
	const s = Math.sin(rad);
	// Матрица переводит единичный квадрат ноды в пространство градиента:
	// ось x — направление, центр — середина ноды.
	const transform: Transform = [
		[c, s, 0.5 - c / 2 - s / 2],
		[-s, c, 0.5 + s / 2 - c / 2],
	];
	const list = stops.length >= 2 ? stops : [stops[0] || "#000000", stops[0] || "#000000"];
	return {
		type: "GRADIENT_LINEAR",
		gradientTransform: transform,
		gradientStops: list.map((hex, i) => {
			const { color, alpha } = hexToRgba(hex);
			return { position: i / (list.length - 1), color: { ...color, a: alpha } };
		}),
	};
}

// Радиальный градиент: center — центр в долях ноды (0..1), radius — радиус
// в долях её размера (0.5 — до краёв). Первый цвет — в центре.
export function radialGradient(
	stops: string[],
	center: [number, number] = [0.5, 0.5],
	radius = 0.5,
): GradientPaint {
	const k = 0.5 / Math.max(radius, 0.01);
	const [cx, cy] = center;
	const list = stops.length >= 2 ? stops : [stops[0] || "#000000", stops[0] || "#000000"];
	return {
		type: "GRADIENT_RADIAL",
		// Пространство градиента: центр (0.5, 0.5), радиус 0.5.
		gradientTransform: [
			[k, 0, 0.5 - k * cx],
			[0, k, 0.5 - k * cy],
		],
		gradientStops: list.map((hex, i) => {
			const { color, alpha } = hexToRgba(hex);
			return { position: i / (list.length - 1), color: { ...color, a: alpha } };
		}),
	};
}

type GradientSpec =
	| { gradient: "linear"; angle: number; stops: string[] }
	| { gradient: "radial"; center?: [number, number]; radius?: number; stops: string[] };

// Обратное к linearGradient/radialGradient: градиент ноды → спека
// {"gradient":"linear"|"radial",...} (для сериализации дерева).
export function gradientSpecOf(
	fills: readonly Paint[] | PluginAPI["mixed"],
): GradientSpec | undefined {
	if (!Array.isArray(fills)) return undefined;
	const g = (fills as readonly Paint[]).find(
		(p) =>
			(p.type === "GRADIENT_LINEAR" || p.type === "GRADIENT_RADIAL") &&
			p.visible !== false,
	) as GradientPaint | undefined;
	if (!g) return undefined;
	const stopsHex = g.gradientStops.map((st) =>
		rgbToHex({ r: st.color.r, g: st.color.g, b: st.color.b }, st.color.a),
	);
	if (g.type === "GRADIENT_RADIAL") {
		const [[k, , tx], [, , ty]] = g.gradientTransform;
		const r2 = (v: number) => Math.round(v * 100) / 100;
		const out: GradientSpec = { gradient: "radial", stops: stopsHex };
		if (k) {
			const center: [number, number] = [r2((0.5 - tx) / k), r2((0.5 - ty) / k)];
			if (center[0] !== 0.5 || center[1] !== 0.5) out.center = center;
			const radius = r2(0.5 / k);
			if (radius !== 0.5) out.radius = radius;
		}
		return out;
	}
	const [[c, s]] = g.gradientTransform;
	const angle = Math.round(((Math.atan2(s, c) * 180) / Math.PI + 90 + 360) % 360);
	return {
		gradient: "linear",
		angle,
		stops: g.gradientStops.map((st) =>
			rgbToHex({ r: st.color.r, g: st.color.g, b: st.color.b }, st.color.a),
		),
	};
}

// Заливка спеки (цвет или градиент) → Paint Figma; null — нечего ставить.
export function paintOf(fill: unknown): Paint | null {
	if (fill && typeof fill === "object" && "gradient" in fill) {
		const g = fill as {
			gradient?: unknown;
			angle?: unknown;
			stops?: unknown;
			center?: unknown;
			radius?: unknown;
		};
		const stops = Array.isArray(g.stops)
			? g.stops.filter((v): v is string => typeof v === "string")
			: [];
		if (!stops.length) return null;
		if (g.gradient === "radial") {
			const c = Array.isArray(g.center) ? g.center.map(Number) : [];
			return radialGradient(
				stops,
				c.length === 2 && c.every(Number.isFinite) ? [c[0], c[1]] : undefined,
				typeof g.radius === "number" ? g.radius : undefined,
			);
		}
		return linearGradient(typeof g.angle === "number" ? g.angle : 180, stops);
	}
	const colorStr =
		typeof fill === "string"
			? fill
			: fill && typeof fill === "object"
				? (fill as { color?: unknown }).color
				: undefined;
	if (typeof colorStr !== "string") return null;
	const { color, alpha } = hexToRgba(colorStr);
	const op = (fill as { opacity?: unknown }).opacity;
	return { type: "SOLID", color, opacity: typeof op === "number" ? op : alpha };
}

export function applyFill(node: GeometryMixin, fill: Fill | undefined): void {
	if (fill === undefined) return;
	if (fill === null || fill === "none") {
		node.fills = [];
		return;
	}
	const paint = paintOf(fill);
	if (!paint) return;
	node.fills = [paint];
	// Привязка к стилю ставится после сборки (async-сеттер).
	if (paint.type === "SOLID")
		queueFillStyle(
			node as unknown as BaseNode,
			typeof fill === "string" ? fill : (fill as { color: string }).color,
		);
}

const STROKE_ALIGN: Record<string, "INSIDE" | "CENTER" | "OUTSIDE"> = {
	inside: "INSIDE",
	center: "CENTER",
	outside: "OUTSIDE",
};
const SIDES = ["top", "right", "bottom", "left"] as const;

export function applyStroke(
	node: GeometryMixin & { strokeWeight: number | PluginAPI["mixed"] },
	spec: {
		stroke?: string;
		strokeWidth?: number;
		strokeSides?: unknown;
		strokeAlign?: unknown;
		dash?: unknown;
	},
): void {
	if (spec.stroke === "none") node.strokes = [];
	else if (typeof spec.stroke === "string") {
		const { color, alpha } = hexToRgba(spec.stroke);
		node.strokes = [{ type: "SOLID", color, opacity: alpha }];
	}
	if (typeof spec.strokeWidth === "number")
		node.strokeWeight = spec.strokeWidth;
	if (STROKE_ALIGN[String(spec.strokeAlign)])
		node.strokeAlign = STROKE_ALIGN[String(spec.strokeAlign)];
	if (Array.isArray(spec.dash))
		node.dashPattern = spec.dash.filter(
			(v): v is number => typeof v === "number" && v >= 0,
		);
	// Обводка только с части сторон (разделитель снизу у строки таблицы).
	// Ставится после strokeWeight: общий вес сбрасывает веса сторон.
	if (spec.strokeSides !== undefined && "strokeTopWeight" in node) {
		const n = node as unknown as IndividualStrokesMixin;
		const list = (
			Array.isArray(spec.strokeSides) ? spec.strokeSides : [spec.strokeSides]
		).map(String);
		const weight =
			typeof spec.strokeWidth === "number"
				? spec.strokeWidth
				: Math.max(
						n.strokeTopWeight,
						n.strokeRightWeight,
						n.strokeBottomWeight,
						n.strokeLeftWeight,
					) || 1;
		const on = (side: string) => list.includes("all") || list.includes(side);
		n.strokeTopWeight = on("top") ? weight : 0;
		n.strokeRightWeight = on("right") ? weight : 0;
		n.strokeBottomWeight = on("bottom") ? weight : 0;
		n.strokeLeftWeight = on("left") ? weight : 0;
	}
}

// Обратное к applyStroke для сериализации: стороны, положение, пунктир.
export function strokeExtrasOf(node: SceneNode): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (!("strokes" in node) || !node.strokes.length) return out;
	const n = node as GeometryMixin & { strokeWeight: unknown };
	if (n.strokeAlign && n.strokeAlign !== "INSIDE")
		out.strokeAlign = n.strokeAlign.toLowerCase();
	if (n.dashPattern?.length) out.dash = [...n.dashPattern];
	if ("strokeTopWeight" in node) {
		const s = node as unknown as IndividualStrokesMixin;
		const w = {
			top: s.strokeTopWeight,
			right: s.strokeRightWeight,
			bottom: s.strokeBottomWeight,
			left: s.strokeLeftWeight,
		};
		const sides = SIDES.filter((k) => w[k] > 0);
		if (sides.length < 4) {
			out.strokeSides = sides.length === 1 ? sides[0] : sides;
			out.strokeWidth = Math.max(...SIDES.map((k) => w[k]));
		}
	}
	return out;
}

const FIT: Record<string, "FILL" | "FIT"> = { fill: "FILL", fit: "FIT" };

// Фото: режим вписывания и слой поверх (overlay — цвет с альфой или
// градиент, чтобы текст на фото читался). Работает с уже стоящей IMAGE-заливкой.
export function applyImageExtras(
	node: GeometryMixin,
	spec: Record<string, unknown>,
): void {
	if (!Array.isArray(node.fills)) return;
	const fills = node.fills as readonly Paint[];
	const img = fills.find((p) => p.type === "IMAGE") as ImagePaint | undefined;
	if (!img) return;
	const image: ImagePaint = FIT[String(spec.fit)]
		? { ...img, scaleMode: FIT[String(spec.fit)] }
		: img;
	let over: Paint[] = fills.filter((p) => p.type !== "IMAGE");
	if (spec.overlay !== undefined) {
		const paint =
			spec.overlay === "none" || spec.overlay === null
				? null
				: paintOf(spec.overlay);
		over = paint ? [paint] : [];
	}
	node.fills = [image, ...over];
}

// Для сериализации: fit и overlay картинки.
export function imageExtrasOf(
	fills: readonly Paint[] | PluginAPI["mixed"],
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (!Array.isArray(fills)) return out;
	const list = fills as readonly Paint[];
	const img = list.find((p) => p.type === "IMAGE") as ImagePaint | undefined;
	if (!img) return out;
	if (img.scaleMode === "FIT") out.fit = "fit";
	const rest = list.filter((p) => p.type !== "IMAGE" && p.visible !== false);
	const overlay = firstSolid(rest) ?? gradientSpecOf(rest);
	if (overlay) out.overlay = overlay;
	return out;
}

export function applyRadius(
	node: CornerMixin & RectangleCornerMixin,
	radius: number | number[] | undefined,
): void {
	if (typeof radius === "number") {
		node.cornerRadius = radius;
	} else if (Array.isArray(radius)) {
		// Как в CSS border-radius: 2 значения — [лев-верх+прав-низ,
		// прав-верх+лев-низ], 3 — [лв, пв+лн, пн], 4 — по углам.
		const tl = radius[0] ?? 0;
		const tr = radius[1] ?? tl;
		const br = radius[2] ?? tl;
		const bl = radius[3] ?? tr;
		node.topLeftRadius = tl;
		node.topRightRadius = tr;
		node.bottomRightRadius = br;
		node.bottomLeftRadius = bl;
	}
}

export function applyShadow(
	node: { effects: readonly Effect[] },
	shadow:
		| { x?: number; y?: number; blur?: number; color?: string }
		| undefined,
): void {
	// Тень заменяет только прежнюю тень — размытия остаются.
	const others = node.effects.filter((e) => e.type !== "DROP_SHADOW");
	if ((shadow as unknown) === "none") {
		node.effects = others;
		return;
	}
	if (!shadow || typeof shadow !== "object") return;
	const { color, alpha } = hexToRgba(shadow.color || "#00000033");
	node.effects = [
		...others,
		{
			type: "DROP_SHADOW",
			color: { ...color, a: alpha },
			offset: { x: shadow.x ?? 0, y: shadow.y ?? 2 },
			radius: shadow.blur ?? 8,
			spread: 0,
			visible: true,
			blendMode: "NORMAL",
		},
	];
}

// Размытие слоя (layerBlur) и фона под ним (backgroundBlur — «стекло» на
// полупрозрачной заливке): радиус в px, 0 — убрать.
export function applyBlurs(
	node: { effects: readonly Effect[] },
	spec: Record<string, unknown>,
): void {
	const set = (type: "LAYER_BLUR" | "BACKGROUND_BLUR", v: unknown): void => {
		if (typeof v !== "number") return;
		const rest = node.effects.filter((e) => e.type !== type);
		node.effects =
			v > 0 ? [...rest, { type, blurType: "NORMAL", radius: v, visible: true }] : rest;
	};
	set("LAYER_BLUR", spec.layerBlur);
	set("BACKGROUND_BLUR", spec.backgroundBlur);
}

export function blursOf(effects: readonly Effect[]): Record<string, number> {
	const out: Record<string, number> = {};
	for (const e of effects) {
		if (e.visible === false) continue;
		if (e.type === "LAYER_BLUR") out.layerBlur = e.radius;
		if (e.type === "BACKGROUND_BLUR") out.backgroundBlur = e.radius;
	}
	return out;
}

// Padding как в CSS: 1 значение — все стороны, 2 — [вертикально,
// горизонтально], 3 — [верх, горизонтально, низ], 4 — [в, п, н, л].
export function paddingOf(p: number | number[] | undefined) {
	if (typeof p === "number") return { t: p, r: p, b: p, l: p };
	if (Array.isArray(p)) {
		const t = p[0] ?? 0;
		const r = p[1] ?? t;
		const b = p[2] ?? t;
		const l = p[3] ?? r;
		return { t, r, b, l };
	}
	return { t: 0, r: 0, b: 0, l: 0 };
}
