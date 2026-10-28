/// <reference types="@figma/plugin-typings" />
import { applyExtras } from "./extras";
import type { Fill } from "../spec";
import type { AnySpec, Container } from "./canvas-state";
import { state } from "./canvas-state";
import { queueFillStyle, textStyleOf } from "./designsystem";
import {
	STYLE_BY_WEIGHT,
	applyFill,
	applyImageExtras,
	hexToRgba,
	applyRadius,
	applyShadow,
	applyBlurs,
	applyStroke,
	paddingOf,
} from "./paint";
import { selectVariant } from "./variants";
import { BOOL_OPS, shapeSize, shapeSvg, type BoolOp } from "./shapes-core";

const loadedFonts = new Set<string>();

// base64 → байты (atob в песочнице плагина нет).
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function decodeBase64(b64: string): Uint8Array {
	const lookup = new Uint8Array(128);
	for (let i = 0; i < B64.length; i++) lookup[B64.charCodeAt(i)] = i;
	const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
	const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
	let acc = 0,
		bits = 0,
		p = 0;
	for (let i = 0; i < clean.length; i++) {
		acc = (acc << 6) | lookup[clean.charCodeAt(i)];
		bits += 6;
		if (bits >= 8) {
			bits -= 8;
			out[p++] = (acc >> bits) & 0xff;
		}
	}
	return out.subarray(0, p);
}

export function isAutoParent(parent: Container): boolean {
	return (
		"layoutMode" in parent && (parent as FrameNode).layoutMode !== "NONE"
	);
}

// Размер/позиция с учётом того, лежит ли нода внутри auto-layout.
export function applySizing(
	node: SceneNode & LayoutMixin & { resize(w: number, h: number): void },
	spec: AnySpec,
	inAuto: boolean,
): void {
	try {
		if (inAuto && "layoutSizingHorizontal" in node) {
			// "hug" Figma разрешает только текстам и фреймам с auto-layout; у
			// остальных (фрейм без layout, фигуры) это исключение — сообщаем
			// модели понятно, чтобы она задала layout, а не молча теряем размер.
			const canHug =
				node.type === "TEXT" ||
				("layoutMode" in node &&
					(node as FrameNode).layoutMode !== "NONE");
			const hugOk = (axis: "w" | "h"): boolean => {
				if (canHug) return true;
				state.warnings.push(
					`${node.name}: ${axis}:"hug" невозможен — у ноды нет auto-layout (hug works only on frames with layout "vertical"/"horizontal" and on text). Задайте layout у фрейма или числовой размер`,
				);
				return false;
			};
			if (spec.w === "fill") node.layoutSizingHorizontal = "FILL";
			else if (spec.w === "hug" && hugOk("w"))
				node.layoutSizingHorizontal = "HUG";
			else if (typeof spec.w === "number" || spec.w === "hug")
				node.layoutSizingHorizontal = "FIXED";
			if (spec.h === "fill") node.layoutSizingVertical = "FILL";
			else if (spec.h === "hug" && hugOk("h"))
				node.layoutSizingVertical = "HUG";
			else if (typeof spec.h === "number" || spec.h === "hug")
				node.layoutSizingVertical = "FIXED";
		}
		const tw = typeof spec.w === "number" ? spec.w : node.width;
		const th = typeof spec.h === "number" ? spec.h : node.height;
		if (typeof spec.w === "number" || typeof spec.h === "number") {
			node.resize(Math.max(tw, 0.01), Math.max(th, 0.01));
		}
		// Корень/фрейм вне auto-layout родителя с "hug": растёт по содержимому
		// через режим размера самого фрейма (layoutSizing* работает только у детей).
		if (!inAuto && "layoutMode" in node) {
			const f = node as unknown as FrameNode;
			if (f.layoutMode !== "NONE") {
				const vertical = f.layoutMode === "VERTICAL";
				if (spec.w === "hug") {
					if (vertical) f.counterAxisSizingMode = "AUTO";
					else f.primaryAxisSizingMode = "AUTO";
				}
				if (spec.h === "hug") {
					if (vertical) f.primaryAxisSizingMode = "AUTO";
					else f.counterAxisSizingMode = "AUTO";
				}
			}
		}
		if (!inAuto) {
			if (typeof spec.x === "number") node.x = spec.x;
			if (typeof spec.y === "number") node.y = spec.y;
		}
	} catch (err) {
		state.warnings.push(`размер/позиция: ${String(err)}`);
	}
}

