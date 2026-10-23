/// <reference types="@figma/plugin-typings" />
import type { Fill } from "../spec";
import type { AnySpec, Container } from "./canvas-state";
import { state } from "./canvas-state";
import { queueFillStyle } from "./designsystem";
import {
	STYLE_BY_WEIGHT,
	applyFill,
	applyImageExtras,
	applyRadius,
	applyStroke,
	hexToRgba,
	paddingOf,
} from "./paint";
import {
	applySizing,
	buildNode,
	decodeBase64,
	applyMinMax,
	applyTextExtras,
	applyPosition,
	applyLook,
	applySpans,
	ensureFont,
	loadTextFonts,
	spansText,
	isAutoParent,
} from "./builder";
import { buildReaction, combineNameError, selectVariant } from "./variants";
import { splitUpdate, toMain, type TNode } from "./main-target";
import { bulkPlan } from "./bulk-core";
import { searchIn, type SearchNode } from "./search";
import { moveProblem, planTree, type NodeLike, type PlanNode } from "./restructure-core";
import { annotateNode, clearAnnotations } from "./extras";

// Слой внутри экземпляра нельзя ни удалить, ни переименовать, ни вставить в
// него — правка уходит в тот же слой главного компонента (все копии следуют).
// Сам экземпляр остаётся как есть; "local":true отключает перенос.
async function insideInstance(node: SceneNode, op: EditOp): Promise<SceneNode> {
	if (op.local === true || node.type === "INSTANCE") return node;
	const t = await toMain(node as unknown as TNode);
	return t.redirected ? (t.node as unknown as SceneNode) : node;
}

// update: вид и состав — в главный компонент, содержимое и размещение
// экземпляра (текст, variants, фото, w/h/x/y…) — на самой ноде.
async function updateRouted(
	node: SceneNode,
	op: EditOp,
	touched: Set<string>,
): Promise<void> {
	if (op.local !== true) {
		const t = await toMain(node as unknown as TNode);
		if (t.redirected) {
			const { local, main } = splitUpdate(op, t.selfInstance);
			const target = t.node as unknown as SceneNode;
			if (Object.keys(main).length) {
				await applyUpdate(target, { op: "update", id: target.id, ...main });
				touched.add(target.id);
			}
			if (Object.keys(local).length)
				await applyUpdate(node, { op: "update", id: node.id, ...local });
			touched.add(node.id);
			return;
		}
	}
	await applyUpdate(node, op);
	touched.add(node.id);
}

// Точечные правки: агент меняет живые ноды без пересборки блока.
export type EditOp = {
	op?: string;
	id?: string;
	parent?: string;
	index?: number;
	node?: AnySpec;
	[key: string]: unknown;
};

