// Объективные проверки макета после сборки: то, что модель легко пропускает
// на скриншоте. Только чтение нод — канвас не меняется. Работает с любыми
// объектами нужной формы (в тестах — с простыми объектами вместо нод Figma).

import { contentIssues, langOf, type TextItem } from "./content-lint";

export type Issue = { id: string; name: string; kind: string; detail: string };

const MAX_ISSUES = 40;

type Box = { x: number; y: number; width: number; height: number };
type RGB = { r: number; g: number; b: number };
type Paint = { type: string; visible?: boolean; color?: RGB; opacity?: number };

// Минимальная форма ноды, которую читает lint.
export type LintNode = {
	id: string;
	name: string;
	type: string;
	visible?: boolean;
	parent?: LintNode | null;
	children?: readonly LintNode[];
	absoluteBoundingBox?: Box | null;
	width?: number;
	height?: number;
	fills?: readonly Paint[] | symbol;
	fontSize?: number | symbol;
	fontName?: { family: string; style: string } | symbol;
	layoutMode?: string;
	itemSpacing?: number;
	paddingTop?: number;
	paddingRight?: number;
	paddingBottom?: number;
	paddingLeft?: number;
	getPluginData?: (key: string) => string;
	characters?: string;
};

const NUMERIC = /^[+\-−]?\s?[\d\s.,]+\s?(%|₽|\$|€|руб\.?|K|M)?$/;

// Проверки блоков chart/table по исходной спеке из pluginData("meta").
const BAD_COMPONENT_NAME = /[^\p{L}\p{N}/_=,.\- ]|\s{2,}|^\s|\s$/u;

// Набор иконки из meta ("lucide" | "ph" | "tabler") — для проверки «один набор».
export function iconSetOf(raw: string | undefined): string {
	if (!raw) return "";
	try {
		const v = (JSON.parse(raw) as { iconSet?: unknown }).iconSet;
		return typeof v === "string" ? v : "";
	} catch {
		return "";
	}
}

export function blockIssues(raw: string | undefined): [string, string][] {
	if (!raw) return [];
	let meta: { chart?: Record<string, any>; table?: Record<string, any> };
	try {
		meta = JSON.parse(raw);
	} catch {
		return [];
	}
	const out: [string, string][] = [];
	const chart = meta.chart;
	if (chart) {
		const kind = chart.kind ?? "bar";
		const data: { values?: unknown[] }[] = Array.isArray(chart.data)
			? chart.data
			: [];
		const named = (Array.isArray(chart.series) ? chart.series : []).filter(
			(s: { name?: string }) => s?.name,
		).length;
		const multi = data.some((d) => (d.values?.length ?? 0) > 1);
		if (multi && named < 2)
			out.push(["chart-legend", "несколько серий без названий — нет легенды"]);
		if (
			["bar", "line", "area"].includes(kind) &&
			chart.axis === false &&
			chart.values !== true &&
			!chart.title
		)
			out.push([
				"chart-unlabeled",
				"график без осей, подписей значений и заголовка — не прочитать",
			]);
	}
	const table = meta.table;
	if (table && Array.isArray(table.columns) && Array.isArray(table.rows))
		table.columns.forEach((c: { title?: string; align?: string }, i: number) => {
			const cells = table.rows
				.map((r: unknown[]) => String(r?.[i] ?? "").trim())
				.filter(Boolean);
			if (
				c?.align &&
				c.align !== "right" &&
				cells.length &&
				cells.every((v: string) => NUMERIC.test(v))
			)
				out.push([
					"table-align",
					`числовая колонка «${c.title ?? i + 1}» выровнена не вправо`,
				]);
		});
	return out;
}

