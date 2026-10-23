/// <reference types="@figma/plugin-typings" />
// Дизайн-система файла: локальные стили цвета/текста и переменные. Модель
// получает их список и ссылается на стили по имени: "style:Brand/Primary"
// в цветах, "textStyle":"Heading/H1" у текста. Значение берётся из стиля,
// а привязка к самому стилю ставится после сборки (async-сеттеры).

import { isBackup } from "./undo";

type PaintInfo = { id: string; hex: string };
type TextInfo = { id: string; font: FontName };

const paints = new Map<string, PaintInfo>();
const texts = new Map<string, TextInfo>();

export type DesignSystem = {
	colors: { name: string; hex: string }[];
	text: { name: string; size: number; family: string; weight: string }[];
	variables: { name: string; type: string; value: string | number }[];
};

function toHex(c: RGB): string {
	const h = (v: number) =>
		Math.round(Math.max(0, Math.min(1, v)) * 255)
			.toString(16)
			.padStart(2, "0");
	return `#${h(c.r)}${h(c.g)}${h(c.b)}`.toUpperCase();
}

// Читает стили и переменные файла. Не бросает: при недоступности API
// возвращает то, что удалось прочитать.
export async function loadDesignSystem(): Promise<DesignSystem> {
	const ds: DesignSystem = { colors: [], text: [], variables: [] };
	paints.clear();
	texts.clear();
	try {
		for (const s of await figma.getLocalPaintStylesAsync()) {
			const solid = s.paints.find(
				(p): p is SolidPaint => p.type === "SOLID" && p.visible !== false,
			);
			if (!solid) continue;
			const hex = toHex(solid.color);
			paints.set(s.name, { id: s.id, hex });
			if (ds.colors.length < 40) ds.colors.push({ name: s.name, hex });
		}
	} catch {
		/* стили недоступны */
	}
	try {
		for (const s of await figma.getLocalTextStylesAsync()) {
			texts.set(s.name, { id: s.id, font: s.fontName });
			if (ds.text.length < 30)
				ds.text.push({
					name: s.name,
					size: s.fontSize,
					family: s.fontName.family,
					weight: s.fontName.style,
				});
		}
	} catch {
		/* стили недоступны */
	}
	try {
		const collections = await figma.variables.getLocalVariableCollectionsAsync();
		const defaultMode = new Map(
			collections.map((c) => [c.id, c.defaultModeId] as const),
		);
		for (const v of await figma.variables.getLocalVariablesAsync()) {
			if (ds.variables.length >= 40) break;
			if (v.resolvedType !== "COLOR" && v.resolvedType !== "FLOAT") continue;
			const raw = v.valuesByMode[defaultMode.get(v.variableCollectionId) ?? ""];
			if (raw === undefined || (typeof raw === "object" && "type" in raw))
				continue; // алиас на другую переменную — значение не показываем
			const value =
				v.resolvedType === "COLOR" && typeof raw === "object"
					? toHex(raw as RGB)
					: (raw as number);
			ds.variables.push({ name: v.name, type: v.resolvedType, value });
		}
	} catch {
		/* переменные недоступны */
	}
	return ds;
}

// Популярные семейства, которые стоит предложить модели первыми, если они
// установлены (остальные доступные — следом, до лимита).
const PREFERRED_FONTS = [
	"Inter", "Roboto", "Manrope", "DM Sans", "Plus Jakarta Sans", "Space Grotesk",
	"Montserrat", "Poppins", "Work Sans", "IBM Plex Sans", "Rubik", "Nunito",
	"Outfit", "Sora", "Geist", "Raleway", "Open Sans", "Lato", "Playfair Display",
	"Fraunces", "Lora", "Merriweather", "Source Serif 4", "DM Serif Display",
	"Instrument Serif", "JetBrains Mono", "IBM Plex Mono",
];
let fontsCache: string[] | null = null;

// Семейства шрифтов, доступные в Figma: модель выбирает из них, а не
// угадывает (неизвестный шрифт подменяется на Inter Regular).
export async function availableFonts(limit = 40): Promise<string[]> {
	if (fontsCache) return fontsCache;
	try {
		const families = new Set(
			(await figma.listAvailableFontsAsync()).map((f) => f.fontName.family),
		);
		const first = PREFERRED_FONTS.filter((f) => families.has(f));
		const rest = [...families]
			.filter((f) => !first.includes(f) && !f.startsWith("."))
			.sort();
		fontsCache = [...first, ...rest].slice(0, limit);
	} catch {
		fontsCache = ["Inter"];
	}
	return fontsCache;
}