// Типографские поля текста, общие для сборки и правок (шрифт уже загружен).
export function applyTextExtras(t: TextNode, spec: Record<string, unknown>): void {
	try {
		const ls = spec.letterSpacing;
		if (typeof ls === "number") t.letterSpacing = { value: ls, unit: "PIXELS" };
		else if (typeof ls === "string" && /^-?\d+(\.\d+)?%$/.test(ls.trim()))
			t.letterSpacing = { value: parseFloat(ls), unit: "PERCENT" };
		const cases: Record<string, TextCase> = {
			upper: "UPPER",
			lower: "LOWER",
			title: "TITLE",
			none: "ORIGINAL",
		};
		if (cases[String(spec.textCase)]) t.textCase = cases[String(spec.textCase)];
		const decorations: Record<string, TextDecoration> = {
			underline: "UNDERLINE",
			strike: "STRIKETHROUGH",
			none: "NONE",
		};
		if (decorations[String(spec.textDecoration)])
			t.textDecoration = decorations[String(spec.textDecoration)];
		if (typeof spec.maxLines === "number" && spec.maxLines > 0) {
			// Обрезка по строкам работает только у текста с переносом по ширине
			if (t.textAutoResize === "WIDTH_AND_HEIGHT") t.textAutoResize = "HEIGHT";
			t.textTruncation = "ENDING";
			t.maxLines = Math.round(spec.maxLines);
		}
	} catch (err) {
		state.warnings.push(`текст «${t.name}»: ${String(err)}`);
	}
	applyMinMax(t, spec);
}

// Ограничения ширины (работают у детей auto-layout и у самих auto-layout фреймов).
export function applyMinMax(
	node: SceneNode,
	spec: Record<string, unknown>,
): void {
	if (typeof spec.minW !== "number" && typeof spec.maxW !== "number") return;
	try {
		const n = node as FrameNode;
		if (typeof spec.minW === "number") n.minWidth = spec.minW;
		if (typeof spec.maxW === "number") n.maxWidth = spec.maxW;
	} catch (err) {
		state.warnings.push(
			`${node.name}: minW/maxW работают только в auto-layout — ${String(err)}`,
		);
	}
}

// position:"absolute" — нода внутри auto-layout выпадает из потока (бейдж
// поверх фото, декор): x/y — от родителя, right/bottom — от правого/нижнего
// края (ставятся в placeAnchored). Возвращает, участвует ли нода в потоке.
export function applyPosition(
	node: SceneNode,
	spec: AnySpec,
	inAuto: boolean,
): boolean {
	let flow = inAuto;
	if (inAuto && "layoutPositioning" in node) {
		try {
			const n = node as FrameNode;
			if (spec.position === "absolute") n.layoutPositioning = "ABSOLUTE";
			else if (spec.position === "auto") n.layoutPositioning = "AUTO";
			flow = n.layoutPositioning !== "ABSOLUTE";
		} catch (err) {
			state.warnings.push(`${node.name}: position — ${String(err)}`);
		}
	}
	if (!flow && (typeof spec.right === "number" || typeof spec.bottom === "number"))
		state.anchors.push({
			node,
			right: typeof spec.right === "number" ? spec.right : undefined,
			bottom: typeof spec.bottom === "number" ? spec.bottom : undefined,
		});
	if (inAuto && !flow && spec.w === "fill")
		state.warnings.push(
			`${node.name}: w:"fill" не работает у position:"absolute" — нужен числовой размер`,
		);
	return flow;
}

// Привязка к правому/нижнему краю: после сборки, когда hug-родители уже
// приняли итоговый размер. Constraints держат отступ при дальнейших ресайзах.
export function placeAnchored(): void {
	for (const a of state.anchors) {
		const n = a.node;
		const p = n.parent;
		if (n.removed || !p || p.type === "PAGE" || !("width" in p)) continue;
		try {
			const c =
				"constraints" in n
					? { ...(n as ConstraintMixin).constraints }
					: null;
			if (typeof a.right === "number") {
				n.x = p.width - n.width - a.right;
				if (c) c.horizontal = "MAX";
			}
			if (typeof a.bottom === "number") {
				n.y = p.height - n.height - a.bottom;
				if (c) c.vertical = "MAX";
			}
			if (c) (n as ConstraintMixin).constraints = c;
		} catch (err) {
			state.warnings.push(`${n.name}: right/bottom — ${String(err)}`);
		}
	}
	state.anchors.length = 0;
}

// Все шрифты текста (у текста со spans их несколько) — без загрузки
// всех Figma не даст поменять characters/fontSize.
export async function loadTextFonts(t: TextNode): Promise<void> {
	const fonts =
		t.characters.length > 0
			? t.getRangeAllFontNames(0, t.characters.length)
			: [t.fontName as FontName];
	for (const f of fonts) await ensureFont(f.family, f.style);
}

export function spansText(spans: unknown): string | undefined {
	if (!Array.isArray(spans) || !spans.length) return undefined;
	return spans
		.map((s) => (s && typeof s === "object" ? String((s as { text?: unknown }).text ?? "") : ""))
		.join("");
}

const DECORATIONS: Record<string, TextDecoration> = {
	underline: "UNDERLINE",
	strike: "STRIKETHROUGH",
	none: "NONE",
};

