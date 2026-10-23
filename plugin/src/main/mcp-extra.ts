/// <reference types="@figma/plugin-typings" />
// Дополнительные инструменты MCP: шрифты, показ ноды, стили и переменные,
// сборка компонента из повторяющихся блоков.
import { loadTextFonts } from "./builder";
import { loadDesignSystem } from "./designsystem";
import { beginWrite, type WriteResult } from "./mcp-write";
import { recordCreated, snapshotFor, undoableRuns } from "./undo";

const HEX = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;
const WEIGHT_STYLE: Record<string, string[]> = {
	regular: ["Regular", "Book", "Normal"],
	medium: ["Medium"],
	semibold: ["Semi Bold", "SemiBold", "Semibold", "DemiBold"],
	bold: ["Bold"],
};

function hexToRgba(hex: string): { color: RGB; opacity: number } {
	const h = hex.replace("#", "");
	const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
	return { color: { r: n(0), g: n(2), b: n(4) }, opacity: h.length === 8 ? n(6) : 1 };
}

async function nodeOf(id: unknown): Promise<SceneNode | null> {
	if (typeof id !== "string") return null;
	const node = await figma.getNodeByIdAsync(id);
	return node && !node.removed && node.type !== "PAGE" && node.type !== "DOCUMENT" ? (node as SceneNode) : null;
}

// figma_fonts: семейства (с фильтром) или начертания одного семейства.
export async function runFonts(args: Record<string, unknown>): Promise<WriteResult> {
	const all = await figma.listAvailableFontsAsync();
	if (typeof args.family === "string" && args.family) {
		const styles = all.filter((f) => f.fontName.family.toLowerCase() === args.family!.toString().toLowerCase()).map((f) => f.fontName.style);
		return { ok: true, data: { family: args.family, styles, found: styles.length > 0 } };
	}
	const q = typeof args.query === "string" ? args.query.toLowerCase() : "";
	const used = new Set<string>();
	for (const n of figma.currentPage.findAllWithCriteria({ types: ["TEXT"] }).slice(0, 400)) {
		if (n.fontName !== figma.mixed) used.add(n.fontName.family);
	}
	const families = [...new Set(all.map((f) => f.fontName.family))].filter((f) => !f.startsWith(".") && (!q || f.toLowerCase().includes(q))).sort();
	return { ok: true, data: { usedOnPage: [...used], total: families.length, families: families.slice(0, 200) } };
}

// figma_focus: выделить ноды и показать их на экране.
export async function runFocus(args: Record<string, unknown>): Promise<WriteResult> {
	const ids = Array.isArray(args.ids) ? args.ids : typeof args.id === "string" ? [args.id] : [];
	const nodes: SceneNode[] = [];
	for (const id of ids.slice(0, 50)) {
		const n = await nodeOf(id);
		if (n) nodes.push(n);
	}
	if (!nodes.length) return { ok: false, error: "ноды не найдены" };
	const page = nodes[0].parent && nodes[0].parent.type === "PAGE" ? nodes[0].parent : null;
	if (page && page !== figma.currentPage) await figma.setCurrentPageAsync(page);
	figma.currentPage.selection = nodes;
	figma.viewport.scrollAndZoomIntoView(nodes);
	return { ok: true, data: { focused: nodes.map((n) => ({ id: n.id, name: n.name })) } };
}