// Обновление полей существующей ноды (fill, текст, размеры, лейаут…).
async function applyUpdate(node: SceneNode, op: EditOp): Promise<void> {
	// Переключение варианта — только у INSTANCE и только через
	// swapComponent: он нативно сохраняет текстовые overrides.
	// До стилевых правок: ошибка значит «ничего не меняли».
	if (op.variants !== undefined) {
		if (node.type !== "INSTANCE")
			throw new Error(
				`variants: ${node.type} нельзя переключить — нужен INSTANCE`,
			);
		const inst = node as InstanceNode;
		const main = await inst.getMainComponentAsync();
		if (!main || main.removed)
			throw new Error(
				"variants: главный компонент экземпляра недоступен",
			);
		inst.swapComponent(selectVariant(main, op.variants));
	}
	if (typeof op.name === "string") node.name = op.name;
	// Новое фото: сервер разрешил "query" в байты — меняем заливку на
	// IMAGE и запоминаем запрос (его отдаст сериализатор).
	if (typeof op.data === "string" && op.data && "fills" in node) {
		try {
			const image = figma.createImage(decodeBase64(op.data));
			const g = node as GeometryMixin;
			node.setPluginData("placeholder", "");
			const prev = Array.isArray(g.fills) ? (g.fills as readonly Paint[]) : [];
			const old = prev.find((p) => p.type === "IMAGE") as ImagePaint | undefined;
			// Затемнение и режим вписывания прежнего фото сохраняем.
			g.fills = [
				{ type: "IMAGE", scaleMode: old?.scaleMode === "FIT" ? "FIT" : "FILL", imageHash: image.hash },
				...(old ? prev.filter((p) => p.type !== "IMAGE") : []),
			];
		} catch (err) {
			state.warnings.push(`замена фото: ${String(err)}`);
		}
	}
	if (typeof op.query === "string" && op.query.trim())
		node.setPluginData("query", op.query.trim());
	if ("fills" in node) {
		applyFill(node as GeometryMixin, op.fill as Fill);
		applyImageExtras(node as GeometryMixin, op);
	}
	if ("strokes" in node)
		applyStroke(
			node as GeometryMixin & { strokeWeight: number },
			op as { stroke?: string; strokeWidth?: number },
		);
	if ("cornerRadius" in node)
		applyRadius(
			node as CornerMixin & RectangleCornerMixin,
			op.radius as number | number[] | undefined,
		);
	if (typeof op.opacity === "number" && "opacity" in node)
		node.opacity = op.opacity;

	if (node.type === "TEXT") {
		const t = node as TextNode;
		// Шрифт обязан быть загружен до любой правки текста.
		// Смешанный шрифт (figma.mixed) — берём шрифт первого символа.
		const cur = (
			t.fontName === figma.mixed ? t.getRangeFontName(0, 1) : t.fontName
		) as FontName;
		// Шрифты всех кусков текста — иначе Figma не даст его менять.
		await loadTextFonts(t);
		if (typeof op.fontFamily === "string" || op.fontWeight !== undefined) {
			const family =
				typeof op.fontFamily === "string" ? op.fontFamily : cur.family;
			const style = STYLE_BY_WEIGHT[String(op.fontWeight)] || cur.style;
			t.fontName = await ensureFont(family, style);
		}
		const joined = spansText(op.spans);
		if (joined !== undefined) t.characters = joined;
		else if (typeof op.text === "string") t.characters = op.text;
		if (typeof op.fontSize === "number") t.fontSize = op.fontSize;
		if (typeof op.color === "string") {
			const { color, alpha } = hexToRgba(op.color);
			t.fills = [{ type: "SOLID", color, opacity: alpha }];
			queueFillStyle(t, op.color);
		}
		const aligns: Record<string, "LEFT" | "CENTER" | "RIGHT"> = {
			left: "LEFT",
			center: "CENTER",
			right: "RIGHT",
		};
		if (aligns[String(op.align)])
			t.textAlignHorizontal = aligns[String(op.align)];
		if (typeof op.lineHeight === "number")
			t.lineHeight = { value: op.lineHeight, unit: "PIXELS" };
		await applySpans(t, op.spans);
		const inAuto = node.parent
			? isAutoParent(node.parent as Container)
			: false;
		if (inAuto && op.w === "fill" && t.layoutPositioning !== "ABSOLUTE") {
			t.textAutoResize = "HEIGHT";
			t.layoutSizingHorizontal = "FILL";
		} else if (typeof op.w === "number") {
			t.textAutoResize = "HEIGHT";
			t.resize(op.w, t.height);
		} else if (op.w === "hug") {
			t.textAutoResize = "WIDTH_AND_HEIGHT";
		}
		applyTextExtras(t, op as Record<string, unknown>);
	}

	// Лейаут-свойства есть у всех контейнерных нод: FRAME, COMPONENT,
	// INSTANCE, COMPONENT_SET (правка главного компонента — обычное дело).
	if ("layoutMode" in node) {
		const f = node as FrameNode;
		if (typeof op.clip === "boolean") f.clipsContent = op.clip;
		applyMinMax(f, op as Record<string, unknown>);
		if (op.layout === "vertical") f.layoutMode = "VERTICAL";
		else if (op.layout === "horizontal") f.layoutMode = "HORIZONTAL";
		else if (op.layout === "none") f.layoutMode = "NONE";
		if (typeof op.gap === "number") f.itemSpacing = op.gap;
		if (op.padding !== undefined) {
			const p = paddingOf(op.padding as number | number[]);
			f.paddingTop = p.t;
			f.paddingRight = p.r;
			f.paddingBottom = p.b;
			f.paddingLeft = p.l;
		}
		const mainAlign: Record<string, string> = {
			start: "MIN",
			center: "CENTER",
			end: "MAX",
			"space-between": "SPACE_BETWEEN",
		};
		const crossAlign: Record<string, string> = {
			start: "MIN",
			center: "CENTER",
			end: "MAX",
		};
		if (mainAlign[String(op.align)])
			f.primaryAxisAlignItems = mainAlign[
				String(op.align)
			] as FrameNode["primaryAxisAlignItems"];
		if (crossAlign[String(op.cross)])
			f.counterAxisAlignItems = crossAlign[
				String(op.cross)
			] as FrameNode["counterAxisAlignItems"];
	}

	const inAuto = node.parent ? isAutoParent(node.parent as Container) : false;
	applySizing(
		node as SceneNode &
			LayoutMixin & { resize(w: number, h: number): void },
		op as AnySpec,
		applyPosition(node, op as AnySpec, inAuto),
	);
	applyLook(node, op as AnySpec);
}

