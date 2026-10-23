/// <reference types="@figma/plugin-typings" />
// Запись в Figma для MCP: создание дизайна из спеки, точечные правки, откат.
// Спеку к этому моменту уже подготовил Node-сторона (иконки → svg, фото → байты).
import { buildRoot, placeAnchored, type ReplacePlace } from "./builder";
import type { AnySpec } from "./canvas-state";
import { state } from "./canvas-state";
import { flushStyleBindings } from "./designsystem";
import { applyEditOp, type EditOp } from "./edits";
import { lint, setRequestLang, type Issue, type LintNode } from "./lint";
import { compactSpec, type Spec } from "./mcp-describe";
import { serializeNode, setSerializeLimits } from "./serializer";
import { beginRun, isSnapshotTop, recordCreated, snapshotFor, undoRuns, undoableRuns } from "./undo";

export type WriteResult =
	| { ok: true; data: unknown; images?: { data: string; mimeType: string }[] }
	| { ok: false; error: string };

const MAX_EDITS = 200;
const MAX_ISSUES = 40;
let lastRunId = 0;
let versionSaved = false;

function resetState(): void {
	state.warnings.length = 0;
	state.infos.length = 0;
	state.nodeCount = 0;
	state.namedComponents.clear();
	state.prebuilt.clear();
	state.anchors.length = 0;
}

// Новый прогон для отката: id монотонный, первая запись за сессию плагина
// ещё и сохраняет версию в историю файла Figma.
async function startRun(title: string): Promise<void> {
	lastRunId = Math.max(lastRunId + 1, Date.now());
	setRequestLang(""); // язык запроса неизвестен — проверку «язык текста против языка запроса» отключаем
	await beginRun(lastRunId, title);
	if (!versionSaved) {
		versionSaved = true;
		void figma.saveVersionHistoryAsync("Vivi MCP: перед правками агента", title).catch(() => {});
	}
}

function lintNodes(nodes: SceneNode[]): Issue[] {
	const out: Issue[] = [];
	for (const n of nodes) {
		try {
			out.push(...lint(n as unknown as LintNode));
		} catch {
			/* проверка не должна ломать запись */
		}
	}
	return out.slice(0, MAX_ISSUES);
}

// Фото с IMAGE-заливкой только что созданы: Figma декодирует их асинхронно, и
// экспорт сразу после вставки рисует пустое место. Даём время на загрузку.
function hasPhotos(node: SceneNode): boolean {
	if (!("findAll" in node)) return false;
	try {
		return (node as FrameNode).findAll((n) => "fills" in n && Array.isArray(n.fills) && (n.fills as Paint[]).some((p) => p.type === "IMAGE")).length > 0;
	} catch {
		return false;
	}
}

async function previewOf(node: SceneNode | null): Promise<{ data: string; mimeType: string }[]> {
	if (!node || node.removed || !("exportAsync" in node)) return [];
	try {
		if (hasPhotos(node)) await new Promise((r) => setTimeout(r, 1200));
		const scale = Math.min(2, Math.max(0.1, 1024 / Math.max(node.width, node.height, 1)));
		const bytes = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: scale } });
		return [{ data: figma.base64Encode(bytes), mimeType: "image/png" }];
	} catch {
		return [];
	}
}

// Дерево результата для агента: компактное, с id — по ним он правит дальше.
function treeOf(node: SceneNode, maxNodes = 200): unknown {
	state.serializedNodes = 0;
	setSerializeLimits(maxNodes, 6);
	try {
		const spec = serializeNode(node, 0) as Spec;
		return spec ? compactSpec(spec) : null;
	} finally {
		setSerializeLimits();
	}
}

function topOf(node: BaseNode): SceneNode | null {
	let n: BaseNode | null = node;
	while (n && n.parent && n.parent.type !== "PAGE" && n.parent.type !== "DOCUMENT") n = n.parent;
	return n && n.type !== "PAGE" && n.type !== "DOCUMENT" ? (n as SceneNode) : null;
}

