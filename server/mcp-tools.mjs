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
			"PNG picture of a node exactly as it looks in Figma (use it to judge visual design: spacing, colors, hierarchy). A tall page is unreadable as one picture: use tiles:N for a sequence of readable slices, or region:[x,y,w,h] to zoom into a part (coordinates from figma_node box).",
		input: {
			id: z.string().optional().describe("Figma node id"),
			ids: idsField(BATCH_LIMITS.screenshot),
			maxSize: z.number().int().min(128).max(4096).optional().describe("Longest side in px, default 1024"),
			scale: z.number().min(0.1).max(4).optional().describe("Explicit scale (overrides maxSize). Use 1–2 for small text"),
			region: z.array(z.number()).length(4).optional().describe("CROP: [x, y, w, h] in the node's own coordinates (px from its top-left) — a zoomed look at one part (a heading, a card, a form). Default scale fits maxSize, up to 2x"),
			tiles: z.number().int().min(2).max(12).optional().describe("Cut the node into N vertical slices (slightly overlapping) and return N images in order — read a long page in detail instead of one tiny picture"),
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

const SPEC_BRIEF = `Spec = a tree of nodes, each {"type":...}: frame (layout none|vertical|horizontal, gap, padding [v,h]|[t,r,b,l], align, cross, w/h number|"hug"|"fill", fill "#RRGGBB"|gradient, radius, stroke, strokeWidth, shadow, clip, children), text (text, fontSize, fontWeight regular|medium|semibold|bold, fontFamily, color, align, lineHeight, letterSpacing, textCase, w), rect, ellipse, line, image ({"query":"keywords"} downloads a stock photo; or "path" = a file inside the project; or "data" base64 + "mime"), icon ({"icon":"arrow-right"} Lucide name; "ph:heart" Phosphor if installed), instance ({"component":"<id|name>","overrides":{...}}), shape/bool (vector shapes), and ready blocks: chart (bar/line/area/pie/donut…), table, avatar, logo, qr, barcode, mockup, map — expanded into real layers (editable; change a block's data with update + the block field). Full block fields: figma_guide + figma_schema. Root must be a frame with a numeric w. Auto-layout by default ("hug" + padding), no emoji, real copy. Call figma_guide before the first design — it has the full schema and the design rules. For a NEW page/screen also read figma_guide topics process + taste so it does not look generic.`;

const fileField = z.string().optional().describe("Expected name of the open Figma file (from figma_status): the write is refused if another file is open now");

export const MCP_TOOLS_WRITE = {
	create: {
		write: true,
		timeoutMs: 120_000,
		description:
			"Build a design in the open Figma file as REAL nodes (frames, auto-layout, text, shapes, photos, icons) from a JSON spec. One section per call (up to ~80 nodes); returns rootId, node tree with ids, lint issues, warnings and a screenshot. New top-level frames are placed in free space (right of what is already on the page, top-aligned; direction:'below' puts them under it, after:<id> next to a given node, x/y exact) so they never overlap. Use parent to put it inside a container, replace to rebuild an existing node in place. Undo with figma_undo. Stock photos (image.query) are searched on the internet by the keywords. " +
			SPEC_BRIEF,
		input: {
			spec: z.object({ type: z.literal("frame") }).passthrough().describe("Root frame spec"),
			parent: z.string().optional().describe("Container node id to insert into (default: the current page)"),
			replace: z.string().optional().describe("Node id to delete and rebuild from this spec (only for an explicit redesign)"),
			after: z.string().optional().describe("Place the new frame next to this node (right of it, or below with direction:'below') instead of the default"),
			direction: z.enum(["right", "below"]).optional().describe("Where free space is taken: right of everything on the page (default) or below it / below 'after'"),
			x: z.number().optional().describe("Explicit position on the page (needs y too)"),
			y: z.number().optional(),
			gap: z.number().min(0).max(2000).optional().describe("Space to the neighbour, default 120"),
			file: fileField,
		},
	},
	edit: {
		write: true,
		timeoutMs: 120_000,
		description:
			'Change existing nodes with a list of operations run in order: update (fields: name, fill, stroke, radius, shadow, text, fontSize, color, w, h, layout, gap, padding, align…; bulk via "ids":[..] or "match":{in,name,text,type}), move, delete, insert (a full node spec into a parent), duplicate, rename, reorder, restructure (regroup nodes by a target tree), group/ungroup, make_component, combine_variants, rebuild. Ids come from figma_node/figma_outline. An op that creates a node may carry "as":"name" — later ops refer to it as "$name" ("$page" = current page). Returns warnings (failed ops), lint issues, changed trees and a screenshot. See figma_guide for the full op list.',
		input: {
			edits: z.array(z.object({ op: z.string() }).passthrough()).min(1).max(200).describe("Operations, e.g. [{op:'update',id:'12:3',fill:'#111111'}]"),
			file: fileField,
		},
	},
	undo: {
		write: true,
		description: "Revert the last N write runs (figma_create / figma_edit calls) made through this plugin: restores changed nodes and removes created ones. Default 1; the last 8 runs are kept.",
		input: {
			runs: z.number().int().min(1).max(8).optional().describe("How many recent runs to revert, default 1"),
			file: fileField,
		},
	},
	styles: {
		write: true,
		description:
			'Create or update (by name) color styles, text styles and variables from design tokens, so a design system exists before building. Then reference them in specs as "style:<name>" (fill, color, stroke). Not covered by figma_undo.',
		input: {
			colors: z.record(z.string(), z.string()).optional().describe('{"Brand/Primary":"#B6F24A","Text/Default":"#F2F5FF"}'),
			texts: z
				.record(z.string(), z.object({ family: z.string().optional(), weight: z.string().optional(), size: z.number(), lineHeight: z.number().optional(), letterSpacing: z.number().optional() }))
				.optional()
				.describe('{"Heading/H1":{"family":"Inter","weight":"bold","size":56,"lineHeight":60}}'),
			variables: z
				.object({ collection: z.string(), values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])) })
				.optional()
				.describe('Variables in one collection: hex strings become COLOR, numbers FLOAT, booleans BOOLEAN, other strings STRING'),
			file: fileField,
		},
	},
	componentize: {
		write: true,
		description:
			"Turn 2+ repeated blocks of the SAME structure (e.g. 4 stat cards, 3 list rows) into one main component plus instances: the main component is moved into the top-level \"Components\" frame (created if missing), and the design keeps ONLY instances that retain their own texts and photos. Run it before you call a design done for every repeated card, row, chip, button, FAQ item, review. ids must be frames; undo with figma_undo.",
		input: {
			ids: z.array(z.string()).min(2).max(40).describe("Node ids (or links) of the repeated blocks"),
			name: z.string().optional().describe('Component name, e.g. "Card / Stat"'),
			file: fileField,
		},
	},
	fonts: {
		description: "Fonts available in Figma: families (optionally filtered by query) and those already used on the page; with family — its available styles (weights). Pick fontFamily for specs from here.",
		input: {
			query: z.string().optional().describe("Filter families by substring"),
			family: z.string().optional().describe("Return the styles of this family"),
		},
	},
	focus: {
		description: "Select nodes and scroll/zoom Figma to show them to the user (switches page if needed). Use after building something the user should see.",
		input: {
			ids: z.array(z.string()).min(1).max(50).describe("Node ids or Figma links"),
		},
	},
	schema: {
		local: true,
		description: 'Full schema text of rarely used spec parts: "logo", "barcode", "qr", "mockup", "map" (ready blocks), "shapes" (blob/wave/star/polygon/ring/path + boolean ops + masks), "patterns" (texture fills), "grouping" (group/ungroup). Without name lists the names.',
		input: {
			name: z.string().optional().describe("logo | barcode | qr | mockup | map | shapes | patterns | grouping"),
		},
	},
	guide: {
		local: true,
		description:
			"Design guide for creating designs: spec = node schema (all fields), craft = sizing + design rules, components = reusing components, edits = workflow and the list of edit operations. Taste layer for NEW pages/screens (read it before designing so results do not look generic): process (order of work: ask, shape, direction, hero first, sweep), taste (what makes a design look designed, reflexes to avoid), typography, layout, imagery, patterns (textures), anatomy (sections per job: book, buy, subscribe...), shapes (21 page shapes), genres, trends (what is current in 2026 and what is fading), composition (make sections unusual: overlaps, absolute placement, shapes; an idea, not a recipe). Read spec and edits (and craft for pages) BEFORE the first figma_create. Without topic returns spec + edits.",
		input: {
			topic: z.string().optional().describe("spec | craft | components | edits | all (these four) | process | taste | typography | layout | imagery | patterns | anatomy | shapes | genres | trends | composition"),
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
