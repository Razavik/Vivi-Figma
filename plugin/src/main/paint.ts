/// <reference types="@figma/plugin-typings" />
// Чтение заливок, обводок и эффектов ноды в понятные внешнему агенту значения
// (hex, градиенты, стороны обводки, блюр).

export const WEIGHT_FROM_STYLE: Record<string, string> = {
	Regular: "regular",
	Medium: "medium",
	"Semi Bold": "semibold",
	Bold: "bold",
};

export const ALIGN_TO_SPEC: Record<string, string> = {
	MIN: "start",
	CENTER: "center",
	MAX: "end",
	SPACE_BETWEEN: "space-between",
};

export interface GradientSpec {
	gradient: "linear" | "radial";
	angle?: number;
	center?: [number, number];
	radius?: number;
	stops: string[];
}

const SIDES = ["top", "right", "bottom", "left"] as const;

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

// Градиент ноды → {"gradient":"linear"|"radial",...}.
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
	return { gradient: "linear", angle, stops: stopsHex };
}

// Обводка: стороны, положение, пунктир.
export function strokeExtrasOf(node: SceneNode): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (!("strokes" in node) || !node.strokes.length) return out;
	const n = node as GeometryMixin & { strokeWeight: unknown };
	if (n.strokeAlign && n.strokeAlign !== "INSIDE")
		out.strokeAlign = n.strokeAlign.toLowerCase();
	if (n.dashPattern?.length) out.dash = [...n.dashPattern];
	if ("strokeTopWeight" in node) {
		const s = node as unknown as IndividualStrokesMixin;
		const widths = {
			top: s.strokeTopWeight,
			right: s.strokeRightWeight,
			bottom: s.strokeBottomWeight,
			left: s.strokeLeftWeight,
		};
		const sides = SIDES.filter((k) => widths[k] > 0);
		if (sides.length < 4) {
			out.strokeSides = sides.length === 1 ? sides[0] : sides;
			out.strokeWidth = Math.max(...SIDES.map((k) => widths[k]));
		}
	}
	return out;
}

// Фото: режим вписывания и слой поверх (цвет с альфой или градиент).
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

export function blursOf(effects: readonly Effect[]): Record<string, number> {
	const out: Record<string, number> = {};
	for (const e of effects) {
		if (e.visible === false) continue;
		if (e.type === "LAYER_BLUR") out.layerBlur = e.radius;
		if (e.type === "BACKGROUND_BLUR") out.backgroundBlur = e.radius;
	}
	return out;
}