// Разные стили внутри одного текста: spans идут подряд, текст ноды — их
// склейка (уже записан в characters). Общий стиль задаёт сама нода.
export async function applySpans(t: TextNode, spans: unknown): Promise<void> {
	if (!Array.isArray(spans)) return;
	const base = (
		t.fontName === figma.mixed ? t.getRangeFontName(0, 1) : t.fontName
	) as FontName;
	let at = 0;
	for (const raw of spans) {
		if (!raw || typeof raw !== "object") continue;
		const s = raw as Record<string, unknown>;
		const len = typeof s.text === "string" ? s.text.length : 0;
		if (!len) continue;
		const end = Math.min(at + len, t.characters.length);
		try {
			if (typeof s.fontFamily === "string" || s.fontWeight !== undefined)
				t.setRangeFontName(
					at,
					end,
					await ensureFont(
						typeof s.fontFamily === "string" ? s.fontFamily : base.family,
						STYLE_BY_WEIGHT[String(s.fontWeight)] || base.style,
					),
				);
			if (typeof s.fontSize === "number") t.setRangeFontSize(at, end, s.fontSize);
			if (typeof s.color === "string") {
				const { color, alpha } = hexToRgba(s.color);
				t.setRangeFills(at, end, [{ type: "SOLID", color, opacity: alpha }]);
			}
			if (DECORATIONS[String(s.textDecoration)])
				t.setRangeTextDecoration(at, end, DECORATIONS[String(s.textDecoration)]);
			if (typeof s.link === "string" && s.link.trim())
				t.setRangeHyperlink(at, end, { type: "URL", value: s.link.trim() });
		} catch (err) {
			state.warnings.push(`текст «${t.name}», span «${String(s.text)}»: ${String(err)}`);
		}
		at += len;
	}
}

// Начертание в семействе пишется по-разному: «Semi Bold» / «SemiBold» / «DemiBold».
const STYLE_ALIASES: Record<string, string[]> = {
	thin: ["thin", "hairline"],
	light: ["light"],
	regular: ["regular", "book", "normal", "roman"],
	medium: ["medium"],
	semibold: ["semibold", "demibold"],
	bold: ["bold"],
	extrabold: ["extrabold", "ultrabold", "heavy"],
	black: ["black", "heavy"],
};
let fontList: Font[] | null = null;
const fontAlias = new Map<string, string>();
async function sameStyle(family: string, style: string): Promise<string | null> {
	fontList ||= await figma.listAvailableFontsAsync();
	const norm = (x: string) => x.toLowerCase().replace(/[\s_-]/g, "");
	const want = norm(style);
	const names = STYLE_ALIASES[want] || [want];
	const own = fontList.filter((f) => f.fontName.family === family).map((f) => f.fontName.style);
	return own.find((st) => names.includes(norm(st))) || null;
}

export async function ensureFont(
	family: string,
	style: string,
): Promise<FontName> {
	const key = `${family}|${style}`;
	if (!loadedFonts.has(key)) {
		try {
			await figma.loadFontAsync({ family, style });
			loadedFonts.add(key);
		} catch {
			const alt = await sameStyle(family, style).catch(() => null);
			if (alt && alt !== style) {
				try {
					await figma.loadFontAsync({ family, style: alt });
					loadedFonts.add(key);
					fontAlias.set(key, alt);
					return { family, style: alt };
				} catch {
					/* дальше — запасной шрифт */
				}
			}
			state.warnings.push(
				`шрифт ${family} ${style} недоступен — заменён на Inter Regular`,
			);
			return ensureFont("Inter", "Regular");
		}
	}
	return { family, style: fontAlias.get(key) || style };
}

// Резолв компонента для instance: по имени среди построенных в этой
// спеке, по id, по имени на странице (библиотека из прошлых ходов).
async function resolveComponent(ref: string): Promise<BaseNode | null> {
	const named = state.namedComponents.get(ref);
	if (named && !named.removed) return named;
	let byId: BaseNode | null = null;
	try {
		byId = await figma.getNodeByIdAsync(ref);
	} catch {
		byId = null;
	}
	if (byId && !byId.removed) return byId;
	return figma.currentPage.findOne(
		(n) =>
			(n.type === "COMPONENT" || n.type === "COMPONENT_SET") &&
			n.name === ref,
	);
}