async function placeOf(old: SceneNode): Promise<ReplacePlace> {
	const t = old.absoluteTransform;
	const parent = old.parent;
	const hasKids = !!parent && "children" in parent;
	return {
		x: Math.round(t[0][2]),
		y: Math.round(t[1][2]),
		parent: hasKids ? (parent as BaseNode & ChildrenMixin) : null,
		index: hasKids ? (parent as ChildrenMixin).children.indexOf(old) : 0,
		sizingH: "layoutSizingHorizontal" in old ? (old as FrameNode).layoutSizingHorizontal : undefined,
		sizingV: "layoutSizingVertical" in old ? (old as FrameNode).layoutSizingVertical : undefined,
	};
}

const PLACE_GAP = 120;

// Куда положить новый верхний фрейм, чтобы он не лёг поверх других: явные x/y,
// рядом с нодой after (справа или снизу) либо справа от всего, что уже на странице.
async function freePlace(args: Record<string, unknown>): Promise<ReplacePlace | null> {
	const gap = typeof args.gap === "number" && args.gap >= 0 ? Math.min(args.gap, 2000) : PLACE_GAP;
	if (typeof args.x === "number" && typeof args.y === "number") return { x: Math.round(args.x), y: Math.round(args.y), parent: null, index: 0 };
	const boxOf = (n: BaseNode): Rect | null => ("absoluteBoundingBox" in n ? (n as SceneNode & { absoluteBoundingBox: Rect | null }).absoluteBoundingBox : null);
	if (typeof args.after === "string" && args.after) {
		const ref = await figma.getNodeByIdAsync(args.after);
		const b = ref && !ref.removed ? boxOf(ref) : null;
		if (!b) throw new Error(`after: нода ${args.after} не найдена`);
		return args.direction === "below"
			? { x: Math.round(b.x), y: Math.round(b.y + b.height + gap), parent: null, index: 0 }
			: { x: Math.round(b.x + b.width + gap), y: Math.round(b.y), parent: null, index: 0 };
	}
	const boxes = figma.currentPage.children.map(boxOf).filter((b): b is Rect => !!b);
	if (!boxes.length) return null;
	const top = Math.min(...boxes.map((b) => b.y));
	const right = Math.max(...boxes.map((b) => b.x + b.width));
	const bottom = Math.max(...boxes.map((b) => b.y + b.height));
	return args.direction === "below"
		? { x: Math.round(Math.min(...boxes.map((b) => b.x))), y: Math.round(bottom + gap), parent: null, index: 0 }
		: { x: Math.round(right + gap), y: Math.round(top), parent: null, index: 0 };
}

// figma_create: корень спеки — frame. parent — положить в контейнер, replace — заменить ноду.
export async function runCreate(args: Record<string, unknown>): Promise<WriteResult> {
	const spec = args.spec as AnySpec | undefined;
	if (!spec || typeof spec !== "object" || spec.type !== "frame") return { ok: false, error: "spec: корневой узел должен быть frame" };
	// Корень с auto-layout без высоты — по содержимому (иначе высота остаётся стартовой и всё вылезает).
	if ((spec.layout === "vertical" || spec.layout === "horizontal") && spec.h === undefined) spec.h = "hug";
	resetState();
	const before = new Set(figma.currentPage.children.map((n) => n.id));
	try {
		let old: SceneNode | null = null;
		let place: ReplacePlace | null = null;
		if (typeof args.replace === "string" && args.replace) {
			const target = await figma.getNodeByIdAsync(args.replace);
			if (!target || target.removed || !("absoluteTransform" in target)) return { ok: false, error: `replace: нода ${args.replace} не найдена` };
			old = target as SceneNode;
			place = await placeOf(old);
		} else if (typeof args.parent === "string" && args.parent) {
			const target = await figma.getNodeByIdAsync(args.parent);
			if (!target || target.removed || !("children" in target) || target.type === "INSTANCE")
				return { ok: false, error: `parent: нода ${args.parent} не найдена или в неё нельзя вставлять` };
			// Размер в родителе с auto-layout: "fill"/"hug" из спеки применяется после вставки.
			const sizing = (v: unknown): "FILL" | "HUG" | undefined => (v === "fill" ? "FILL" : v === "hug" ? "HUG" : undefined);
			place = {
				x: 0,
				y: 0,
				parent: target as BaseNode & ChildrenMixin,
				index: (target as ChildrenMixin).children.length,
				sizingH: sizing(spec.w),
				sizingV: sizing(spec.h),
			};
		} else {
			place = await freePlace(args);
		}
		await startRun(`create: ${String(spec.name ?? "frame")}`);
		if (old) await snapshotFor([old.id]);
		else if (place?.parent) await snapshotFor([place.parent.id]);
		const root = await buildRoot(spec, place);
		recordCreated(root.id);
		if (old && !old.removed) {
			try {
				old.remove();
			} catch {
				state.warnings.push("replace: старую ноду удалить не удалось");
			}
		}
		await flushStyleBindings();
		return {
			ok: true,
			data: {
				rootId: root.id,
				name: root.name,
				size: [Math.round(root.width), Math.round(root.height)],
				position: [Math.round(root.x), Math.round(root.y)],
				count: state.nodeCount,
				warnings: state.warnings.slice(),
				issues: lintNodes([root]),
				tree: treeOf(root),
				undoRuns: undoableRuns().length,
			},
			images: await previewOf(root),
		};
	} catch (err) {
		// Сборка упала — не оставляем на странице половину фрейма.
		for (const n of [...figma.currentPage.children])
			if (!before.has(n.id)) {
				try {
					n.remove();
				} catch {
					/* уже удалена */
				}
			}
		return { ok: false, error: String((err as Error)?.message || err) };
	}
}