const STYLE_PREFIX = "style:";

export function isStyleRef(value: unknown): boolean {
	return typeof value === "string" && value.startsWith(STYLE_PREFIX);
}

// "style:Brand/Primary" -> hex стиля (undefined, если стиля нет).
export function paintStyleHex(ref: string): string | undefined {
	return paints.get(ref.slice(STYLE_PREFIX.length).trim())?.hex;
}

export function textStyleOf(name: string): TextInfo | undefined {
	return texts.get(name.trim());
}

// Привязки к стилям откладываем: async-сеттеры нельзя звать из синхронных
// applyFill, поэтому очередь выполняется одним проходом после сборки.
const pending: { node: SceneNode; styleId: string }[] = [];

export function queueFillStyle(node: BaseNode, ref: unknown): void {
	if (typeof ref !== "string" || !isStyleRef(ref)) return;
	const info = paints.get(ref.slice(STYLE_PREFIX.length).trim());
	if (info) pending.push({ node: node as SceneNode, styleId: info.id });
}

export async function flushStyleBindings(): Promise<void> {
	const items = pending.splice(0);
	for (const { node, styleId } of items) {
		if (node.removed || !("setFillStyleIdAsync" in node)) continue;
		try {
			await (node as GeometryMixin).setFillStyleIdAsync(styleId);
		} catch {
			/* привязка не удалась — остаётся обычная заливка того же цвета */
		}
	}
}

// Компоненты файла (все страницы, без бэкапов истории): модель видит, что
// уже есть, и ставит экземпляры по id вместо того, чтобы строить копии.
export type ComponentInfo = {
	id: string;
	name: string;
	page: string;
	w: number;
	h: number;
	// Для набора вариантов: свойство → допустимые значения.
	variants?: Record<string, string[]>;
	// Имена текстовых слоёв — ключи для overrides у экземпляров.
	texts: string[];
};

const MAX_COMPONENTS = 60;
const MAX_TEXTS = 12;

function underBackup(node: BaseNode): boolean {
	let n: BaseNode | null = node;
	while (n && n.type !== "PAGE" && n.type !== "DOCUMENT") {
		if (isBackup(n)) return true;
		n = n.parent;
	}
	return false;
}

function pageNameOf(node: BaseNode): string {
	let n: BaseNode | null = node;
	while (n && n.type !== "PAGE") n = n.parent;
	return n ? n.name : "";
}

// Синхронно: findAllWithCriteria работает и без загрузки всех страниц.
export function loadComponents(): ComponentInfo[] {
	const out: ComponentInfo[] = [];
	let found: (ComponentNode | ComponentSetNode)[] = [];
	try {
		found = figma.root.findAllWithCriteria({
			types: ["COMPONENT", "COMPONENT_SET"],
		});
	} catch {
		return out;
	}
	for (const c of found) {
		if (out.length >= MAX_COMPONENTS) break;
		if (c.removed || underBackup(c)) continue;
		// Вариант набора описывается самим набором.
		if (c.type === "COMPONENT" && c.parent?.type === "COMPONENT_SET") continue;
		const sample =
			c.type === "COMPONENT_SET"
				? (c.children.find((ch) => ch.type === "COMPONENT") as ComponentNode | undefined)
				: c;
		const texts = new Set<string>();
		if (sample)
			for (const t of sample.findAll((n) => n.type === "TEXT")) {
				if (texts.size >= MAX_TEXTS) break;
				texts.add(t.name);
			}
		const info: ComponentInfo = {
			id: c.id,
			name: c.name,
			page: pageNameOf(c),
			w: Math.round(c.width),
			h: Math.round(c.height),
			texts: [...texts],
		};
		if (c.type === "COMPONENT_SET") {
			info.variants = {};
			for (const [key, group] of Object.entries(c.variantGroupProperties))
				info.variants[key] = group.values;
		}
		out.push(info);
	}
	return out;
}