// Эффекты и поворот — общие для любых нод (сборка и update).
export function applyLook(node: SceneNode, spec: AnySpec): void {
	try {
		if ("effects" in node) {
			const n = node as { effects: readonly Effect[] };
			applyShadow(n, spec.shadow as Parameters<typeof applyShadow>[1]);
			applyBlurs(n, spec);
		}
		if (typeof spec.rotation === "number" && "rotation" in node) {
			// Как в CSS: градусы по часовой, вокруг центра (Figma крутит вокруг
			// левого верхнего угла и против часовой).
			const w = node.width;
			const h = node.height;
			const center = (t: Transform) => [
				t[0][0] * (w / 2) + t[0][1] * (h / 2) + t[0][2],
				t[1][0] * (w / 2) + t[1][1] * (h / 2) + t[1][2],
			];
			const before = center(node.relativeTransform);
			node.rotation = -spec.rotation;
			const after = center(node.relativeTransform);
			node.x += before[0] - after[0];
			node.y += before[1] - after[1];
		}
	} catch (err) {
		state.warnings.push(`${node.name}: эффекты/поворот — ${String(err)}`);
	}
	applyExtras(node, spec as Record<string, unknown>);
}

function shapeMeta(spec: AnySpec): Record<string, unknown> {
	const { type: _t, id: _i, ...rest } = spec as Record<string, unknown>;
	return rest;
}

// Векторная фигура: контур → svg → createNodeFromSvg → flatten в одну ноду.
async function buildShape(spec: AnySpec, parent: Container): Promise<VectorNode | null> {
	const [w, h] = shapeSize(spec.w, spec.h);
	const made = shapeSvg(spec as Record<string, unknown>, w, h);
	if (!made) {
		state.warnings.push(`${spec.name || "shape"}: неизвестный вид или неверный контур (shape/d)`);
		return null;
	}
	try {
		const frame = figma.createNodeFromSvg(made.svg);
		parent.appendChild(frame);
		const vec = figma.flatten([frame], parent) as VectorNode;
		vec.name = typeof spec.name === "string" ? spec.name : "Shape";
		if (Math.abs(vec.width - w) > 0.5 || Math.abs(vec.height - h) > 0.5) vec.resize(w, h);
		return vec;
	} catch (err) {
		state.warnings.push(`${spec.name || "shape"}: ${String(err)}`);
		return null;
	}
}

export async function buildNode(
	spec: AnySpec,
	parent: Container,
	inAuto: boolean,
): Promise<SceneNode | null> {
	const node = await buildBare(spec, parent, inAuto);
	if (node && spec && typeof spec === "object") {
		applyLook(node, spec);
		if ((spec as { mask?: unknown }).mask === true && "isMask" in node) {
			if (inAuto) state.warnings.push(`${node.name}: mask:true работает только во фрейме с layout:"none"`);
			else (node as GeometryMixin & { isMask: boolean }).isMask = true;
		}
		// Исходник фигуры/булевой операции — модель видит его при сериализации.
		if ((spec.type === "shape" || spec.type === "bool") && !(spec as { meta?: unknown }).meta)
			node.setPluginData("meta", JSON.stringify({ [spec.type as string]: shapeMeta(spec) }).slice(0, 20000));
		// Исходник блока (chart/table): по нему модель потом меняет данные.
		const meta = (spec as { meta?: unknown }).meta;
		if (meta && typeof meta === "object")
			node.setPluginData("meta", JSON.stringify(meta));
	}
	return node;
}

