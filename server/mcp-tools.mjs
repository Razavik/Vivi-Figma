// Инструменты MCP-сервера Vivi: только чтение дизайна из открытого файла Figma.
// Описания и схемы аргументов — единый источник для mcp.mjs (регистрация) и
// моста (белый список имён, чтобы через relay не прошла чужая операция).
import { z } from "zod";

export const MCP_TOOLS = {
	status: {
		description:
			"Which Figma file/page is open in the Vivi plugin and how many nodes are selected. Call it first to check the plugin is connected.",
		input: {},
	},
	selection: {
		description:
			"The nodes currently selected in Figma: their full structure (layout, sizes, colors, text, fonts) as a JSON tree with node ids.",
		input: {},
	},
	outline: {
		description:
			"Top-level frames of the current page (id, name, size, position, child count) — use it to pick what to open with node/screenshot.",
		input: {},
	},
	node: {
		description:
			"Structure of one node and its children as a JSON tree (type, name, sizes, auto-layout, padding, gap, fills, strokes, radius, shadows, text with fonts, component links; vectors/lines carry fill, stroke, strokeWidth, rotation). Every node has box:[x,y,w,h] relative to the requested node. Deeper trees are cut by maxNodes/depth.",
		input: {
			id: z.string().describe('Figma node id, e.g. "12:345"'),
			depth: z.number().int().min(1).max(12).optional().describe("Tree depth, default 6"),
			maxNodes: z.number().int().min(10).max(600).optional().describe("Node limit, default 300"),
			compact: z.boolean().optional().describe("Drop default values (zero padding/gap, align start/left, name = text). Default true"),
			boxes: z.boolean().optional().describe('Add "box":[x,y,w,h] to every node, relative to the requested node (absolute placement). Default true'),
		},
	},
	screenshot: {
		description:
			"PNG picture of a node exactly as it looks in Figma (use it to judge visual design: spacing, colors, hierarchy).",
		input: {
			id: z.string().describe("Figma node id"),
			maxSize: z.number().int().min(128).max(4096).optional().describe("Longest side in px, default 1024"),
			scale: z.number().min(0.1).max(4).optional().describe("Explicit scale (overrides maxSize). Use 1–2 for small text; for long pages screenshot child blocks one by one"),
		},
	},
	search: {
		description:
			"Find nodes by name (or by text content) on the page or inside one frame; filter by type (TEXT, FRAME, COMPONENT, INSTANCE…).",
		input: {
			query: z.string().describe('Substring of the layer name; "*" matches any node (with type)'),
			text: z.boolean().optional().describe("Also search inside text layers"),
			type: z.string().optional().describe("Only this node type, e.g. TEXT or FRAME"),
			in: z.string().optional().describe("Search inside this node id only (default: the whole page)"),
			limit: z.number().int().min(1).max(100).optional(),
			offset: z.number().int().min(0).optional(),
		},
	},
	assets: {
		description:
			"List the assets inside a node: photos (image fills) and icons (vectors) with id, name, size and the best export format. Use it before export to get the exact ids. Accepts a node id or a figma.com link with node-id.",
		input: {
			id: z.string().describe('Node id ("12:345", "12-345") or a Figma link with ?node-id=…'),
		},
	},
	export: {
		description:
			"Save nodes as image files (PNG/JPG/SVG/PDF) on disk and return their paths — to use photos and icons from the design in code. Default format: svg for vector icons, png for the rest; raster scale 0.5–4 (default 2). Files are written only inside the current project: <project>/figma-exports by default, or the absolute folder passed as dir (must be inside the project).",
		input: {
			ids: z.array(z.string()).min(1).max(30).describe("Node ids (or links with node-id) to export"),
			format: z.enum(["png", "jpg", "svg", "pdf"]).optional(),
			scale: z.number().min(0.5).max(4).optional(),
			folder: z.string().optional().describe("Subfolder name inside the target folder, letters/digits/-_ only"),
			dir: z.string().optional().describe("Absolute target folder INSIDE the current project (e.g. <project>/public/img); anything outside the project is refused. Default: <project>/figma-exports"),
		},
	},
	export_assets: {
		description:
			"One call: find every photo and icon inside a node and save them as files (icons as svg, photos as png@2x). Identical images are saved once. Returns the list of assets with paths.",
		input: {
			id: z.string().describe("Node id or Figma link with node-id"),
			kinds: z.enum(["all", "photo", "icon"]).optional().describe("Which assets to export, default all"),
			scale: z.number().min(0.5).max(4).optional().describe("Raster scale, default 2"),
			folder: z.string().optional().describe("Subfolder inside the target folder (letters/digits/-_ only)"),
			dir: z.string().optional().describe("Absolute target folder INSIDE the current project (e.g. <project>/public/img); anything outside the project is refused. Default: <project>/figma-exports"),
		},
	},
	tokens: {
		description:
			"Design tokens used inside a node: colors (with usage fill/text/stroke), fonts (family, weight, size, line height), radii, gaps, paddings, shadows — most used first. Use it to write CSS variables.",
		input: {
			id: z.string().describe("Node id or Figma link with node-id"),
		},
	},
	design_system: {
		description:
			"Local styles and variables of the file: color styles, text styles, variables with values, plus the list of components.",
		input: {},
	},
};

export const MCP_TOOL_NAMES = Object.keys(MCP_TOOLS);

export function isMcpTool(name) {
	return typeof name === "string" && Object.hasOwn(MCP_TOOLS, name);
}
