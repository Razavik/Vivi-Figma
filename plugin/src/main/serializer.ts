/// <reference types="@figma/plugin-typings" />
import { extrasOf } from "./extras";

import { blockSpecFromMeta, patternFillFromData } from "./block-meta";
import type { AnySpec } from "./canvas-state";
import { state } from "./canvas-state";
import { isBackup } from "./undo";
import {
	ALIGN_TO_SPEC,
	WEIGHT_FROM_STYLE,
	firstSolid,
	blursOf,
	gradientSpecOf,
	imageExtrasOf,
	rgbToHex,
	strokeExtrasOf,
} from "./paint";

// Сколько слоёв с настоящим фото внутри ноды.
function countPhotos(node: SceneNode): number {
	if (!("findAll" in node)) return 0;
	try {
		return (node as FrameNode).findAll(
			(c) =>
				"fills" in c &&
				Array.isArray(c.fills) &&
				c.fills.some((p: Paint) => p.type === "IMAGE"),
		).length;
	} catch {
		return 0;
	}
}

// Поворот в терминах спеки: по часовой, как в CSS.
function addRotation(base: AnySpec, node: SceneNode): void {
	if ("rotation" in node && Math.abs(node.rotation) > 0.01)
		base.rotation = Math.round(-node.rotation * 10) / 10;
}

// Текст с разными стилями → spans: база (кегль, шрифт, цвет) — у первого
// куска, в span — только отличия от неё.
function serializeSpans(node: TextNode, base: AnySpec): void {
	let segs: StyledTextSegment[] = [];
	try {
		segs = node.getStyledTextSegments([
			"fontName",
			"fontSize",
			"fills",
			"textDecoration",
			"hyperlink",
		]) as StyledTextSegment[];
	} catch {
		return;
	}
	if (segs.length < 2) return;
	const first = segs[0];
	const colorOf = (sg: StyledTextSegment) => firstSolid(sg.fills);
	if (typeof base.fontSize !== "number") base.fontSize = first.fontSize;
	if (!base.fontFamily) {
		base.fontFamily = first.fontName.family;
		base.fontWeight = WEIGHT_FROM_STYLE[first.fontName.style] || "regular";
	}
	if (!base.color) {
		const c = colorOf(first);
		if (c) base.color = c;
	}
	base.spans = segs.map((sg) => {
		const span: AnySpec = { text: sg.characters };
		if (sg.fontName.family !== first.fontName.family)
			span.fontFamily = sg.fontName.family;
		if (sg.fontName.style !== first.fontName.style)
			span.fontWeight = WEIGHT_FROM_STYLE[sg.fontName.style] || "regular";
		if (sg.fontSize !== first.fontSize) span.fontSize = sg.fontSize;
		const c = colorOf(sg);
		if (c && c !== base.color) span.color = c;
		if (sg.textDecoration === "UNDERLINE") span.textDecoration = "underline";
		if (sg.textDecoration === "STRIKETHROUGH") span.textDecoration = "strike";
		if (sg.hyperlink && sg.hyperlink.type === "URL") span.link = sg.hyperlink.value;
		return span;
	});
	delete base.text;
}

// Лимиты по умолчанию (выделение, правки). Для inspect отдельной ноды
// лимиты шире — см. setSerializeLimits.
let maxNodes = 150;
let maxDepth = 6;

export function setSerializeLimits(nodes = 150, depth = 6): void {
	maxNodes = nodes;
	maxDepth = depth;
}

type Sizing = "FIXED" | "HUG" | "FILL";

// Общие свойства: прозрачность, обводка, тень — иначе они терялись бы
// при пересборке блока агентом.
function addCommon(base: AnySpec, node: SceneNode): void {
	if ((node as { isMask?: boolean }).isMask) base.mask = true;
	if ("opacity" in node && node.opacity !== 1) base.opacity = node.opacity;
	addRotation(base, node);
	if ("effects" in node) Object.assign(base, blursOf(node.effects));
	if ("strokes" in node) {
		const stroke = firstSolid(node.strokes);
		if (stroke) {
			base.stroke = stroke;
			const weight = (node as GeometryMixin & { strokeWeight: unknown })
				.strokeWeight;
			if (typeof weight === "number") base.strokeWidth = weight;
			Object.assign(base, strokeExtrasOf(node));
		}
	}
	if ("effects" in node) {
		const shadow = node.effects.find(
			(e) => e.type === "DROP_SHADOW" && e.visible !== false,
		) as DropShadowEffect | undefined;
		if (shadow) {
			base.shadow = {
				x: shadow.offset.x,
				y: shadow.offset.y,
				blur: shadow.radius,
				color: rgbToHex(shadow.color, shadow.color.a),
			};
		}
	}
}