async function buildBare(
	spec: AnySpec,
	parent: Container,
	inAuto: boolean,
): Promise<SceneNode | null> {
	if (!spec || typeof spec !== "object") return null;

	switch (spec.type) {
		case "frame": {
			// component:true — главный компонент вместо обычного фрейма
			// (те же свойства лейаута; детей/стили строим теми же путями).
			const frame: FrameNode | ComponentNode =
				spec.component === true
					? figma.createComponent()
					: figma.createFrame();
			frame.name = typeof spec.name === "string" ? spec.name : "Frame";
			parent.appendChild(frame);
			// Компоненты регистрируем по имени сразу — инстансы в этой же
			// спеке (и дальше) резолвят их через "component": "<имя>".
			if (spec.component === true && typeof spec.name === "string")
				state.namedComponents.set(spec.name, frame as ComponentNode);
			frame.clipsContent = spec.clip === true;

			if (spec.layout === "vertical" || spec.layout === "horizontal") {
				frame.layoutMode =
					spec.layout === "vertical" ? "VERTICAL" : "HORIZONTAL";
				frame.itemSpacing = typeof spec.gap === "number" ? spec.gap : 0;
				const p = paddingOf(
					spec.padding as number | number[] | undefined,
				);
				frame.paddingTop = p.t;
				frame.paddingRight = p.r;
				frame.paddingBottom = p.b;
				frame.paddingLeft = p.l;
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
				frame.primaryAxisAlignItems = (mainAlign[String(spec.align)] ||
					"MIN") as FrameNode["primaryAxisAlignItems"];
				frame.counterAxisAlignItems = (crossAlign[String(spec.cross)] ||
					"MIN") as FrameNode["counterAxisAlignItems"];
				if (spec.wrap === true) {
					frame.layoutWrap = "WRAP";
					// зазор между строками: rowGap, иначе равен gap
					const row = typeof spec.rowGap === "number" ? spec.rowGap : typeof spec.gap === "number" ? spec.gap : 0;
					frame.counterAxisSpacing = row;
				}
			}

			applyFill(
				frame,
				spec.fill !== undefined ? (spec.fill as Fill) : "none",
			);
			applyStroke(
				frame,
				spec as { stroke?: string; strokeWidth?: number },
			);
			applyRadius(frame, spec.radius as number | number[] | undefined);
			applyShadow(
				frame,
				spec.shadow as {
					x?: number;
					y?: number;
					blur?: number;
					color?: string;
				},
			);
			if (typeof spec.opacity === "number") frame.opacity = spec.opacity;

			state.nodeCount++;
			if (Array.isArray(spec.children)) {
				const childInAuto = frame.layoutMode !== "NONE";
				const children = spec.children;
				// Фрейм с компонентами и одиночные компоненты строим
				// первыми: инстансы могут ссылаться на них по имени раньше
				// их очереди в списке. В основном проходе готовую ноду
				// просто переставляем на её позицию.
				const isComponents = (c: AnySpec) =>
					c?.type === "frame" &&
					(c.component === true ||
						/^components$/i.test(String(c.name || "")));
				for (const child of children) {
					if (!isComponents(child)) continue;
					const node = await buildNode(child, frame, childInAuto);
					if (node) state.prebuilt.set(child, node);
				}
				for (const child of children) {
					const done = state.prebuilt.get(child);
					if (done && !done.removed) {
						frame.appendChild(done);
						continue;
					}
					await buildNode(child, frame, childInAuto);
				}
			}
			// Размеры применяем ПОСЛЕ детей: HUG/FILL должны считаться
			// от реального контента, иначе пустой фрейм остаётся 100px.
			applySizing(frame, spec, applyPosition(frame, spec, inAuto));
			applyMinMax(frame, spec as Record<string, unknown>);
			return frame;
		}

		case "text": {
			const text = figma.createText();
			parent.appendChild(text);
			const family =
				typeof spec.fontFamily === "string" ? spec.fontFamily : "Inter";
			const style = STYLE_BY_WEIGHT[String(spec.fontWeight)] || "Regular";
			// textStyle — локальный текстовый стиль файла: шрифт и размер берутся из него.
			const tStyle =
				typeof spec.textStyle === "string"
					? textStyleOf(spec.textStyle)
					: undefined;
			if (typeof spec.textStyle === "string" && !tStyle)
				state.warnings.push(`textStyle «${spec.textStyle}» не найден`);
			text.fontName = await ensureFont(
				tStyle ? tStyle.font.family : family,
				tStyle ? tStyle.font.style : style,
			);
			if (tStyle) {
				try {
					await text.setTextStyleIdAsync(tStyle.id);
				} catch (err) {
					state.warnings.push(`textStyle: ${String(err)}`);
				}
			}
			text.characters =
				spansText(spec.spans) ??
				(typeof spec.text === "string" ? spec.text : String(spec.text ?? ""));
			if (typeof spec.fontSize === "number" && !tStyle)
				text.fontSize = spec.fontSize;
			if (typeof spec.color === "string") {
				const { color, alpha } = hexToRgba(spec.color);
				text.fills = [{ type: "SOLID", color, opacity: alpha }];
				queueFillStyle(text, spec.color);
			}
			const aligns: Record<string, "LEFT" | "CENTER" | "RIGHT"> = {
				left: "LEFT",
				center: "CENTER",
				right: "RIGHT",
			};
			if (aligns[String(spec.align)])
				text.textAlignHorizontal = aligns[String(spec.align)];
			if (typeof spec.lineHeight === "number")
				text.lineHeight = { value: spec.lineHeight, unit: "PIXELS" };
			if (typeof spec.opacity === "number") text.opacity = spec.opacity;
			if (spec.name) text.name = String(spec.name);
			await applySpans(text, spec.spans);
			const flow = applyPosition(text, spec, inAuto);

			try {
				if (flow && spec.w === "fill") {
					text.textAutoResize = "HEIGHT";
					text.layoutSizingHorizontal = "FILL";
				} else if (typeof spec.w === "number") {
					text.textAutoResize = "HEIGHT";
					text.resize(spec.w, text.height);
				} else {
					text.textAutoResize = "WIDTH_AND_HEIGHT";
				}
				if (!flow) {
					if (typeof spec.x === "number") text.x = spec.x;
					if (typeof spec.y === "number") text.y = spec.y;
				}
			} catch (err) {
				state.warnings.push(`размер текста: ${String(err)}`);
			}
			applyTextExtras(text, spec as Record<string, unknown>);
			state.nodeCount++;
			return text;
		}

		case "rect": {
			const rect = figma.createRectangle();
			rect.name = typeof spec.name === "string" ? spec.name : "Rectangle";
			parent.appendChild(rect);
			applyFill(
				rect,
				spec.fill !== undefined ? (spec.fill as Fill) : "#D9D9D9",
			);
			applyStroke(
				rect,
				spec as { stroke?: string; strokeWidth?: number },
			);
			applyRadius(rect, spec.radius as number | number[] | undefined);
			if (typeof spec.opacity === "number") rect.opacity = spec.opacity;
			applySizing(rect, spec, applyPosition(rect, spec, inAuto));
			state.nodeCount++;
			return rect;
		}

		case "ellipse": {
			const ellipse = figma.createEllipse();
			ellipse.name =
				typeof spec.name === "string" ? spec.name : "Ellipse";
			parent.appendChild(ellipse);
			applyFill(
				ellipse,
				spec.fill !== undefined ? (spec.fill as Fill) : "#D9D9D9",
			);
			applyStroke(
				ellipse,
				spec as { stroke?: string; strokeWidth?: number },
			);
			if (typeof spec.opacity === "number")
				ellipse.opacity = spec.opacity;
			applySizing(ellipse, spec, applyPosition(ellipse, spec, inAuto));
			state.nodeCount++;
			return ellipse;
		}

		case "line": {
			// Реализуем тонким прямоугольником — предсказуемо в auto-layout.
			const width =
				typeof spec.strokeWidth === "number" ? spec.strokeWidth : 1;
			const length = typeof spec.w === "number" ? spec.w : 100;
			const vertical = spec.direction === "vertical";
			return buildNode(
				{
					type: "rect",
					name: spec.name || "Line",
					w: vertical ? width : length,
					h: vertical ? length : width,
					fill:
						typeof spec.stroke === "string"
							? spec.stroke
							: "#000000",
					x: spec.x,
					y: spec.y,
					opacity: spec.opacity,
					position: spec.position,
					right: spec.right,
					bottom: spec.bottom,
				},
				parent,
				inAuto,
			);
		}

		case "image": {
			// Скачанное сервером фото (data — base64): прямоугольник с
			// image-заливкой. Без данных — серый плейсхолдер с подписью.
			if (typeof spec.data === "string" && spec.data) {
				try {
					const image = figma.createImage(decodeBase64(spec.data));
					const rect = figma.createRectangle();
					rect.name =
						(typeof spec.name === "string" && spec.name) ||
						(typeof spec.label === "string" && spec.label) ||
						(typeof spec.query === "string" && spec.query) ||
						"Image";
					// Запрос сохраняем в ноде — сериализатор покажет его
					// модели, и фото можно будет заменить через update.
					if (typeof spec.query === "string" && spec.query)
						rect.setPluginData("query", spec.query);
					parent.appendChild(rect);
					rect.fills = [
						{
							type: "IMAGE",
							scaleMode: "FILL",
							imageHash: image.hash,
						},
					];
					applyRadius(
						rect,
						spec.radius as number | number[] | undefined,
					);
					applyImageExtras(rect, spec);
					if (typeof spec.opacity === "number")
						rect.opacity = spec.opacity;
					applySizing(rect, spec, applyPosition(rect, spec, inAuto));
					state.nodeCount++;
					return rect;
				} catch (err) {
					state.warnings.push(`картинка: ${String(err)}`);
				}
			}
			// Плейсхолдер под картинку: серая подложка с подписью. Помечаем его —
			// дерево и lint отличают заглушку от настоящего фото.
			const placeholder = await buildNode(
				{
					type: "frame",
					name: spec.name || spec.label || "Image",
					w: spec.w,
					h: spec.h,
					x: spec.x,
					y: spec.y,
					position: spec.position,
					right: spec.right,
					bottom: spec.bottom,
					radius: spec.radius,
					layout: "vertical",
					align: "center",
					cross: "center",
					fill: "#E4E4E7",
					stroke: "#D4D4D8",
					strokeWidth: 1,
					children: [
						{
							type: "text",
							text:
								typeof spec.label === "string"
									? spec.label
									: "image",
							fontSize: 12,
							color: "#71717A",
						},
					],
				},
				parent,
				inAuto,
			);
			if (placeholder) {
				placeholder.setPluginData("placeholder", "1");
				if (typeof spec.query === "string" && spec.query)
					placeholder.setPluginData("query", spec.query);
			}
			return placeholder;
		}

		case "instance": {
			// Экземпляр компонента: component — id, имя компонента из этой
			// же спеки/страницы или набора вариантов; variants выбирает
			// конкретный вариант ({"State":"Hover"}), без него — дефолтный.
			const source =
				typeof spec.component === "string"
					? await resolveComponent(spec.component)
					: null;
			let main: ComponentNode | null = null;
			if (
				source &&
				(source.type === "COMPONENT" || source.type === "COMPONENT_SET")
			) {
				try {
					main = selectVariant(source, spec.variants);
				} catch (err) {
					// Нет такого варианта — не ставим случайный дефолт.
					state.warnings.push(
						`instance: ${String((err as Error)?.message || err)}`,
					);
					return null;
				}
			}
			if (main && !main.removed) {
				const inst = main.createInstance();
				parent.appendChild(inst);
				if (typeof spec.name === "string") inst.name = spec.name;
				if (typeof spec.opacity === "number")
					inst.opacity = spec.opacity;
				// overrides: {"<имя текстового слоя>": "новый текст"}
				const overrides =
					spec.overrides && typeof spec.overrides === "object"
						? (spec.overrides as Record<string, unknown>)
						: {};
				for (const [layer, value] of Object.entries(overrides)) {
					const target = inst.findOne(
						(n) => n.type === "TEXT" && n.name === layer,
					) as TextNode | null;
					if (!target || typeof value !== "string") {
						state.warnings.push(
							`instance: нет текстового слоя «${layer}»`,
						);
						continue;
					}
					await loadTextFonts(target);
					target.characters = value;
				}
				applySizing(inst, spec, applyPosition(inst, spec, inAuto));
				state.nodeCount++;
				return inst;
			}
			state.warnings.push(
				`instance: компонент ${String(spec.component)} не найден`,
			);
			return buildNode(
				{
					type: "frame",
					name:
						typeof spec.name === "string"
							? spec.name
							: "Missing component",
					w: spec.w,
					h: spec.h,
					fill: "#F4F4F5",
					stroke: "#E4E4E7",
					strokeWidth: 1,
				},
				parent,
				inAuto,
			);
		}

		case "ref": {
			// Ссылка на существующую ноду, которую спекой не описать (вектор,
			// фото-заливка…): клонируем её в новое дерево. Именно клон, а не
			// перенос — иначе при сбое сборки оригинал пропал бы вместе с
			// недостроенным фреймом.
			const source =
				typeof spec.id === "string"
					? await figma.getNodeByIdAsync(spec.id)
					: null;
			if (source && "clone" in source && !source.removed) {
				const copy = (source as SceneNode).clone();
				parent.appendChild(copy);
				// Мокап: клон экрана масштабируем под ширину экрана устройства.
				if (typeof spec.scaleToWidth === "number" && spec.scaleToWidth > 0 && "rescale" in copy && copy.width > 0)
					(copy as SceneNode & { rescale(s: number): void }).rescale(spec.scaleToWidth / copy.width);
				if (typeof spec.name === "string") copy.name = spec.name;
				if (typeof spec.opacity === "number" && "opacity" in copy)
					copy.opacity = spec.opacity;
				applySizing(
					copy as SceneNode &
						LayoutMixin & { resize(w: number, h: number): void },
					spec,
					applyPosition(copy, spec, inAuto),
				);
				state.nodeCount++;
				return copy;
			}
			state.warnings.push(`ref: нода ${String(spec.id)} не найдена`);
			return buildNode(
				{
					type: "frame",
					name: typeof spec.name === "string" ? spec.name : "Missing",
					w: spec.w,
					h: spec.h,
					fill: "#F4F4F5",
					stroke: "#E4E4E7",
					strokeWidth: 1,
				},
				parent,
				inAuto,
			);
		}

		case "shape": {
			const vec = await buildShape(spec, parent);
			if (!vec) return buildNode({ type: "rect", name: spec.name || "Shape", w: spec.w, h: spec.h, fill: "#E4E4E7" }, parent, inAuto);
			applyFill(vec as unknown as SceneNode & GeometryMixin, spec.fill !== undefined ? (spec.fill as Fill) : "#D9D9D9");
			applyStroke(vec as unknown as SceneNode & GeometryMixin, spec as { stroke?: string; strokeWidth?: number });
			if (typeof spec.opacity === "number") vec.opacity = spec.opacity;
			const flow = applyPosition(vec, spec, inAuto);
			if (inAuto && "layoutSizingHorizontal" in vec) applySizing(vec as never, spec, inAuto);
			// вне потока (layout:"none" или position:"absolute") фигура встаёт по x/y
			if (!flow) {
				if (typeof spec.x === "number") vec.x = spec.x;
				if (typeof spec.y === "number") vec.y = spec.y;
			}
			state.nodeCount++;
			return vec;
		}

		case "bool": {
			// Булева операция над фигурами: детей строим во временном контейнере
			// без auto-layout (их x/y — от начала фигуры), затем union/subtract/…
			const op = BOOL_OPS.includes(String(spec.op) as BoolOp) ? (String(spec.op) as BoolOp) : "union";
			const kids = Array.isArray(spec.children) ? spec.children : [];
			if (kids.length < 2) {
				state.warnings.push(`${spec.name || "bool"}: для булевой операции нужно минимум 2 фигуры`);
			}
			const holder = figma.createFrame();
			holder.fills = [];
			holder.clipsContent = false;
			parent.appendChild(holder);
			const made: SceneNode[] = [];
			for (const c of kids) {
				const n = await buildNode(c as AnySpec, holder, false);
				if (n) made.push(n);
			}
			if (made.length < 2) {
				holder.remove();
				return buildNode({ type: "rect", name: spec.name || "Shape", w: spec.w || 40, h: spec.h || 40, fill: "#E4E4E7" }, parent, inAuto);
			}
			let result: SceneNode;
			try {
				result = (figma[op as BoolOp] as unknown as (n: SceneNode[], p: BaseNode & ChildrenMixin) => SceneNode)(made, holder);
			} catch (err) {
				state.warnings.push(`${spec.name || "bool"}: ${op} — ${String(err)}`);
				holder.remove();
				return null;
			}
			result.name = typeof spec.name === "string" ? spec.name : `Shape ${op}`;
			const ox = result.x;
			const oy = result.y;
			parent.appendChild(result);
			holder.remove();
			if (spec.fill !== undefined) applyFill(result as unknown as SceneNode & GeometryMixin, spec.fill as Fill);
			applyStroke(result as unknown as SceneNode & GeometryMixin, spec as { stroke?: string; strokeWidth?: number });
			if (typeof spec.opacity === "number" && "opacity" in result) result.opacity = spec.opacity;
			const inFlow = applyPosition(result, spec, inAuto);
			// Начало координат детей — угол фигуры: сдвиг bbox результата сохраняем.
			if (!inFlow) {
				result.x = (typeof spec.x === "number" ? spec.x : 0) + ox;
				result.y = (typeof spec.y === "number" ? spec.y : 0) + oy;
			}
			state.nodeCount++;
			return result;
		}

		case "icon": {
			// SVG-иконка: собираем векторный фрейм из разметки.
			if (typeof spec.svg === "string" && spec.svg.trim()) {
				try {
					const icon = figma.createNodeFromSvg(spec.svg);
					icon.name =
						typeof spec.name === "string" ? spec.name : "Icon";
					parent.appendChild(icon);
					if (typeof spec.opacity === "number")
						icon.opacity = spec.opacity;
					applySizing(icon, spec, applyPosition(icon, spec, inAuto));
					state.nodeCount++;
					return icon;
				} catch (err) {
					state.warnings.push(`svg-иконка: ${String(err)}`);
				}
			} else {
				state.warnings.push("icon: нет валидной svg-разметки");
			}
			return buildNode(
				{
					type: "frame",
					name: typeof spec.name === "string" ? spec.name : "Icon",
					w: spec.w || 24,
					h: spec.h || 24,
					fill: "#E4E4E7",
					stroke: "#D4D4D8",
					strokeWidth: 1,
					radius: 4,
				},
				parent,
				inAuto,
			);
		}

		default: {
			state.warnings.push(`неизвестный тип узла: ${String(spec.type)}`);
			return buildNode(
				{
					type: "frame",
					name: `unsupported: ${String(spec.type)}`,
					w: spec.w,
					h: spec.h,
					fill: "#F4F4F5",
					stroke: "#E4E4E7",
					strokeWidth: 1,
				},
				parent,
				inAuto,
			);
		}
	}
}

