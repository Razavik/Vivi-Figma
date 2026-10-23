// Инструменты MCP (только чтение): внешний агент смотрит дизайн в открытом
// файле. Вызовы приходят через мост → UI → сюда; ничего не меняют на холсте.
import { state } from "./canvas-state";
import { loadComponents, loadDesignSystem } from "./designsystem";
import {
	MAX_EXPORT_BYTES,
	collectAssets,
	defaultExportFormat,
	clampInt,
	exportFormat,
	exportIds,
	exportScale,
	isMcpTool,
	nodeArgs,
	scaleNote,
	screenshotScale,
	type AssetNode,
} from "./mcp-core";
import { collectTokens, compactSpec, mergeExtras, type NodeExtra, type Spec } from "./mcp-describe";
import { firstSolid } from "./paint";
import { searchIn, type SearchNode } from "./search";
import { pageOutline, serializeNode, setSerializeLimits } from "./serializer";

export type McpResult =
	| { ok: true; data: unknown; images?: { data: string; mimeType: string }[] }
	| { ok: false; error: string };

async function nodeById(id: string): Promise<SceneNode | null> {
	const node = await figma.getNodeByIdAsync(id);
	if (!node || node.removed || node.type === "PAGE" || node.type === "DOCUMENT") return null;
	return node as SceneNode;
}

const VECTORS = ["VECTOR", "BOOLEAN_OPERATION", "STAR", "POLYGON", "LINE"];

// Рамки нод относительно корня и свойства векторов (в дереве у них только размер).
function collectExtras(root: SceneNode, maxNodes: number, boxes: boolean): Map<string, NodeExtra> {
	const extras = new Map<string, NodeExtra>();
	const rb = (root as SceneNode & { absoluteBoundingBox: Rect | null }).absoluteBoundingBox;
	let visited = 0;
	const walk = (n: SceneNode, depth: number): void => {
		if (visited++ >= maxNodes || depth > 14 || n.visible === false) return;
		const extra: NodeExtra = {};
		const b = (n as SceneNode & { absoluteBoundingBox: Rect | null }).absoluteBoundingBox;
		if (boxes && b && rb) extra.box = [Math.round(b.x - rb.x), Math.round(b.y - rb.y), Math.round(b.width), Math.round(b.height)];
		if (VECTORS.includes(n.type)) {
			const v: Record<string, unknown> = {};
			const fill = "fills" in n && Array.isArray(n.fills) ? firstSolid(n.fills as readonly Paint[]) : undefined;
			const stroke = "strokes" in n ? firstSolid(n.strokes as readonly Paint[]) : undefined;
			if (fill) v.fill = fill;
			if (stroke) {
				v.stroke = stroke;
				const w = (n as GeometryMixin).strokeWeight;
				if (typeof w === "number") v.strokeWidth = w;
			}
			if ("rotation" in n && n.rotation) v.rotation = Math.round(n.rotation * 100) / 100;
			if ("opacity" in n && n.opacity !== 1) v.opacity = n.opacity;
			if (Object.keys(v).length) extra.vector = v;
		}
		if (extra.box || extra.vector) extras.set(n.id, extra);
		if ("children" in n) for (const c of n.children) walk(c, depth + 1);
	};
	walk(root, 0);
	return extras;
}

function serialize(node: SceneNode, depth: number, maxNodes: number): unknown {
	state.serializedNodes = 0;
	setSerializeLimits(maxNodes, depth);
	try {
		return serializeNode(node, 0);
	} finally {
		setSerializeLimits();
	}
}

// Экспорт нод в байты (base64): векторные иконки — svg, остальное — png (если не задан format).
async function exportNodes(
	ids: string[],
	args: Record<string, unknown>,
): Promise<{ files: Record<string, unknown>[]; skipped: { id: string; reason: string }[] }> {
	const files: Record<string, unknown>[] = [];
	const skipped: { id: string; reason: string }[] = [];
	let total = 0;
	for (const id of ids) {
		const node = await nodeById(id);
		if (!node || !("exportAsync" in node)) {
			skipped.push({ id, reason: "не найдена или не экспортируется" });
			continue;
		}
		const format = exportFormat(args.format, defaultExportFormat(node as unknown as AssetNode));
		const scale = exportScale(args.scale);
		try {
			const bytes = await node.exportAsync(
				format === "svg"
					? { format: "SVG" }
					: format === "pdf"
						? { format: "PDF" }
						: { format: format === "jpg" ? "JPG" : "PNG", constraint: { type: "SCALE", value: scale } },
			);
			total += bytes.length;
			if (total > MAX_EXPORT_BYTES) {
				skipped.push({ id, reason: "превышен общий лимит размера — экспортируйте остальное отдельным вызовом" });
				continue;
			}
			files.push({
				id: node.id,
				name: node.name,
				format,
				scale: format === "png" || format === "jpg" ? scale : undefined,
				width: Math.round(node.width),
				height: Math.round(node.height),
				data: figma.base64Encode(bytes),
			});
		} catch (err) {
			skipped.push({ id, reason: String(err) });
		}
	}
	return { files, skipped };
}

