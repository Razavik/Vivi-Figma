// Разворот высокоуровневых блоков в обычные ноды спеки: chart, table, avatar,
// logo, qr, barcode, mockup, map. Идёт по всему дереву, в том числе по
// insert-узлам правок; update с полями блока (chart:{...}) становится
// rebuild — плагин пересоберёт ноду на том же месте. Исходная спека блока
// остаётся в meta корня, чтобы модель меняла данные, а не слои.
import { expandChart } from "./charts.mjs";
import { expandTable } from "./tables.mjs";
import { expandAvatar, expandBarcode, expandLogo, expandQr } from "./generated.mjs";
import { expandMockup } from "./mockups.mjs";
import { expandMap } from "./maps.mjs";

export const EXPAND = {
	chart: expandChart,
	table: expandTable,
	avatar: expandAvatar,
	logo: expandLogo,
	qr: expandQr,
	barcode: expandBarcode,
	mockup: expandMockup,
	map: expandMap,
};
export const BLOCK_KINDS = Object.keys(EXPAND);

export function expandBlocks(value) {
	const report = { count: 0, charts: 0, tables: 0, failed: [], warnings: [] };
	const tally = (kind) => {
		report.count++;
		if (kind === "chart") report.charts++;
		if (kind === "table") report.tables++;
	};

	const build = (kind, spec) => {
		const built = EXPAND[kind](spec, report);
		if (!built) return null;
		// Служебные поля (_osm с тайлами и т.п.) в meta не пишем: pluginData ограничен по размеру.
		const clean = Object.fromEntries(Object.entries(spec).filter(([k]) => !k.startsWith("_")));
		built.meta = { ...(built.meta || {}), [kind]: clean };
		tally(kind);
		return built;
	};

	// Нода → её развёрнутая замена или null, если заменять нечего.
	const replace = (node) => {
		if (!node || typeof node !== "object" || Array.isArray(node)) return null;
		if (node.op === "update" && typeof node.id === "string") {
			const kind = BLOCK_KINDS.find((k) => node[k] && typeof node[k] === "object");
			if (!kind) return null;
			const built = build(kind, { ...node[kind], type: kind });
			if (!built) {
				report.failed.push(kind);
				return null;
			}
			return { op: "rebuild", id: node.id, node: built };
		}
		if (!EXPAND[node.type]) return null;
		const built = build(node.type, node);
		if (!built) {
			report.failed.push(node.type);
			return { type: "frame", name: node.name || node.type, w: node.w, h: node.h };
		}
		return built;
	};

	const visit = (node) => {
		if (!node || typeof node !== "object") return;
		for (const [key, child] of Object.entries(node)) {
			if (key === "meta" || !child || typeof child !== "object") continue;
			if (Array.isArray(child)) {
				child.forEach((item, i) => {
					const out = replace(item);
					if (out) child[i] = out;
					visit(child[i]);
				});
			} else {
				const out = replace(child);
				if (out) node[key] = out;
				visit(node[key]);
			}
		}
	};

	const root = replace(value);
	if (root) {
		for (const k of Object.keys(value)) delete value[k];
		Object.assign(value, root);
	}
	visit(value);
	return report;
}