// Алиасы: операция, создающая ноду, может получить "as":"имя", а следующие
// операции того же ответа ссылаются на неё как "$имя" (в id, parent,
// component, target и элементах массива ids, в том числе внутри вложенных
// спек и записей interactions). Так цепочка «сделать компонент → поставить
// экземпляры» выполняется за один ответ.
const REF_KEYS = new Set(["id", "parent", "component", "target"]);

// "$имя" → реальный id через aliases; нет алиаса — предупреждение и как есть.
function deref(ref: string, aliases: Map<string, string>): string {
	const real = aliases.get(ref.slice(1));
	if (!real)
		state.warnings.push(
			`алиас ${ref} не определён выше по списку (alias ${ref} must be created with "as" by an EARLIER op of the SAME answer; in later answers use the real node id)`,
		);
	return real ?? ref;
}

export function resolveRefs(
	value: unknown,
	aliases: Map<string, string>,
): unknown {
	if (Array.isArray(value)) return value.map((v) => resolveRefs(v, aliases));
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			if (REF_KEYS.has(k) && typeof v === "string" && v.startsWith("$")) {
				out[k] = deref(v, aliases);
			} else if (k === "variants") {
				// variants — словарь свойств варианта (тексты, не ссылки):
				// даже ключи вида "target"/"component" не резолвим.
				out[k] = v;
			} else if (k === "ids" && Array.isArray(v)) {
				// group: массив id — строки "$имя" резолвятся так же, как id.
				out[k] = v.map((item) =>
					typeof item === "string" && item.startsWith("$")
						? deref(item, aliases)
						: item,
				);
			} else out[k] = resolveRefs(v, aliases);
		}
		return out;
	}
	return value;
}