// figma_styles: цветовые и текстовые стили, переменные — создаёт или обновляет по имени.
export async function runStyles(args: Record<string, unknown>): Promise<WriteResult> {
	const done: { created: string[]; updated: string[]; skipped: string[] } = { created: [], updated: [], skipped: [] };
	const colors = (args.colors ?? {}) as Record<string, unknown>;
	const texts = (args.texts ?? {}) as Record<string, Record<string, unknown>>;
	const vars = args.variables as { collection?: string; values?: Record<string, unknown> } | undefined;

	const paintStyles = await figma.getLocalPaintStylesAsync();
	for (const [name, hex] of Object.entries(colors).slice(0, 100)) {
		if (typeof hex !== "string" || !HEX.test(hex)) {
			done.skipped.push(`${name}: нужен hex #RRGGBB`);
			continue;
		}
		const { color, opacity } = hexToRgba(hex);
		let style = paintStyles.find((s) => s.name === name);
		if (style) done.updated.push(`color:${name}`);
		else {
			style = figma.createPaintStyle();
			style.name = name;
			done.created.push(`color:${name}`);
		}
		style.paints = [{ type: "SOLID", color, opacity }];
	}

	const textStyles = await figma.getLocalTextStylesAsync();
	for (const [name, spec] of Object.entries(texts).slice(0, 60)) {
		const family = typeof spec.family === "string" ? spec.family : "Inter";
		const weight = typeof spec.weight === "string" ? spec.weight.toLowerCase() : "regular";
		const candidates = WEIGHT_STYLE[weight] ?? [String(spec.weight)];
		let font: FontName | null = null;
		for (const style of candidates) {
			try {
				await figma.loadFontAsync({ family, style });
				font = { family, style };
				break;
			} catch {
				/* пробуем следующее начертание */
			}
		}
		if (!font || typeof spec.size !== "number") {
			done.skipped.push(`${name}: нет шрифта ${family} ${weight} или не задан size`);
			continue;
		}
		let style = textStyles.find((s) => s.name === name);
		if (style) done.updated.push(`text:${name}`);
		else {
			style = figma.createTextStyle();
			style.name = name;
			done.created.push(`text:${name}`);
		}
		style.fontName = font;
		style.fontSize = spec.size;
		if (typeof spec.lineHeight === "number") style.lineHeight = { value: spec.lineHeight, unit: "PIXELS" };
		if (typeof spec.letterSpacing === "number") style.letterSpacing = { value: spec.letterSpacing, unit: "PIXELS" };
	}

	if (vars?.values && typeof vars.collection === "string" && vars.collection) {
		const collections = await figma.variables.getLocalVariableCollectionsAsync();
		const collection = collections.find((c) => c.name === vars.collection) ?? figma.variables.createVariableCollection(vars.collection);
		const existing = (await figma.variables.getLocalVariablesAsync()).filter((v) => v.variableCollectionId === collection.id);
		for (const [name, value] of Object.entries(vars.values).slice(0, 200)) {
			let resolved: VariableResolvedDataType;
			let v: VariableValue;
			if (typeof value === "string" && HEX.test(value)) {
				resolved = "COLOR";
				const { color, opacity } = hexToRgba(value);
				v = { ...color, a: opacity };
			} else if (typeof value === "number") {
				resolved = "FLOAT";
				v = value;
			} else if (typeof value === "boolean") {
				resolved = "BOOLEAN";
				v = value;
			} else if (typeof value === "string") {
				resolved = "STRING";
				v = value;
			} else {
				done.skipped.push(`${name}: значение не поддерживается`);
				continue;
			}
			let variable = existing.find((x) => x.name === name);
			if (variable && variable.resolvedType !== resolved) {
				done.skipped.push(`${name}: уже есть переменная другого типа`);
				continue;
			}
			if (variable) done.updated.push(`var:${name}`);
			else {
				variable = figma.variables.createVariable(name, collection, resolved);
				done.created.push(`var:${name}`);
			}
			variable.setValueForMode(collection.defaultModeId, v);
		}
	}
	await loadDesignSystem();
	return { ok: true, data: { ...done, hint: 'Ссылайтесь на стили в спеке как "style:<имя>" (fill, color, stroke).' } };
}

// Структурная подпись: типы и число детей без текстов — одинаковая у блоков одной формы.
function shape(n: SceneNode): string {
	const kids = "children" in n ? n.children.filter((c) => c.visible !== false) : [];
	return `${n.type}(${kids.map(shape).join(",")})`;
}