// "hug"/"fill" вместо числа, если нода так настроена в auto-layout родителе —
// иначе пересборка превращала бы адаптивную вёрстку в жёсткую.
function sizeOf(node: SceneNode, axis: "H" | "V"): number | "hug" | "fill" {
	const mode =
		axis === "H"
			? (node as { layoutSizingHorizontal?: Sizing })
					.layoutSizingHorizontal
			: (node as { layoutSizingVertical?: Sizing }).layoutSizingVertical;
	const inAuto =
		!!node.parent &&
		"layoutMode" in node.parent &&
		node.parent.layoutMode !== "NONE";
	if (inAuto && mode === "FILL") return "fill";
	if (inAuto && mode === "HUG") return "hug";
	return Math.round(axis === "H" ? node.width : node.height);
}

// Прототипные связи ноды → поле "interactions" спеки: hover/press/click +
// CHANGE_TO на другую ноду. Остальные типы реакций схемой не описываются —
// пропускаем (мы их не трогаем, они просто не уходят модели).
const TRIGGER_TO_SPEC: Record<string, string> = {
	ON_HOVER: "hover",
	ON_PRESS: "press",
	ON_CLICK: "click",
};
const TRANSITION_TO_SPEC: Record<string, string> = {
	DISSOLVE: "dissolve",
	SMART_ANIMATE: "smart_animate",
};

function serializeInteractions(node: SceneNode): AnySpec[] {
	if (!("reactions" in node)) return [];
	const out: AnySpec[] = [];
	for (const r of node.reactions as readonly Reaction[]) {
		const trigger = r.trigger ? TRIGGER_TO_SPEC[r.trigger.type] : null;
		if (!trigger) continue;
		const actions = r.actions ?? (r.action ? [r.action] : []);
		for (const a of actions) {
			if (
				a.type !== "NODE" ||
				a.navigation !== "CHANGE_TO" ||
				typeof a.destinationId !== "string"
			)
				continue;
			const t = a.transition;
			const item: AnySpec = { trigger, target: a.destinationId };
			if (!t) {
				item.transition = "instant";
			} else if (TRANSITION_TO_SPEC[t.type]) {
				item.transition = TRANSITION_TO_SPEC[t.type];
				item.duration = t.duration;
			} else continue;
			out.push(item);
		}
	}
	return out;
}

// Чтение холста: сериализация ноды в ту же JSON-спеку (с "id").
// Текущие тексты слоёв экземпляра: имя слоя → содержимое (до 16 слоёв).
function instanceTexts(node: InstanceNode): Record<string, string> {
	const out: Record<string, string> = {};
	try {
		for (const t of node.findAllWithCriteria({ types: ["TEXT"] })) {
			if (Object.keys(out).length >= 16) break;
			if (t.visible !== false && t.characters.trim()) out[t.name] = t.characters.slice(0, 120);
		}
	} catch {
		/* экземпляр без доступа к слоям */
	}
	return out;
}

// Развёрнутый chart/table отдаём модели исходной спекой, без слоёв.
function blockOf(node: SceneNode): AnySpec | null {
	if (node.type !== "FRAME" && node.type !== "VECTOR" && node.type !== "BOOLEAN_OPERATION") return null;
	return blockSpecFromMeta(node.getPluginData("meta"), node.id, node.name) as AnySpec | null;
}

export function serializeNode(node: SceneNode, depth: number): AnySpec | null {
	const spec = serializeBase(node, depth);
	if (!spec) return spec;
	// Аннотации — модель их видит.
	const extra = extrasOf(node);
	for (const [k, v] of Object.entries(extra)) if (!(k in spec)) spec[k] = v;
	// Паттерн-заливка: модель видит её параметры, а не пустой фон.
	const pattern = patternFillFromData(node.getPluginData("patternFill"));
	if (pattern) spec.fill = pattern;
	return spec;
}