// Относительная яркость по WCAG.
function luminance(c: RGB): number {
	const ch = (v: number) =>
		v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

// Контраст двух непрозрачных цветов (1…21).
export function contrast(a: RGB, b: RGB): number {
	const la = luminance(a);
	const lb = luminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Наложение полупрозрачного цвета на фон.
function blend(fg: RGB, alpha: number, bg: RGB): RGB {
	return {
		r: fg.r * alpha + bg.r * (1 - alpha),
		g: fg.g * alpha + bg.g * (1 - alpha),
		b: fg.b * alpha + bg.b * (1 - alpha),
	};
}

function solidOf(n: LintNode): { color: RGB; alpha: number } | null {
	if (!Array.isArray(n.fills)) return null;
	const p = (n.fills as readonly Paint[]).find(
		(f) => f.type === "SOLID" && f.visible !== false && f.color,
	);
	return p && p.color ? { color: p.color, alpha: p.opacity ?? 1 } : null;
}

// Фон под нодой: первая сплошная заливка у предков, иначе белая страница.
// null — ближайший фон градиент или фото: контраст по одному цвету не измерить.
function backgroundOf(n: LintNode): RGB | null {
	for (let p = n.parent; p; p = p.parent) {
		const paints = Array.isArray(p.fills) ? (p.fills as readonly Paint[]).filter((f) => f.visible !== false) : [];
		if (paints.some((f) => f.type === "IMAGE" || f.type.startsWith("GRADIENT"))) return null;
		const s = solidOf(p);
		if (s && s.alpha > 0.5) return s.color;
	}
	return { r: 1, g: 1, b: 1 };
}

function isBold(n: LintNode): boolean {
	const font = n.fontName;
	return (
		typeof font === "object" &&
		font !== null &&
		/bold|black|heavy|semi/i.test((font as { style: string }).style)
	);
}

// Насколько бокс ребёнка выходит за бокс родителя (0 — не выходит).
export function overflowPx(child: Box, parent: Box): number {
	return Math.max(
		parent.x - child.x,
		parent.y - child.y,
		child.x + child.width - (parent.x + parent.width),
		child.y + child.height - (parent.y + parent.height),
		0,
	);
}

// «Подпись» поддерева для поиска повторов без компонентов.
function signature(n: LintNode): string {
	const kids = n.children || [];
	return `${n.type}:${kids.length}:${kids.map((c) => c.type).join(",")}`;
}

const DEFAULT_NAME =
	/^(Frame|Rectangle|Ellipse|Group|Text|Vector|Line|Polygon|Star) \d+$/;

// Язык запроса текущего прогона (по алфавиту) — для проверки текстов.
let requestLang: "ru" | "en" | "" = "";
export function setRequestLang(prompt: string): void {
	requestLang = langOf(prompt);
}

const BUTTON_NAME = /button|btn|кнопк|cta/i;

export function lint(root: LintNode): Issue[] {
	const out: Issue[] = [];
	const mobile = typeof root.width === "number" && root.width <= 430;
	const texts: TextItem[] = [];
	const iconSets = new Set<string>();
	walk(root, out, mobile, true, texts, iconSets);
	if (iconSets.size > 1)
		out.push({
			id: root.id,
			name: root.name,
			kind: "icon-sets",
			detail: `иконки из разных наборов (${[...iconSets].join(", ")}) — оставь один набор`,
		});
	// Тексты проверяем в сумме по макету; общий потолок замечаний сохраняем.
	return [...out, ...contentIssues(texts, requestLang)].slice(0, MAX_ISSUES);
}

function walk(
	n: LintNode,
	out: Issue[],
	mobile: boolean,
	isRoot: boolean,
	texts: TextItem[],
	iconSets: Set<string>,
): void {
	if (out.length >= MAX_ISSUES || n.visible === false) return;
	const add = (kind: string, detail: string) =>
		out.push({ id: n.id, name: n.name, kind, detail });
	const parent = isRoot ? null : n.parent;

	// Вылезает за родителя. Во фрейме без auto-layout декоративные фигуры
	// могут выходить намеренно — там проверяем только тексты.
	if (parent && n.absoluteBoundingBox && parent.absoluteBoundingBox) {
		const auto = parent.layoutMode && parent.layoutMode !== "NONE";
		if (auto || n.type === "TEXT") {
			const px = overflowPx(n.absoluteBoundingBox, parent.absoluteBoundingBox);
			if (px > 1)
				add("overflow", `выходит за «${parent.name}» на ${Math.round(px)}px`);
		}
	}

	if (n.type === "TEXT" && typeof n.characters === "string") {
		let button = false;
		let p: LintNode | null | undefined = n;
		for (let d = 0; p && d < 3; d++, p = p.parent)
			if (BUTTON_NAME.test(p.name)) button = true;
		texts.push({ id: n.id, name: n.name, text: n.characters, button });
	}

	if (n.type === "TEXT") {
		const size = typeof n.fontSize === "number" ? n.fontSize : 0;
		if (size && size < 12) add("small-text", `кегль ${size}px меньше 12`);
		const fg = solidOf(n);
		if (fg) {
			const bg = backgroundOf(n);
			if (bg) {
				const ratio = contrast(blend(fg.color, fg.alpha, bg), bg);
				const large = size >= 24 || (size >= 18.66 && isBold(n));
				const need = large ? 3 : 4.5;
				if (ratio < need)
					add("contrast", `контраст ${ratio.toFixed(2)}:1, нужно не меньше ${need}:1`);
			}
		}
	}

	if (n.layoutMode && n.layoutMode !== "NONE") {
		const vals = [
			n.itemSpacing,
			n.paddingTop,
			n.paddingRight,
			n.paddingBottom,
			n.paddingLeft,
		].filter((v): v is number => typeof v === "number");
		// Шкала 4/8: мелкие значения допускаем чётными (2, 6, 10), крупные — кратными 4
		const bad = vals.filter((v) => (v > 12 ? v % 4 !== 0 : v % 2 !== 0));
		if (bad.length)
			add("off-grid", `отступы вне шкалы 4/8: ${[...new Set(bad)].join(", ")}`);
	}

	if (DEFAULT_NAME.test(n.name)) add("default-name", "дефолтное имя слоя");

	// Фото не подставилось (серая заглушка с подписью) — это объективно пустое место.
	if (n.getPluginData?.("placeholder"))
		add(
			"placeholder-image",
			"серая заглушка вместо фото — замени update-ом с точным \"query\"",
		);

	const metaRaw = n.getPluginData?.("meta");
	for (const [kind, detail] of blockIssues(metaRaw)) add(kind, detail);
	const set = iconSetOf(metaRaw);
	if (set) iconSets.add(set);
	// Имя компонента уходит в код: без лишних пробелов и спецсимволов.
	if ((n.type === "COMPONENT" || n.type === "COMPONENT_SET") && BAD_COMPONENT_NAME.test(n.name))
		add("component-name", "в имени компонента лишние пробелы или спецсимволы — имя уходит в код");

	if (
		mobile &&
		/button|btn|кнопк/i.test(n.name) &&
		typeof n.height === "number" &&
		n.height < 44
	)
		add("tap-target", `высота ${Math.round(n.height)}px меньше 44 для касания`);

	// Внутрь экземпляров не заходим: их содержимое правится в компоненте.
	if (!n.children || n.type === "INSTANCE") return;

	// Повторы без компонентов: 3+ одинаковых по структуре соседних фрейма.
	const groups = new Map<string, LintNode[]>();
	for (const c of n.children) {
		if (c.type !== "FRAME" || !(c.children || []).length) continue;
		const key = signature(c);
		groups.set(key, [...(groups.get(key) || []), c]);
	}
	for (const same of groups.values()) {
		if (same.length >= 3 && out.length < MAX_ISSUES)
			out.push({
				id: same[0].id,
				name: same[0].name,
				kind: "repeat",
				detail: `${same.length} одинаковых блока в «${n.name}» без компонента — сделайте компонент и экземпляры`,
			});
	}

	for (const c of n.children) walk(c, out, mobile, false, texts, iconSets);
}