export async function runMcpTool(tool: unknown, args: Record<string, unknown>): Promise<McpResult> {
	if (!isMcpTool(tool)) return { ok: false, error: `неизвестный инструмент: ${String(tool)}` };
	try {
		switch (tool) {
			case "status": {
				const sel = figma.currentPage.selection;
				return {
					ok: true,
					data: {
						file: figma.root.name,
						fileKey: (figma as unknown as { fileKey?: string }).fileKey,
						page: figma.currentPage.name,
						pageId: figma.currentPage.id,
						editor: figma.editorType,
						selected: sel.slice(0, 20).map((n) => ({ id: n.id, name: n.name, type: n.type })),
						selectedCount: sel.length,
						topLevelNodes: figma.currentPage.children.length,
					},
				};
			}
			case "selection": {
				const sel = figma.currentPage.selection;
				if (!sel.length) return { ok: true, data: { selected: false, nodes: [] } };
				const nodes = sel.slice(0, 10).map((n) => serialize(n as SceneNode, 8, 300));
				return { ok: true, data: { selected: true, count: sel.length, nodes } };
			}
			case "outline":
				return { ok: true, data: pageOutline() };
			case "node": {
				const a = nodeArgs(args);
				if (!a) return { ok: false, error: "нужен id ноды" };
				const node = await nodeById(a.id);
				if (!node) return { ok: false, error: `нода ${a.id} не найдена` };
				let spec = serialize(node, a.depth, a.maxNodes) as Spec;
				spec = mergeExtras(spec, collectExtras(node, a.maxNodes + 100, a.boxes));
				if (a.compact) spec = compactSpec(spec);
				return { ok: true, data: spec };
			}
			case "tokens": {
				const a = nodeArgs(args);
				if (!a) return { ok: false, error: "нужен id ноды" };
				const node = await nodeById(a.id);
				if (!node) return { ok: false, error: `нода ${a.id} не найдена` };
				// Векторы (линии, пятна) в дереве без цветов — подмешиваем их заливки и обводки.
				const spec = mergeExtras(serialize(node, 12, 600) as Spec, collectExtras(node, 700, false));
				return { ok: true, data: collectTokens(spec) };
			}
			case "screenshot": {
				const a = nodeArgs(args);
				if (!a) return { ok: false, error: "нужен id ноды" };
				const node = await nodeById(a.id);
				if (!node || !("exportAsync" in node)) return { ok: false, error: `нода ${a.id} не найдена или не экспортируется` };
				const scale = screenshotScale(node.width, node.height, args.maxSize, args.scale);
				if (node.width * scale * node.height * scale > 40_000_000)
					return {
						ok: false,
						error: "слишком большой скриншот (больше 40 мегапикселей) — уменьшите scale/maxSize или снимайте блоки по отдельности",
					};
				const bytes = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: scale } });
				return {
					ok: true,
					data: {
						id: node.id,
						name: node.name,
						width: Math.round(node.width),
						height: Math.round(node.height),
						scale,
						pixels: [Math.round(node.width * scale), Math.round(node.height * scale)],
						note: scaleNote(scale, node.width, node.height),
					},
					images: [{ data: figma.base64Encode(bytes), mimeType: "image/png" }],
				};
			}
			case "search": {
				if (typeof args.query !== "string" || !args.query) return { ok: false, error: "нужен query" };
				let scope = figma.currentPage as unknown as SearchNode;
				if (typeof args.in === "string" && args.in) {
					const root = await figma.getNodeByIdAsync(args.in);
					if (!root || root.removed || !("findAll" in root)) return { ok: false, error: `нода ${args.in} не найдена` };
					scope = root as unknown as SearchNode;
				}
				const found = searchIn(scope, {
					query: args.query,
					text: args.text === true,
					type: typeof args.type === "string" ? args.type : undefined,
					limit: clampInt(args.limit, 1, 100, 50),
					offset: clampInt(args.offset, 0, 100000, 0),
				});
				return { ok: true, data: found };
			}
			case "assets": {
				const a = nodeArgs(args);
				if (!a) return { ok: false, error: "нужен id ноды" };
				const node = await nodeById(a.id);
				if (!node) return { ok: false, error: `нода ${a.id} не найдена` };
				const assets = collectAssets(node as unknown as AssetNode);
				return { ok: true, data: { id: node.id, name: node.name, count: assets.length, assets } };
			}
			case "export": {
				const ids = exportIds(args);
				if (!ids.length) return { ok: false, error: "нужен id или ids" };
				return { ok: true, data: await exportNodes(ids, args) };
			}
			case "export_assets": {
				const a = nodeArgs(args);
				if (!a) return { ok: false, error: "нужен id ноды" };
				const node = await nodeById(a.id);
				if (!node) return { ok: false, error: `нода ${a.id} не найдена` };
				const kinds = typeof args.kinds === "string" ? args.kinds : "all";
				const assets = collectAssets(node as unknown as AssetNode).filter((x) => kinds === "all" || x.kind === kinds);
				if (!assets.length) return { ok: true, data: { assets: [], files: [], skipped: [] } };
				const exported = await exportNodes(
					assets.map((x) => x.id).slice(0, 30),
					{ ...args, format: undefined },
				);
				return { ok: true, data: { assets, ...exported } };
			}
			case "design_system": {
				const ds = await loadDesignSystem();
				return { ok: true, data: { ...ds, components: loadComponents() } };
			}
		}
	} catch (err) {
		return { ok: false, error: String(err) };
	}
}