export interface ReplacePlace {
	x: number;
	y: number;
	parent: (BaseNode & ChildrenMixin) | null;
	index: number;
	sizingH?: "FIXED" | "HUG" | "FILL";
	sizingV?: "FIXED" | "HUG" | "FILL";
}

export async function buildRoot(
	spec: AnySpec,
	place?: ReplacePlace | null,
): Promise<SceneNode> {
	if (spec.type !== "frame") {
		throw new Error("корневой узел спеки должен быть frame");
	}
	const root = await buildNode(
		spec,
		figma.currentPage as unknown as Container,
		false,
	);
	if (!root) throw new Error("не удалось построить корневой фрейм");
	placeAnchored();
	// При замене возвращаем новую ноду в родителя старой на тот же
	// индекс — если родитель auto-layout, позицию даст лейаут;
	// иначе координаты сохранятся (insertChild держит абсолютную позицию).
	if (place?.parent && !place.parent.removed) {
		try {
			place.parent.insertChild(
				Math.min(place.index, place.parent.children.length),
				root,
			);
			// В auto-layout родителе повторяем sizing заменённой ноды.
			if ("layoutSizingHorizontal" in root) {
				if (place.sizingH) root.layoutSizingHorizontal = place.sizingH;
				if (place.sizingV) root.layoutSizingVertical = place.sizingV;
			}
		} catch {
			// Родитель недоступен (инстанс/компонент) — строим на странице.
			root.x = place.x;
			root.y = place.y;
		}
	} else {
		const center = figma.viewport.center;
		root.x = place ? place.x : Math.round(center.x - root.width / 2);
		root.y = place ? place.y : Math.round(center.y - root.height / 2);
	}
	state.lastBuiltRootId = root.id;
	figma.currentPage.selection = [root];
	figma.viewport.scrollAndZoomIntoView([root]);
	return root;
}
