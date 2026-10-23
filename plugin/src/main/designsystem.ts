/// <reference types="@figma/plugin-typings" />
// Дизайн-система файла: локальные стили цвета и текста, переменные и компоненты —
// только чтение.

import { isBackup } from "./backup";


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
	try {
		for (const s of await figma.getLocalPaintStylesAsync()) {
			const solid = s.paints.find(
				(p): p is SolidPaint => p.type === "SOLID" && p.visible !== false,
			);
			if (!solid) continue;
			const hex = toHex(solid.color);
			if (ds.colors.length < 40) ds.colors.push({ name: s.name, hex });
		}
	} catch {
		/* стили недоступны */
	}
	try {
		for (const s of await figma.getLocalTextStylesAsync()) {
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
