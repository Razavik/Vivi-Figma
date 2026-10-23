// Инструменты MCP-сервера Vivi: чтение дизайна из открытого файла Figma и (с 0.3)
// создание и правка. write:true — меняют файл, local:true — отвечает сам сервер, без плагина.
// Описания и схемы аргументов — единый источник для mcp.mjs (регистрация) и
// моста (белый список имён, чтобы через relay не прошла чужая операция).
import { z } from "zod";

// Пакетный режим: вместо одного id можно передать несколько — один вызов вместо серии.
export const BATCH_LIMITS = { node: 10, screenshot: 8, tokens: 10, assets: 10 };
const idsField = (max) =>
	z.array(z.string()).min(1).max(max).optional().describe(`Several nodes in ONE call (up to ${max}) instead of id: the result is a list, one entry per node, in the same order`);

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
			"Structure of one node and its children as a JSON tree (type, name, sizes, auto-layout, padding, gap, fills, strokes, radius, shadows, text with fonts, component links; vectors/lines carry fill, stroke, strokeWidth, rotation). Every node has box:[x,y,w,h] relative to the requested node. Nodes carry vars (names of bound Figma variables/styles) and asset (photo/icon + export format) where present. Text wrapped only by block width comes as one line with lines:N. Deeper trees are cut by maxNodes/depth.",
		input: {
			id: z.string().optional().describe('Figma node id, e.g. "12:345"'),
			ids: idsField(BATCH_LIMITS.node),
			depth: z.number().int().min(1).max(12).optional().describe("Tree depth, default 6"),
			maxNodes: z.number().int().min(10).max(600).optional().describe("Node limit, default 300"),
			compact: z.boolean().optional().describe("Drop default values (zero padding/gap, align start/left, name = text). Default true"),
			boxes: z.boolean().optional().describe('Add "box":[x,y,w,h] to every node, relative to the requested node (absolute placement). Default true'),
			format: z.enum(["json", "css"]).optional().describe("json (default): node tree. css: ready HTML with inline flex styles, var(--name, #hex) for variables bound in Figma, :root list, asset <img> placeholders"),
		},
	},
	screenshot: {
		description:
			"PNG picture of a node exactly as it looks in Figma (use it to judge visual design: spacing, colors, hierarchy).",
		input: {
			id: z.string().optional().describe("Figma node id"),
			ids: idsField(BATCH_LIMITS.screenshot),
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
			id: z.string().optional().describe('Node id ("12:345", "12-345") or a Figma link with ?node-id=…'),
			ids: idsField(BATCH_LIMITS.assets),
		},
	},
	export: {
		description:
			"Save nodes as image files (PNG/JPG/SVG/PDF) on disk and return their paths — to use photos and icons from the design in code. Default format: svg for vector icons, png for the rest; raster scale 0.5–4 (default 2). Files are written only inside the current project: <project>/figma-exports by default, or the absolute folder passed as dir (must be inside the project).",
		input: {
			ids: z.array(z.string()).min(1).max(30).describe("Node ids (or links with node-id) to export"),
			format: z.enum(["png", "jpg", "svg", "pdf"]).optional(),
			scale: z.number().min(0.5).max(4).optional(),
			folder: z.string().optional().describe("Subfolder name inside the target folder, letters (any language), digits, space, - _ ."),
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
			folder: z.string().optional().describe("Subfolder inside the target folder (letters (any language), digits, space, - _ .)"),
			dir: z.string().optional().describe("Absolute target folder INSIDE the current project (e.g. <project>/public/img); anything outside the project is refused. Default: <project>/figma-exports"),
		},
	},
	tokens: {
		description:
			"Design tokens used inside a node: colors (with usage fill/text/stroke), fonts (family, weight, size, line height), radii, gaps, paddings, shadows — most used first. Use it to write CSS variables.",
		input: {
			id: z.string().optional().describe("Node id or Figma link with node-id"),
			ids: idsField(BATCH_LIMITS.tokens),
		},
	},
	design_system: {
		description:
			"Local styles and variables of the file: color styles, text styles, variables with values, plus the list of components.",
		input: {},
	},
};