export async function applyEditOp(
	op: EditOp,
	touched: Set<string>,
	aliases: Map<string, string> = new Map(),
): Promise<void> {
	op = resolveRefs(op, aliases) as EditOp;
	const remember = (id: string): void => {
		if (typeof op.as === "string" && op.as) aliases.set(op.as, id);
	};
	const note = (id?: string): void => {
		state.warnings.push(
			`${op.op}: нода ${id || "?"} не найдена — удалена раньше или id устарел (у заменённой ноды/нового компонента новый id): возьмите id из дерева или найдите через search`,
		);
	};

	// update сразу для нескольких нод: ids:[…] или match:{in,name,text,type}.
	if (op.op === "update" && (op.ids !== undefined || op.match !== undefined)) {
		const plan = bulkPlan(op);
		let ids: string[] = [];
		if (plan.kind === "error") {
			state.warnings.push(`update: ${plan.error}`);
			return;
		}
		if (plan.kind === "ids") ids = plan.ids;
		else if (plan.kind === "match") {
			let scope: SearchNode = figma.currentPage as unknown as SearchNode;
			if (plan.match.in) {
				const root = await figma.getNodeByIdAsync(plan.match.in);
				if (!root || root.removed || !("findAll" in root)) return note(plan.match.in);
				scope = root as unknown as SearchNode;
			}
			const found = searchIn(scope, { query: plan.query, text: plan.byText, type: plan.match.type, limit: 100 });
			ids = found.results.map((r) => String(r.id));
			if (plan.match.name && plan.match.text)
				state.warnings.push("update: у match заданы и name, и text — использован name");
			if (found.truncated) state.warnings.push("update: совпадений больше 100 — правка применена к первым 100");
			if (!ids.length) {
				state.warnings.push("update: по match ничего не найдено");
				return;
			}
		}
		const { ids: _i, match: _m, ...rest } = op as Record<string, unknown>;
		for (const id of ids) await applyEditOp({ ...rest, op: "update", id } as EditOp, touched, aliases);
		state.infos.push(`update: применено к ${ids.length} нодам`);
		return;
	}

	if (op.op === "update") {
		const node = (await figma.getNodeByIdAsync(
			String(op.id),
		)) as SceneNode | null;
		if (!node || node.removed) return note(op.id);
		await updateRouted(node, op, touched);
	} else if (op.op === "make_component") {
		// Превращаем существующую ноду в главный компонент на её месте.
		// Id у компонента новый — сообщаем его, чтобы дальше ссылаться на него.
		const node = (await figma.getNodeByIdAsync(
			String(op.id),
		)) as SceneNode | null;
		if (!node || node.removed) return note(op.id);
		if (node.type === "COMPONENT") {
			state.warnings.push(`make_component: ${op.id} уже компонент`);
			return;
		}
		if (node.type === "INSTANCE" || node.type === "COMPONENT_SET") {
			state.warnings.push(
				`make_component: ${node.type} нельзя превратить в компонент`,
			);
			return;
		}
		// Куда выносить главный компонент (отдельный фрейм «Components»):
		// на месте узла остаётся экземпляр, а сам компонент уезжает в "into".
		let into: (BaseNode & ChildrenMixin) | null = null;
		if (op.into) {
			into = (await figma.getNodeByIdAsync(String(op.into))) as
				| (BaseNode & ChildrenMixin)
				| null;
			if (!into || !("children" in into)) {
				note(String(op.into));
				return;
			}
		}
		const origin = node.parent as (BaseNode & ChildrenMixin) | null;
		const originIndex = origin ? origin.children.indexOf(node) : 0;
		const component = figma.createComponentFromNode(node);
		if (typeof op.name === "string" && op.name.trim())
			component.name = op.name.trim();
		let message = `make_component: ${op.id} → новый id компонента ${component.id}`;
		if (into && origin && into !== origin) {
			const instance = component.createInstance();
			const inAuto = isAutoParent(origin as Container);
			origin.insertChild(
				Math.min(originIndex, origin.children.length),
				instance,
			);
			if (inAuto) {
				instance.layoutSizingHorizontal =
					component.layoutSizingHorizontal;
				instance.layoutSizingVertical = component.layoutSizingVertical;
			} else {
				instance.x = component.x;
				instance.y = component.y;
			}
			into.appendChild(component);
			touched.add(instance.id);
			remember(component.id);
			if (typeof op.asInstance === "string" && op.asInstance)
				aliases.set(op.asInstance, instance.id);
			message += `, на месте остался экземпляр ${instance.id}`;
		} else {
			touched.add(component.id);
			remember(component.id);
		}
		state.warnings.push(message);
	} else if (op.op === "rename") {
		// Только имя слоя — содержимое и стиль не трогаем. У текстовых нод
		// явное имя отключает автопереименование по содержимому.
		const node = (await figma.getNodeByIdAsync(
			String(op.id),
		)) as SceneNode | null;
		if (!node || node.removed) return note(op.id);
		const name = typeof op.name === "string" ? op.name.trim() : "";
		if (!name) {
			state.warnings.push(`rename: пустое имя для ${op.id}`);
			return;
		}
		const target = await insideInstance(node, op);
		target.name = name;
		touched.add(node.id);
		touched.add(target.id);
	} else if (op.op === "delete") {
		const node = (await figma.getNodeByIdAsync(
			String(op.id),
		)) as SceneNode | null;
		if (!node || node.removed) return note(op.id);
		const doomed = await insideInstance(node, op);
		// Страница как «затронутый контейнер» не нужна: у неё нечего ревьюить.
		if (node.parent && node.parent.type !== "PAGE")
			touched.add(node.parent.id);
		if (doomed !== node && doomed.parent && doomed.parent.type !== "PAGE")
			touched.add(doomed.parent.id);
		doomed.remove();
	} else if (op.op === "annotate") {
		// Замечание ревью аннотацией (комментарии холста API плагина недоступны).
		const node = (await figma.getNodeByIdAsync(String(op.id))) as SceneNode | null;
		if (!node || node.removed) return note(op.id);
		if (typeof op.text !== "string" || !op.text.trim()) return;
		if (!(await annotateNode(node, op.text))) state.warnings.push(`annotate: ${node.name} не поддерживает аннотации`);
		else touched.add(node.id);
	} else if (op.op === "clear_annotations") {
		const node = op.id ? ((await figma.getNodeByIdAsync(String(op.id))) as SceneNode | null) : null;
		const n = await clearAnnotations(node && !node.removed ? node : figma.currentPage);
		state.infos.push(`Аннотации Vivi убраны: ${n}`);
	} else if (op.op === "rebuild") {
		// Блок (chart/table) с новыми данными: собираем заново на месте старого.
		const old = (await figma.getNodeByIdAsync(
			String(op.id),
		)) as SceneNode | null;
		if (!old || old.removed) return note(op.id);
		const parent = old.parent as (BaseNode & ChildrenMixin) | null;
		if (!parent || !("children" in parent) || !op.node) return;
		const index = parent.children.indexOf(old);
		const child = await buildNode(
			op.node as AnySpec,
			parent as Container,
			isAutoParent(parent as Container),
		);
		if (!child) return;
		parent.insertChild(index, child);
		if (!isAutoParent(parent as Container)) {
			child.x = old.x;
			child.y = old.y;
		}
		old.remove();
		touched.add(child.id);
		remember(child.id);
	} else if (op.op === "duplicate") {
		// Копия ноды (со всем содержимым): в тот же родитель сразу после
		// оригинала или в op.parent на op.index; остальные поля op
		// (текст, цвет, размеры…) применяются к копии как update.
		const node = (await figma.getNodeByIdAsync(
			String(op.id),
		)) as SceneNode | null;
		if (!node || node.removed) return note(op.id);
		const parent = op.parent
			? ((await figma.getNodeByIdAsync(String(op.parent))) as
					| (BaseNode & ChildrenMixin)
					| null)
			: (node.parent as (BaseNode & ChildrenMixin) | null);
		if (!parent || !("children" in parent)) return note(op.parent);
		const copy = node.clone();
		const sameParent = parent === node.parent;
		const index =
			typeof op.index === "number"
				? op.index
				: sameParent
					? parent.children.indexOf(node) + 1
					: parent.children.length;
		parent.insertChild(Math.min(index, parent.children.length), copy);
		// На странице копия без смещения лежала бы поверх оригинала.
		if (
			parent.type === "PAGE" &&
			typeof op.x !== "number" &&
			typeof op.y !== "number"
		) {
			copy.x = node.x + node.width + 40;
			copy.y = node.y;
		}
		await applyUpdate(copy, op);
		touched.add(copy.id);
		remember(copy.id);
	} else if (op.op === "move") {
		const node = (await figma.getNodeByIdAsync(
			String(op.id),
		)) as SceneNode | null;
		if (!node || node.removed) return note(op.id);
		const parent = op.parent
			? ((await figma.getNodeByIdAsync(String(op.parent))) as
					| (BaseNode & ChildrenMixin)
					| null)
			: (node.parent as (BaseNode & ChildrenMixin) | null);
		if (!parent || !("children" in parent)) return note(op.parent);
		parent.insertChild(
			Math.min(
				typeof op.index === "number"
					? op.index
					: parent.children.length,
				parent.children.length,
			),
			node,
		);
		touched.add(node.id);
	} else if (op.op === "reorder") {
		// Порядок слоёв: front/back — на самый верх/низ, forward/backward — на шаг.
		const node = (await figma.getNodeByIdAsync(String(op.id))) as SceneNode | null;
		if (!node || node.removed) return note(op.id);
		const parent = node.parent as (BaseNode & ChildrenMixin) | null;
		if (!parent || !("children" in parent)) return note(op.id);
		const i = parent.children.indexOf(node);
		const last = parent.children.length - 1;
		const to = { front: last, back: 0, forward: Math.min(last, i + 1), backward: Math.max(0, i - 1) }[String(op.to)];
		if (to === undefined) return note(op.id);
		parent.insertChild(to, node);
		touched.add(node.id);
	} else if (op.op === "insert") {
		let parent = (await figma.getNodeByIdAsync(String(op.parent))) as
			| (BaseNode & ChildrenMixin)
			| null;
		if (!parent || !("children" in parent)) return note(op.parent);
		// Родитель — экземпляр или слой внутри: вставляем в главный компонент.
		if (op.local !== true && parent.type !== "PAGE") {
			const t = await toMain(parent as unknown as TNode);
			if (t.redirected) {
				parent = t.node as unknown as BaseNode & ChildrenMixin;
				touched.add(op.parent as string);
			}
		}
		if (!op.node || typeof op.node !== "object") return;
		const child = await buildNode(
			op.node,
			parent as Container,
			isAutoParent(parent as Container),
		);
		if (child && typeof op.index === "number")
			parent.insertChild(
				Math.min(op.index, parent.children.length),
				child,
			);
		if (child) {
			touched.add(child.id);
			remember(child.id);
		}
	} else if (op.op === "restructure") {
		// Целевое дерево: существующие ноды (только id) переносятся как есть,
		// узлы с type — новые контейнеры. Проверки идут до первого изменения.
		const parent = (await figma.getNodeByIdAsync(String(op.parent ?? op.id))) as
			| (SceneNode & ChildrenMixin)
			| null;
		if (!parent || parent.removed || !("children" in parent)) return note(String(op.parent ?? op.id));
		const { plan, ids, errors } = planTree(op.tree);
		if (errors.length || !plan.length) {
			state.warnings.push(`restructure: ${errors.join("; ") || "пустое дерево"}`);
			return;
		}
		const nodes = new Map<string, SceneNode>();
		for (const id of ids) {
			const n = (await figma.getNodeByIdAsync(id)) as SceneNode | null;
			if (!n || n.removed) {
				note(id);
				state.warnings.push(`restructure: нет ноды ${id} — операция не выполнена`);
				return;
			}
			nodes.set(id, n);
		}
		const moving = new Set(ids);
		for (const [id, n] of nodes) {
			const why = moveProblem(n as unknown as NodeLike, parent as unknown as NodeLike, moving);
			if (why) {
				state.warnings.push(`restructure: ${why} — операция не выполнена`);
				return;
			}
			void id;
		}
		const place = async (entries: PlanNode[], container: BaseNode & ChildrenMixin): Promise<void> => {
			for (let i = 0; i < entries.length; i++) {
				const e = entries[i];
				let node: SceneNode | null;
				if (e.id) {
					node = nodes.get(e.id) ?? null;
					if (!node) continue;
					container.insertChild(Math.min(i, container.children.length), node);
					if (e.fields && Object.keys(e.fields).length)
						await applyUpdate(node, { ...e.fields, op: "update", id: e.id } as EditOp);
				} else {
					node = await buildNode(
						{ ...(e.spec as AnySpec), children: [] },
						container as Container,
						isAutoParent(container as Container),
					);
					if (!node) continue;
					container.insertChild(Math.min(i, container.children.length), node);
					if ("children" in node) await place(e.children, node as BaseNode & ChildrenMixin);
				}
				touched.add(node.id);
			}
		};
		await place(plan, parent);
		touched.add(parent.id);
	} else if (op.op === "group") {
		// Оборачиваем ноды в группу на месте первой из них. Группировать
		// можно только соседей одного родителя — иначе Figma бы молча
		// перенесла их, ломая лейаут других контейнеров.
		const nodes: SceneNode[] = [];
		if (Array.isArray(op.ids)) {
			for (const rawId of op.ids) {
				const node = (await figma.getNodeByIdAsync(
					String(rawId),
				)) as SceneNode | null;
				if (!node || node.removed) {
					note(String(rawId));
					continue;
				}
				nodes.push(node);
			}
		}
		if (!nodes.length) {
			state.warnings.push("group: нет нод для группировки");
			return;
		}
		const parent = nodes[0].parent as (BaseNode & ChildrenMixin) | null;
		if (
			!parent ||
			!("children" in parent) ||
			nodes.some((n) => n.parent !== parent)
		) {
			state.warnings.push(
				"group: ноды из разных родителей — сначала move в один контейнер",
			);
			return;
		}
		const index = Math.min(...nodes.map((n) => parent.children.indexOf(n)));
		if (op.frame === true) {
			// Вариант "frame":true — оборачиваем в настоящий фрейм
			// (auto-layout/fill/padding), а не в группу. Рамка фрейма —
			// bounding box нод в координатах родителя.
			let minX = Infinity;
			let minY = Infinity;
			let maxX = -Infinity;
			let maxY = -Infinity;
			for (const n of nodes) {
				minX = Math.min(minX, n.x);
				minY = Math.min(minY, n.y);
				maxX = Math.max(maxX, n.x + n.width);
				maxY = Math.max(maxY, n.y + n.height);
			}
			const frame = figma.createFrame();
			// У createFrame заливка белая по умолчанию — обёртка
			// прозрачная, пока модель не задаст fill.
			frame.fills = [];
			frame.clipsContent = false;
			frame.name =
				typeof op.name === "string" && op.name.trim()
					? op.name.trim()
					: "Frame";
			// Порядок переноса и координаты детей запоминаем до вставки
			// фрейма — она сдвигает индексы в родителе.
			const moving = nodes
				.map((n) => ({
					n,
					i: parent.children.indexOf(n),
					x: n.x,
					y: n.y,
				}))
				.sort((a, b) => a.i - b.i);
			parent.insertChild(index, frame);
			// Внутри auto-layout позицию задаёт сам лейаут.
			if (!isAutoParent(parent as Container)) {
				frame.x = minX;
				frame.y = minY;
			}
			frame.resize(Math.max(maxX - minX, 1), Math.max(maxY - minY, 1));
			for (const { n, x, y } of moving) {
				frame.appendChild(n);
				n.x = x - minX;
				n.y = y - minY;
			}
			// Стилевые/лейаут-поля (layout, gap, padding, fill, w, h…)
			// применяем тем же путём, что update.
			await applyUpdate(frame, {
				...op,
				op: undefined,
				id: undefined,
				ids: undefined,
				as: undefined,
				frame: undefined,
				name: undefined,
				variants: undefined,
			});
			// layout без числовых w/h — фрейм обнимает содержимое.
			// Primary-ось у vertical — высота, у horizontal — ширина.
			if (op.layout === "vertical" || op.layout === "horizontal") {
				const primaryIsWidth = op.layout === "horizontal";
				const primFixed = primaryIsWidth
					? typeof op.w === "number"
					: typeof op.h === "number";
				const counterFixed = primaryIsWidth
					? typeof op.h === "number"
					: typeof op.w === "number";
				if (!primFixed) frame.primaryAxisSizingMode = "AUTO";
				if (!counterFixed) frame.counterAxisSizingMode = "AUTO";
			}
			touched.add(frame.id);
			remember(frame.id);
			state.warnings.push(`group: новый id фрейма ${frame.id}`);
			return;
		}
		const group = figma.group(nodes, parent, index);
		if (typeof op.name === "string" && op.name.trim())
			group.name = op.name.trim();
		touched.add(group.id);
		remember(group.id);
		// Id у группы новый — сообщаем, чтобы дальше ссылаться на неё.
		state.warnings.push(`group: новый id группы ${group.id}`);
	} else if (op.op === "ungroup") {
		// Снимаем группу/пустой фрейм: дети переезжают к родителю на её
		// место. Компоненты/экземпляры так не трогаем.
		const node = (await figma.getNodeByIdAsync(
			String(op.id),
		)) as SceneNode | null;
		if (!node || node.removed) return note(op.id);
		if (
			(node.type !== "GROUP" && node.type !== "FRAME") ||
			!("children" in node) ||
			!(node as ChildrenMixin).children.length
		) {
			state.warnings.push(`ungroup: ${node.type} нельзя разгруппировать`);
			return;
		}
		const parent = node.parent;
		const children = figma.ungroup(node as SceneNode & ChildrenMixin);
		for (const child of children) touched.add(child.id);
		if (parent && parent.type !== "PAGE") touched.add(parent.id);
	} else if (op.op === "combine_variants") {
		// Живые компоненты → нативный набор вариантов на их месте.
		// Проверяем ВСЁ до мутации: откатить частично собранный набор
		// нельзя, поэтому ошибка = ничего не меняли.
		const ids = Array.isArray(op.ids) ? op.ids : [];
		if (
			ids.length < 2 ||
			ids.some((v) => typeof v !== "string" || !v) ||
			new Set(ids).size !== ids.length
		) {
			state.warnings.push(
				"combine_variants: нужно минимум 2 разных строковых id компонентов",
			);
			return;
		}
		const nodes: ComponentNode[] = [];
		let bad = false;
		for (const id of ids) {
			const node = await figma.getNodeByIdAsync(id);
			if (!node || node.removed) {
				note(id);
				bad = true;
				continue;
			}
			if (node.type !== "COMPONENT") {
				state.warnings.push(
					`combine_variants: ${id} — ${node.type}, нужны COMPONENT`,
				);
				bad = true;
				continue;
			}
			nodes.push(node as ComponentNode);
		}
		if (bad) return;
		const parent = nodes[0].parent as (BaseNode & ChildrenMixin) | null;
		if (
			!parent ||
			!("children" in parent) ||
			nodes.some((n) => n.parent !== parent)
		) {
			state.warnings.push(
				"combine_variants: компоненты из разных родителей — сначала move в один контейнер",
			);
			return;
		}
		if (parent.type === "COMPONENT_SET" || parent.type === "INSTANCE") {
			state.warnings.push(
				`combine_variants: родитель ${parent.type} — компоненты уже в наборе/инстансе`,
			);
			return;
		}
		const nameError = combineNameError(nodes.map((n) => n.name));
		if (nameError) {
			state.warnings.push(`combine_variants: ${nameError}`);
			return;
		}
		const name = typeof op.name === "string" ? op.name.trim() : "";
		if (!name) {
			state.warnings.push("combine_variants: нужно непустое name");
			return;
		}
		// Размеры и sizing запоминаем до переноса: внутри auto-layout
		// набора дети иначе могут схлопнуться или растянуться.
		const sizes = nodes.map((n) => ({
			w: n.width,
			h: n.height,
			sh: n.layoutSizingHorizontal,
			sv: n.layoutSizingVertical,
		}));
		const index = Math.min(...nodes.map((n) => parent.children.indexOf(n)));
		const set = figma.combineAsVariants(nodes, parent, index);
		set.name = name;
		// Порядок детей = порядок ids: combineAsVariants может оставить
		// исходный sibling-порядок, а от порядка зависит default (top-left).
		nodes.forEach((n, i) => set.insertChild(i, n));
		// Набор как аккуратный редактируемый ряд в библиотеке компонентов.
		set.layoutMode = "HORIZONTAL";
		set.itemSpacing = 24;
		set.paddingTop = 24;
		set.paddingRight = 24;
		set.paddingBottom = 24;
		set.paddingLeft = 24;
		set.primaryAxisSizingMode = "AUTO";
		set.counterAxisSizingMode = "AUTO";
		set.fills = [];
		set.clipsContent = false;
		nodes.forEach((n, i) => {
			// Сначала FIXED + исходный размер (FILL не живёт в новом
			// родителе, resize после HUG не сработал бы), затем HUG
			// возвращаем — иначе auto-layout кнопка перестала бы
			// подстраиваться под label.
			n.layoutSizingHorizontal = "FIXED";
			n.layoutSizingVertical = "FIXED";
			n.resize(sizes[i].w, sizes[i].h);
			if (n.layoutMode !== "NONE") {
				if (sizes[i].sh === "HUG") n.layoutSizingHorizontal = "HUG";
				if (sizes[i].sv === "HUG") n.layoutSizingVertical = "HUG";
			}
		});
		touched.add(set.id);
		remember(set.id);
	} else if (op.op === "set_interactions") {
		// Прототипные связи варианта: hover/press/click → CHANGE_TO внутри
		// того же набора. Все записи валидируем до вызова API — при ошибке
		// старые реакции ноды остаются как были.
		const node = (await figma.getNodeByIdAsync(
			String(op.id),
		)) as SceneNode | null;
		if (!node || node.removed) return note(op.id);
		const set =
			node.type === "COMPONENT" &&
			node.parent &&
			node.parent.type === "COMPONENT_SET"
				? (node.parent as ComponentSetNode)
				: null;
		if (!set) {
			state.warnings.push(
				`set_interactions: ${op.id} не вариант набора (COMPONENT внутри COMPONENT_SET)`,
			);
			return;
		}
		if (!Array.isArray(op.interactions)) {
			state.warnings.push("set_interactions: нужен массив interactions");
			return;
		}
		const reactions: Reaction[] = [];
		for (const entry of op.interactions) {
			const targetId =
				entry && typeof entry === "object"
					? (entry as Record<string, unknown>).target
					: undefined;
			if (typeof targetId !== "string" || !targetId) {
				state.warnings.push("set_interactions: у связи нет target");
				return;
			}
			const target = (await figma.getNodeByIdAsync(
				targetId,
			)) as SceneNode | null;
			if (!target || target.removed) {
				note(targetId);
				return;
			}
			if (
				target === node ||
				target.type !== "COMPONENT" ||
				target.parent !== set
			) {
				state.warnings.push(
					`set_interactions: target ${targetId} — не другой вариант того же набора`,
				);
				return;
			}
			const reaction = buildReaction(entry, target.id);
			if (!reaction) {
				state.warnings.push(
					`set_interactions: невалидная запись ${JSON.stringify(entry)}`,
				);
				return;
			}
			reactions.push(reaction);
		}
		await (node as ComponentNode).setReactionsAsync(reactions);
		touched.add(node.id);
	} else {
		state.warnings.push(`неизвестная операция: ${String(op.op)}`);
	}
}
