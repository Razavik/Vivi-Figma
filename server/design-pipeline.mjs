// Подготовка спеки к отправке в плагин (плагин сети не имеет): иконки по имени →
// svg, эмодзи из текстов вычищаются, стоковые фото (query) → base64.
// Плюс проверка типов нод и размера — чтобы агент сразу получил понятную ошибку.
import { readFileSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, resolve, sep } from "node:path";
import { expandBlocks } from "./blocks.mjs";
import { expandPatternFills } from "./patterns.mjs";
import { processDesign } from "./icons.mjs";
import { resolveImages } from "./images.mjs";

const NODE_TYPES = new Set(["frame", "text", "rect", "ellipse", "line", "image", "icon", "instance", "ref", "shape", "bool"]);
const BLOCK_TYPES = new Set(["chart", "table", "avatar", "logo", "qr", "barcode", "mockup", "map"]);
// Блоки разворачиваются в обычные ноды до отправки в плагин, поэтому в проверке типов они допустимы.
export const MAX_IMAGES = 12;
export const MAX_NODES = 600;
export const MAX_SPEC_BYTES = 6 * 1024 * 1024;

// Находит ноды спеки: сам корень, children, а в операциях правок — node и tree.
function* nodesOf(value) {
	if (Array.isArray(value)) {
		for (const item of value) yield* nodesOf(item);
		return;
	}
	if (!value || typeof value !== "object") return;
	if (typeof value.type === "string") yield value;
	if (Array.isArray(value.children)) yield* nodesOf(value.children);
	if (value.node) yield* nodesOf(value.node);
	if (Array.isArray(value.tree)) yield* nodesOf(value.tree);
}

// Возвращает текст ошибки или null.
export function validateSpec(value) {
	let count = 0;
	for (const n of nodesOf(value)) {
		count++;
		if (!NODE_TYPES.has(n.type) && !BLOCK_TYPES.has(n.type)) return `неизвестный тип ноды «${n.type}». Допустимо: ${[...NODE_TYPES].join(", ")}`;
	}
	if (count > MAX_NODES) return `слишком много нод в одном вызове (${count} > ${MAX_NODES}): стройте страницу по секциям`;
	if (Buffer.byteLength(JSON.stringify(value)) > MAX_SPEC_BYTES) return "спека слишком большая (> 6 МБ) — разбейте на части";
	return null;
}

// Фрейм с auto-layout без размера должен вести себя как в вёрстке — по содержимому
// (hug), а не получать стартовые 100 px, из-за которых содержимое вылезает и
// налезает на соседей. Корню ширину не задаём: она обязана быть числом.
export function applyLayoutDefaults(value) {
	let fixed = 0;
	for (const n of nodesOf(value)) {
		if (n.type !== "frame" || (n.layout !== "vertical" && n.layout !== "horizontal")) continue;
		if (n.h === undefined) {
			n.h = "hug";
			fixed++;
		}
		if (n.w === undefined && n !== value) {
			n.w = "hug";
			fixed++;
		}
	}
	return fixed;
}

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
const MAX_FILE_BYTES = 8 * 1024 * 1024;

// image/icon с path: файл из проекта агента (корни — как у экспорта) → data/svg.
// Относительные пути считаются от первого корня. Вне корней читать нельзя.
export function resolveLocalFiles(value, roots) {
	const notes = [];
	let loaded = 0;
	const realRoots = (roots || []).map((r) => {
		try {
			return realpathSync(r);
		} catch {
			return resolve(r);
		}
	});
	for (const n of nodesOf(value)) {
		if ((n.type !== "image" && n.type !== "icon") || typeof n.path !== "string" || !n.path.trim()) continue;
		const raw = n.path.trim();
		delete n.path;
		try {
			if (!realRoots.length) throw new Error("не определён корень проекта");
			const full = realpathSync(isAbsolute(raw) ? raw : resolve(realRoots[0], raw));
			if (!realRoots.some((r) => full === r || full.startsWith(r + sep))) throw new Error("файл вне проекта");
			const ext = extname(full).toLowerCase();
			if (statSync(full).size > MAX_FILE_BYTES) throw new Error("файл больше 8 МБ");
			if (n.type === "icon") {
				if (ext !== ".svg") throw new Error("для icon.path нужен .svg");
				n.svg = readFileSync(full, "utf-8");
				delete n.icon;
			} else {
				if (ext === ".svg") throw new Error('для SVG используйте {"type":"icon","path":"…svg","w":…,"h":…}');
				if (!MIME[ext]) throw new Error("поддерживаются png, jpg, webp, gif");
				n.data = readFileSync(full).toString("base64");
				n.mime = MIME[ext];
				delete n.query;
			}
			loaded++;
		} catch (err) {
			notes.push(`path «${raw}»: ${String(err?.message || err)}`);
		}
	}
	return { loaded, notes };
}

// Мутирует value, возвращает отчёт для агента.
export async function prepareDesign(value, { env = process.env, roots } = {}) {
	// Блоки (chart/table/qr/…) → обычные ноды, затем текстуры, файлы проекта, иконки, фото.
	const blocks = expandBlocks(value);
	expandPatternFills(value);
	const local = resolveLocalFiles(value, roots);
	const icons = processDesign(value);
	const images = await resolveImages(value, undefined, { max: MAX_IMAGES, enabled: env.MCP_NO_IMAGES !== "1" });
	const notes = [...local.notes];
	if (icons.unresolved.length) notes.push(`иконки не найдены (будут пустыми): ${icons.unresolved.join(", ")} — подберите имена через figma_icons`);
	if (icons.emojiStripped) notes.push(`эмодзи удалены из текстов (${icons.emojiStripped}): используйте иконки`);
	for (const f of images.failed) notes.push(f);
	for (const k of blocks.failed) notes.push(`блок «${k}» не собрался — проверьте поля (figma_schema/figma_guide)`);
	for (const w of blocks.warnings) notes.push(w);
	const total = validateSpec(value);
	if (total && /слишком/.test(total)) throw new Error(total);
	return { icons: icons.icons, images: images.resolved, files: local.loaded, blocks: blocks.count, notes };
}
