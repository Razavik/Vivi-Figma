// Чистая часть MCP-инструментов (только чтение): белый список имён, разбор
// аргументов, масштаб скриншота. Работа с Figma — в mcp-tools.ts.
export const MCP_READ_TOOLS = ["status", "selection", "outline", "node", "screenshot", "search", "design_system", "assets", "export", "export_assets", "tokens"] as const;
export type McpTool = (typeof MCP_READ_TOOLS)[number];

export function isMcpTool(name: unknown): name is McpTool {
	return typeof name === "string" && (MCP_READ_TOOLS as readonly string[]).includes(name);
}

export function clampInt(v: unknown, lo: number, hi: number, d: number): number {
	const n = Number(v);
	return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
}

// Масштаб скриншота: явный scale (0.1–4) важнее; иначе большая сторона ≈ maxSize
// (128–4096, по умолчанию 1024), но не больше 2× и не меньше 0.05×.
export function screenshotScale(width: number, height: number, maxSize: unknown, scale?: unknown): number {
	const explicit = Number(scale);
	if (scale !== undefined && Number.isFinite(explicit)) return Math.min(4, Math.max(0.1, explicit));
	const size = clampInt(maxSize, 128, 4096, 1024);
	return Math.min(2, Math.max(0.05, size / Math.max(width, height, 1)));
}

// Предупреждение, если текст на скриншоте, вероятно, нечитаем.
export function scaleNote(scale: number, width: number, height: number): string | undefined {
	if (scale >= 0.5) return undefined;
	return `Скриншот уменьшен до ${Math.round(scale * 100)}% (${Math.round(width * scale)}×${Math.round(height * scale)} px) — мелкий текст может быть нечитаем: снимайте вложенные блоки по отдельности (id из figma_node/outline) или задайте scale/maxSize.`;
}

export interface NodeArgs {
	id: string;
	depth: number;
	maxNodes: number;
	compact: boolean;
	boxes: boolean;
}

// null — нет id.
export function nodeArgs(args: Record<string, unknown>): NodeArgs | null {
	if (typeof args.id !== "string" || !args.id.trim()) return null;
	return {
		id: args.id.trim(),
		depth: clampInt(args.depth, 1, 12, 6),
		maxNodes: clampInt(args.maxNodes, 10, 600, 300),
		compact: args.compact !== false,
		boxes: args.boxes !== false,
	};
}

// ── Ассеты (картинки и иконки) внутри ноды ───────────────────────────────────
export interface AssetNode {
	id: string;
	name: string;
	type: string;
	width: number;
	height: number;
	visible?: boolean;
	fills?: unknown;
	children?: readonly AssetNode[];
}

export interface AssetInfo {
	id: string;
	name: string;
	kind: "photo" | "icon";
	width: number;
	height: number;
	format: "png" | "svg";
}

const VECTOR_TYPES = ["VECTOR", "BOOLEAN_OPERATION", "STAR", "POLYGON", "LINE"];
const MAX_ICON_BOX = 128;
const MAX_LONE_VECTOR = 256;

function hasImageFill(n: AssetNode): boolean {
	return Array.isArray(n.fills) && n.fills.some((f) => (f as { type?: string })?.type === "IMAGE" && (f as { visible?: boolean }).visible !== false);
}

// Контейнер из одних векторов (≥1) без текста и картинок.
function onlyVectors(n: AssetNode, depth = 0): boolean {
	if (depth > 6) return false;
	if (VECTOR_TYPES.includes(n.type)) return true;
	if (n.type === "TEXT" || hasImageFill(n)) return false;
	const kids = (n.children ?? []).filter((k) => k.visible !== false);
	return kids.length > 0 && kids.every((k) => onlyVectors(k, depth + 1));
}

// Как экспортировать по умолчанию: векторы и маленькие контейнеры из одних
// векторов (иконки) — svg, остальное — png. Совпадает с рекомендацией assets.
export function defaultExportFormat(n: AssetNode): "svg" | "png" {
	if (VECTOR_TYPES.includes(n.type)) return "svg";
	const small = n.width <= MAX_ICON_BOX && n.height <= MAX_ICON_BOX;
	return small && !hasImageFill(n) && !!n.children?.length && onlyVectors(n) ? "svg" : "png";
}

// Фото — узлы с IMAGE-заливкой; иконки — векторы и маленькие контейнеры из одних
// векторов (ищем самый верхний такой контейнер, внутрь не заходим).
export function collectAssets(root: AssetNode, limit = 200): AssetInfo[] {
	const out: AssetInfo[] = [];
	let visited = 0;
	const walk = (n: AssetNode, depth: number): void => {
		if (out.length >= limit || visited++ > 5000 || n.visible === false || depth > 14) return;
		const size = { width: Math.round(n.width), height: Math.round(n.height) };
		if (depth > 0 && hasImageFill(n) && n.width >= 16 && n.height >= 16) {
			out.push({ id: n.id, name: n.name, kind: "photo", ...size, format: "png" });
			return;
		}
		if (depth > 0) {
			const small = n.width <= MAX_ICON_BOX && n.height <= MAX_ICON_BOX;
			const lone = VECTOR_TYPES.includes(n.type) && n.width <= MAX_LONE_VECTOR && n.height <= MAX_LONE_VECTOR;
			if (lone || (small && !VECTOR_TYPES.includes(n.type) && n.children?.length && onlyVectors(n))) {
				out.push({ id: n.id, name: n.name, kind: "icon", ...size, format: "svg" });
				return;
			}
		}
		for (const k of n.children ?? []) walk(k, depth + 1);
	};
	walk(root, 0);
	return out;
}

// ── Экспорт ──────────────────────────────────────────────────────────────────
export type ExportFormat = "png" | "jpg" | "svg" | "pdf";

export function exportFormat(v: unknown, fallback: ExportFormat): ExportFormat {
	const f = typeof v === "string" ? v.toLowerCase().replace("jpeg", "jpg") : "";
	return f === "png" || f === "jpg" || f === "svg" || f === "pdf" ? f : fallback;
}

export function exportScale(v: unknown): number {
	const n = Number(v);
	return Number.isFinite(n) ? Math.min(4, Math.max(0.5, n)) : 2;
}

// Список id для экспорта: id или ids, без дублей, не больше max.
export function exportIds(args: Record<string, unknown>, max = 30): string[] {
	const raw = Array.isArray(args.ids) ? args.ids : typeof args.id === "string" ? [args.id] : [];
	return [...new Set(raw.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()))].slice(0, max);
}

export const MAX_EXPORT_BYTES = 30 * 1024 * 1024;