const hasImage = (n: SceneNode): boolean => "fills" in n && Array.isArray(n.fills) && (n.fills as Paint[]).some((p) => p.type === "IMAGE");

function descendants(n: SceneNode): SceneNode[] {
	const out: SceneNode[] = [];
	const walk = (x: SceneNode): void => {
		if ("children" in x) for (const c of x.children) if (c.visible !== false) (out.push(c), walk(c));
	};
	walk(n);
	return out;
}

// figma_componentize: из повторяющихся блоков одной формы — компонент и экземпляры
// с их текстами и фото. Первый блок становится главным компонентом на своём месте.
export async function runComponentize(args: Record<string, unknown>): Promise<WriteResult> {
	const ids = Array.isArray(args.ids) ? (args.ids as unknown[]) : [];
	if (ids.length < 2) return { ok: false, error: "ids: нужно минимум 2 одинаковых по структуре блока" };
	const nodes: SceneNode[] = [];
	for (const id of ids.slice(0, 40)) {
		const n = await nodeOf(id);
		if (!n) return { ok: false, error: `нода ${String(id)} не найдена` };
		if (n.type !== "FRAME") return { ok: false, error: `${n.name}: компонентом можно сделать только frame, а это ${n.type}` };
		nodes.push(n);
	}
	const sig = shape(nodes[0]);
	for (const n of nodes) if (shape(n) !== sig) return { ok: false, error: `«${n.name}» (${n.id}) устроен иначе, чем «${nodes[0].name}»: компонент возможен только для блоков одной структуры` };
	await beginWrite(`componentize: ${nodes[0].name}`);
	await snapshotFor(nodes.map((n) => n.id));
	const warnings: string[] = [];
	const first = nodes[0];
	const component = figma.createComponentFromNode(first);
	if (typeof args.name === "string" && args.name.trim()) component.name = args.name.trim();
	recordCreated(component.id);
	const instances: { id: string; replaced: string }[] = [];
	for (const old of nodes.slice(1)) {
		try {
			const parent = old.parent;
			if (!parent || !("insertChild" in parent)) throw new Error("нет родителя");
			const index = parent.children.indexOf(old);
			const inst = component.createInstance();
			parent.insertChild(index, inst);
			if ("layoutSizingHorizontal" in old && "layoutSizingHorizontal" in inst) {
				inst.layoutSizingHorizontal = old.layoutSizingHorizontal;
				inst.layoutSizingVertical = old.layoutSizingVertical;
			}
			if ("layoutPositioning" in old && old.layoutPositioning === "ABSOLUTE") inst.layoutPositioning = "ABSOLUTE";
			if (!("layoutMode" in parent) || (parent as FrameNode).layoutMode === "NONE") {
				inst.x = old.x;
				inst.y = old.y;
			}
			const from = descendants(old);
			const to = descendants(inst);
			for (let i = 0; i < from.length && i < to.length; i++) {
				const a = from[i];
				const b = to[i];
				if (a.type === "TEXT" && b.type === "TEXT") {
					if (a.characters !== b.characters) {
						await loadTextFonts(b);
						b.characters = a.characters;
					}
				} else if (hasImage(a) && "fills" in b) {
					b.fills = (a as GeometryMixin).fills as Paint[];
				}
			}
			if ("fills" in old && "fills" in inst && JSON.stringify(old.fills) !== JSON.stringify(inst.fills)) inst.fills = old.fills as Paint[];
			inst.name = old.name;
			old.remove();
			recordCreated(inst.id);
			instances.push({ id: inst.id, replaced: old.id });
		} catch (err) {
			warnings.push(`${old.name} (${old.id}): ${String((err as Error)?.message || err)}`);
		}
	}
	figma.currentPage.selection = [component];
	return { ok: true, data: { componentId: component.id, name: component.name, instances, warnings, undoRuns: undoableRuns().length } };
}