function serializeBase(node: SceneNode, depth: number): AnySpec | null {
	if (depth > maxDepth || state.serializedNodes >= maxNodes) {
		return null;
	}
	state.serializedNodes++;

	const block = blockOf(node);
	if (block) return block;
	const base: AnySpec = { name: node.name, id: node.id };
	// Сплошная заливка, иначе линейный градиент — модель видит то, что строила.
	const fills =
		"fills" in node
			? (firstSolid(node.fills) ?? gradientSpecOf(node.fills))
			: undefined;

	switch (node.type) {
		case "INSTANCE": {
			// Экземпляр — ссылкой на главный компонент (без детей): при
			// пересборке он остаётся экземпляром, а не распадается на слои.
			// mainComponent может быть недоступен (удалён/удалённая библиотека).
			let main: ComponentNode | null = null;
			try {
				main = node.mainComponent;
			} catch {
				main = null;
			}
			if (main && !main.removed) {
				base.type = "instance";
				base.component = main.id;
				// Вариант набора: текущие свойства и id самого набора.
				if (main.variantProperties)
					base.variants = main.variantProperties;
				if (main.parent && main.parent.type === "COMPONENT_SET")
					base.componentSet = main.parent.id;
				base.componentName = main.parent?.type === "COMPONENT_SET" ? main.parent.name : main.name;
				// Внутри свёрнутого экземпляра фото не видно — говорим, что они там есть.
				const photos = countPhotos(node);
				if (photos) base.photosInside = photos;
				base.w = sizeOf(node, "H");
				base.h = sizeOf(node, "V");
				addRotation(base, node);
				// Что на самом деле написано в экземпляре: тексты главного компонента
				// ему не принадлежат, а модель иначе видит только заготовку.
				const texts = instanceTexts(node);
				if (Object.keys(texts).length) base.overrides = texts;
				// Выбранный/просматриваемый экземпляр: показываем устройство главного
				// компонента — вид и состав меняются там (слои внутри экземпляра правятся
				// в оригинале, все копии следуют).
				if (depth === 0 && !main.remote) {
					const tree = serializeNode(main, depth + 1);
					if (tree) base.mainComponentTree = tree;
				}
				return base;
			}
		}
		// eslint-disable-next-line no-fallthrough
		case "FRAME":
		case "GROUP":
		case "COMPONENT":
		case "COMPONENT_SET":
		case "SECTION": {
			const frame = node as ChildrenMixin &
				SceneNode & {
					layoutMode?: string;
					itemSpacing?: number;
					paddingTop?: number;
					paddingRight?: number;
					paddingBottom?: number;
					paddingLeft?: number;
					primaryAxisAlignItems?: string;
					counterAxisAlignItems?: string;
				};
			// Набор вариантов сериализуем отдельным read-only типом:
			// собрать его спекой нельзя (только combine_variants), а модель
			// должна видеть его свойства и детей-вариантов.
			base.type =
				node.type === "COMPONENT_SET" ? "component_set" : "frame";
			if (node.type === "COMPONENT") base.component = true;
			if (node.type === "COMPONENT_SET")
				base.variantGroupProperties = node.variantGroupProperties;
			// Группа отличается от фрейма: у неё нет auto-layout/fill/padding.
			if (node.type === "GROUP") base.group = true;
			// Вариант внутри набора: его свойства, id набора и связи.
			if (node.type === "COMPONENT") {
				if (node.variantProperties)
					base.variants = node.variantProperties;
				if (node.parent && node.parent.type === "COMPONENT_SET")
					base.componentSet = node.parent.id;
				const interactions = serializeInteractions(node);
				if (interactions.length) base.interactions = interactions;
			}
			base.w = sizeOf(node, "H");
			base.h = sizeOf(node, "V");
			addCommon(base, node);
			if (
				frame.layoutMode === "VERTICAL" ||
				frame.layoutMode === "HORIZONTAL"
			) {
				base.layout =
					frame.layoutMode === "VERTICAL" ? "vertical" : "horizontal";
				base.gap = frame.itemSpacing;
				base.padding = [
					frame.paddingTop,
					frame.paddingRight,
					frame.paddingBottom,
					frame.paddingLeft,
				];
				base.align =
					ALIGN_TO_SPEC[frame.primaryAxisAlignItems || "MIN"];
				base.cross =
					ALIGN_TO_SPEC[frame.counterAxisAlignItems || "MIN"];
			} else {
				base.layout = "none";
			}
			if (fills) base.fill = fills;
			// У групп этих свойств нет — читаем через проверку наличия
			const box = node as Partial<FrameNode>;
			if (box.clipsContent) base.clip = true;
			if (box.minWidth) base.minW = box.minWidth;
			if (box.maxWidth) base.maxW = box.maxWidth;
			if (
				"cornerRadius" in node &&
				typeof node.cornerRadius === "number" &&
				node.cornerRadius > 0
			)
				base.radius = node.cornerRadius;
			const children: AnySpec[] = [];
			for (const child of frame.children) {
				const s = serializeNode(child as SceneNode, depth + 1);
				if (s) {
					const c = child as SceneNode;
					const absolute =
						base.layout !== "none" &&
						"layoutPositioning" in c &&
						c.layoutPositioning === "ABSOLUTE";
					if (absolute) s.position = "absolute";
					if (base.layout === "none" || absolute) {
						s.x = Math.round(c.x);
						s.y = Math.round(c.y);
					}
					children.push(s);
				}
			}
			if (children.length) base.children = children;
			// Часть детей не поместилась в лимит — говорим об этом модели,
			// иначе она решит, что их нет (и при replace удалит).
			const omitted = frame.children.length - children.length;
			if (omitted > 0) base.omitted = omitted;
			// Фото среди скрытых лимитом детей: без счётчика карточка выглядела бы
			// пустой, хотя фото в ней есть.
			if (omitted > 0) {
				const photos = countPhotos(node);
				if (photos) base.photosInside = photos;
			}
			if (node.getPluginData("placeholder")) base.placeholder = true;
			return base;
		}
		case "TEXT": {
			base.type = "text";
			base.text = node.characters.slice(0, 500);
			if (typeof node.fontSize === "number")
				base.fontSize = node.fontSize;
			if (node.fontName !== figma.mixed) {
				base.fontFamily = node.fontName.family;
				base.fontWeight =
					WEIGHT_FROM_STYLE[node.fontName.style] || "regular";
			}
			if (fills) base.color = fills;
			const alignOf: Record<string, string> = {
				LEFT: "left",
				CENTER: "center",
				RIGHT: "right",
			};
			if (alignOf[node.textAlignHorizontal])
				base.align = alignOf[node.textAlignHorizontal];
			if (
				node.lineHeight !== figma.mixed &&
				node.lineHeight.unit === "PIXELS"
			)
				base.lineHeight = node.lineHeight.value;
			if (node.letterSpacing !== figma.mixed && node.letterSpacing.value)
				base.letterSpacing =
					node.letterSpacing.unit === "PERCENT"
						? `${node.letterSpacing.value}%`
						: node.letterSpacing.value;
			const caseOf: Record<string, string> = {
				UPPER: "upper",
				LOWER: "lower",
				TITLE: "title",
			};
			if (node.textCase !== figma.mixed && caseOf[node.textCase])
				base.textCase = caseOf[node.textCase];
			if (node.textDecoration === "UNDERLINE") base.textDecoration = "underline";
			if (node.textDecoration === "STRIKETHROUGH") base.textDecoration = "strike";
			if (node.textTruncation === "ENDING" && node.maxLines)
				base.maxLines = node.maxLines;
			serializeSpans(node, base);
			base.w =
				node.textAutoResize === "WIDTH_AND_HEIGHT"
					? "hug"
					: sizeOf(node, "H");
			if ("opacity" in node && node.opacity !== 1)
				base.opacity = node.opacity;
			addRotation(base, node);
			return base;
		}
		case "RECTANGLE":
			// Прямоугольник с картинкой описать спекой нельзя — отдаём как
			// ref: при пересборке нода клонируется как есть.
			if (
				Array.isArray(node.fills) &&
				node.fills.some((p) => p.type === "IMAGE")
			) {
				base.type = "ref";
				base.label = "photo (loaded)";
				base.hasPhoto = true;
				// Запрос, по которому искали фото — модель видит, что
				// здесь должно быть, и может заменить через update+query.
				const q = node.getPluginData("query");
				if (q) base.query = q;
				Object.assign(base, imageExtrasOf(node.fills));
			} else {
				base.type = "rect";
				if (fills) base.fill = fills;
			}
			base.w = sizeOf(node, "H");
			base.h = sizeOf(node, "V");
			addCommon(base, node);
			if (typeof node.cornerRadius === "number" && node.cornerRadius > 0)
				base.radius = node.cornerRadius;
			return base;
		case "ELLIPSE":
			base.type = "ellipse";
			base.w = sizeOf(node, "H");
			base.h = sizeOf(node, "V");
			if (fills) base.fill = fills;
			addCommon(base, node);
			return base;
		case "LINE":
			base.type = "line";
			base.w = Math.round(node.width);
			base.stroke = firstSolid(node.strokes) || "#000000";
			base.strokeWidth =
				node.strokeWeight === figma.mixed ? 1 : node.strokeWeight;
			return base;
		default:
			// VECTOR, STAR, POLYGON и прочее спекой не описать — ref:
			// при пересборке нода клонируется как есть, а не теряется.
			base.type = "ref";
			base.label = node.type.toLowerCase();
			base.w = Math.round(node.width);
			base.h = Math.round(node.height);
			return base;
	}
}

// Оглавление страницы: верхнеуровневые ноды — агент по нему может
// сам выбрать, что посмотреть через inspect.
export function pageOutline(): AnySpec[] {
	return figma.currentPage.children
		.filter((n) => !isBackup(n))
		.slice(0, 100)
		.map((n) => ({
			id: n.id,
			name: n.name,
			type: n.type.toLowerCase(),
			w: Math.round(n.width),
			h: Math.round(n.height),
			x: Math.round(n.x),
			y: Math.round(n.y),
			...("children" in n ? { childCount: n.children.length } : {}),
		}));
}