const SPEC_BRIEF = `Spec = a tree of nodes, each {"type":...}: frame (layout none|vertical|horizontal, gap, padding [v,h]|[t,r,b,l], align, cross, w/h number|"hug"|"fill", fill "#RRGGBB"|gradient, radius, stroke, strokeWidth, shadow, clip, children), text (text, fontSize, fontWeight regular|medium|semibold|bold, fontFamily, color, align, lineHeight, letterSpacing, textCase, w), rect, ellipse, line, image ({"query":"keywords"} downloads a stock photo; or "data" base64 + "mime"), icon ({"icon":"arrow-right"} Lucide name; "ph:heart" Phosphor if installed), instance ({"component":"<id|name>","overrides":{...}}), shape/bool (vector shapes). Root must be a frame with a numeric w. Auto-layout by default ("hug" + padding), no emoji, real copy. Call figma_guide before the first design — it has the full schema and the design rules.`;

export const MCP_TOOLS_WRITE = {
	create: {
		write: true,
		timeoutMs: 120_000,
		description:
			"Build a design in the open Figma file as REAL nodes (frames, auto-layout, text, shapes, photos, icons) from a JSON spec. One section per call (up to ~80 nodes); returns rootId, node tree with ids, lint issues, warnings and a screenshot. Use parent to put it inside a container, replace to rebuild an existing node in place. Undo with figma_undo. Stock photos (image.query) are searched on the internet by the keywords. " +
			SPEC_BRIEF,
		input: {
			spec: z.object({ type: z.literal("frame") }).passthrough().describe("Root frame spec"),
			parent: z.string().optional().describe("Container node id to insert into (default: the current page)"),
			replace: z.string().optional().describe("Node id to delete and rebuild from this spec (only for an explicit redesign)"),
		},
	},
	edit: {
		write: true,
		timeoutMs: 120_000,
		description:
			'Change existing nodes with a list of operations run in order: update (fields: name, fill, stroke, radius, shadow, text, fontSize, color, w, h, layout, gap, padding, align…; bulk via "ids":[..] or "match":{in,name,text,type}), move, delete, insert (a full node spec into a parent), duplicate, rename, reorder, restructure (regroup nodes by a target tree), group/ungroup, make_component, combine_variants, rebuild. Ids come from figma_node/figma_outline. An op that creates a node may carry "as":"name" — later ops refer to it as "$name" ("$page" = current page). Returns warnings (failed ops), lint issues, changed trees and a screenshot. See figma_guide for the full op list.',
		input: {
			edits: z.array(z.object({ op: z.string() }).passthrough()).min(1).max(200).describe("Operations, e.g. [{op:'update',id:'12:3',fill:'#111111'}]"),
		},
	},
	undo: {
		write: true,
		description: "Revert the last N write runs (figma_create / figma_edit calls) made through this plugin: restores changed nodes and removes created ones. Default 1; the last 8 runs are kept.",
		input: {
			runs: z.number().int().min(1).max(8).optional().describe("How many recent runs to revert, default 1"),
		},
	},
	schema: {
		local: true,
		description: 'Full schema text of rarely used spec parts: "shapes" (blob/wave/star/polygon/ring/path + boolean ops + masks), "grouping" (group/ungroup). Without name lists the names.',
		input: {
			name: z.string().optional().describe("shapes | grouping"),
		},
	},
	guide: {
		local: true,
		description:
			"Design guide for creating designs: spec = node schema (all fields), craft = sizing + design rules, components = reusing components, edits = workflow and the list of edit operations. Read spec and edits (and craft for pages) BEFORE the first figma_create. Without topic returns spec + edits.",
		input: {
			topic: z.enum(["spec", "craft", "components", "edits", "all"]).optional(),
		},
	},
	icons: {
		local: true,
		description: 'Find icon names for {"type":"icon","icon":"<name>"}: Lucide (always) plus Phosphor "ph:", Tabler "tabler:", Material "ms:" when installed. Returns up to 20 matches for a keyword.',
		input: {
			query: z.string().describe('Keyword, e.g. "cart", "arrow", "user"'),
		},
	},
};
Object.assign(MCP_TOOLS, MCP_TOOLS_WRITE);

export const MCP_TOOL_NAMES = Object.keys(MCP_TOOLS);

export function isMcpTool(name) {
	return typeof name === "string" && Object.hasOwn(MCP_TOOLS, name);
}

// Инструменты, которые уходят в плагин (без local).
export function isPluginTool(name) {
	return isMcpTool(name) && !MCP_TOOLS[name].local;
}

export function timeoutFor(name, fallback) {
	return (isMcpTool(name) && MCP_TOOLS[name].timeoutMs) || fallback;
}