// figma_edit: список операций (update/move/delete/insert/…), алиасы $имя из поля as.
export async function runEdit(args: Record<string, unknown>): Promise<WriteResult> {
	const edits = args.edits;
	if (!Array.isArray(edits) || !edits.length) return { ok: false, error: "edits: нужен непустой массив операций" };
	if (edits.length > MAX_EDITS) return { ok: false, error: `edits: не больше ${MAX_EDITS} операций за вызов` };
	resetState();
	const ops = edits as EditOp[];
	await startRun(`edit: ${ops.length} оп.`);
	const targets: string[] = [];
	for (const op of ops) {
		for (const key of ["id", "parent"] as const) if (typeof op?.[key] === "string") targets.push(op[key] as string);
		if (Array.isArray(op?.ids)) for (const v of op.ids) if (typeof v === "string") targets.push(v);
	}
	await snapshotFor(targets);
	const touched = new Set<string>();
	const aliases = new Map<string, string>([["page", figma.currentPage.id]]);
	for (const op of ops) {
		try {
			await applyEditOp(op, touched, aliases);
		} catch (err) {
			state.warnings.push(`${op?.op || "edit"}: ${String((err as Error)?.message || err)}`);
		}
	}
	placeAnchored();
	const tops = new Map<string, SceneNode>();
	for (const id of touched) {
		try {
			const node = await figma.getNodeByIdAsync(id);
			const top = node && !node.removed ? topOf(node) : null;
			if (top) tops.set(top.id, top);
		} catch {
			/* нода удалена в ходе правок */
		}
	}
	await flushStyleBindings();
	for (const id of tops.keys()) if (!isSnapshotTop(id)) recordCreated(id);
	const nodes = [...tops.values()];
	const shot = nodes.find((n) => n.name.trim().toLowerCase() !== "components") ?? nodes[0] ?? null;
	return {
		ok: true,
		data: {
			applied: ops.length,
			warnings: state.warnings.slice(),
			infos: state.infos.slice(),
			issues: lintNodes(nodes),
			changed: nodes.slice(0, 5).map((n) => ({ id: n.id, name: n.name, tree: treeOf(n, 120) })),
			aliases: Object.fromEntries([...aliases].filter(([k]) => k !== "page")),
			undoRuns: undoableRuns().length,
		},
		images: await previewOf(shot),
	};
}

// figma_undo: откатывает последние N прогонов записи (по умолчанию 1).
export async function runUndo(args: Record<string, unknown>): Promise<WriteResult> {
	const ids = undoableRuns();
	if (!ids.length) return { ok: true, data: { undone: 0, message: "нечего откатывать" } };
	const n = Math.min(ids.length, Math.max(1, Math.floor(Number(args.runs) || 1)));
	const result = await undoRuns(ids[ids.length - n]);
	return { ok: true, data: { undone: result.runs, restored: result.restored, removed: result.removed, left: undoableRuns().length } };
}
