// Инструменты, завязанные на API Figma: паттерн-заливка и аннотации ревью. Чистая логика
// (разбор строк, отбор нод, проверки) — в extras-core.ts.
import { state } from "./canvas-state";
import { VIVI_REVIEW, addAnnotation, tiledSvg, withoutCategory } from "./extras-core";

type Pattern = { key: string; svg: string; side: number; params?: Record<string, unknown> };

// ── Поля ноды: pattern ─────────────────────────────────────────────────────
export function applyExtras(node: SceneNode, spec: Record<string, unknown>): void {
	try {
		const p = spec.pattern as Pattern | undefined;
		if (p && typeof p.svg === "string" && typeof p.key === "string") applyPattern(node, p);
	} catch (err) {
		state.warnings.push(`${node.name}: ${String(err)}`);
	}
}

// Плитка паттерна живёт один раз в «Components / Patterns» (по ключу параметров).
function tileFor(p: Pattern): SceneNode | null {
	const name = `Pattern / ${p.key}`;
	let holder = figma.currentPage.findOne(
		(n) => n.type === "FRAME" && n.name === "Components / Patterns",
	) as FrameNode | null;
	if (!holder) {
		holder = figma.createFrame();
		holder.name = "Components / Patterns";
		holder.fills = [];
		holder.layoutMode = "HORIZONTAL";
		holder.layoutSizingHorizontal = "HUG";
		holder.layoutSizingVertical = "HUG";
		holder.itemSpacing = 16;
		const bottom = figma.currentPage.children.reduce((m, n) => Math.max(m, n.y + n.height), 0);
		holder.y = bottom + 200;
	}
	const existing = holder.findOne((n) => n.name === name);
	if (existing) return existing;
	const tile = figma.createNodeFromSvg(p.svg);
	tile.name = name;
	holder.appendChild(tile);
	return tile;
}

// PATTERN-заливка поверх фона; при сбое API — svg-слой с повторённой плиткой.
function applyPattern(node: SceneNode, p: Pattern): void {
	if (!("fills" in node)) return;
	try {
		const tile = tileFor(p);
		if (!tile) throw new Error("нет плитки");
		const paint = {
			type: "PATTERN",
			sourceNodeId: tile.id,
			tileType: "RECTANGULAR",
			scalingFactor: 1,
			spacing: { x: 0, y: 0 },
			horizontalAlignment: "START",
		} as unknown as Paint;
		const fills = Array.isArray(node.fills) ? [...node.fills] : [];
		node.fills = [...fills, paint];
		node.setPluginData("pattern", p.key);
		if (p.params) node.setPluginData("patternFill", JSON.stringify(p.params));
	} catch (err) {
		state.warnings.push(`pattern: заливка недоступна (${String(err)}), использую svg-слой`);
		overlayPattern(node, p);
	}
}

function overlayPattern(node: SceneNode, p: Pattern): void {
	if (node.type !== "FRAME" && node.type !== "COMPONENT") return;
	const w = Math.round(node.width);
	const h = Math.round(node.height);
	if (w < 1 || h < 1) return;
	const layer = figma.createNodeFromSvg(tiledSvg(p.svg, p.side, w, h));
	layer.name = "Pattern";
	node.appendChild(layer);
	if (node.layoutMode !== "NONE") (layer as SceneNode & { layoutPositioning: string }).layoutPositioning = "ABSOLUTE";
	layer.x = 0;
	layer.y = 0;
	node.clipsContent = true;
}

// ── Аннотации ──────────────────────────────────────────────────────────────
async function category(label: string, color: AnnotationCategoryColor): Promise<AnnotationCategory> {
	const all = await figma.annotations.getAnnotationCategoriesAsync();
	return all.find((c) => c.label === label) ?? (await figma.annotations.addAnnotationCategoryAsync({ label, color }));
}

function hasAnnotations(n: SceneNode): n is SceneNode & { annotations: ReadonlyArray<Annotation> } {
	return "annotations" in n;
}

// Замечание ревью на ноде (аннотация категории «Vivi review»).
export async function annotateNode(node: SceneNode, text: string): Promise<boolean> {
	if (!hasAnnotations(node)) return false;
	const cat = await category(VIVI_REVIEW, "orange");
	const next = addAnnotation(node.annotations as Annotation[], {
		label: text.slice(0, 300),
		categoryId: cat.id,
	});
	(node as unknown as { annotations: Annotation[] }).annotations = next;
	return true;
}

// Очистка аннотаций Vivi (ревью) на ноде и во всех её детях.
export async function clearAnnotations(root: SceneNode | PageNode): Promise<number> {
	const ids = new Set<string>();
	ids.add((await category(VIVI_REVIEW, "orange")).id);
	let cleared = 0;
	const visit = (n: SceneNode): void => {
		if (hasAnnotations(n) && n.annotations.length) {
			let rest = [...n.annotations];
			for (const id of ids) rest = withoutCategory(rest, id);
			if (rest.length !== n.annotations.length) {
				(n as unknown as { annotations: Annotation[] }).annotations = rest;
				cleared++;
			}
		}
		if ("children" in n) for (const c of n.children) visit(c);
	};
	if (root.type === "PAGE") for (const c of root.children) visit(c);
	else visit(root);
	return cleared;
}

// Для сериализатора: что видит модель (аннотации на ноде).
export function extrasOf(node: SceneNode): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (hasAnnotations(node)) {
		const open = node.annotations.filter((a) => a.label).map((a) => String(a.label).slice(0, 120));
		if (open.length) out.annotations = open.slice(0, 5);
	}
	return out;
}
