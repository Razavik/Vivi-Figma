// Подготовка спеки к отправке в плагин (плагин сети не имеет): иконки по имени →
// svg, эмодзи из текстов вычищаются, стоковые фото (query) → base64.
// Плюс проверка типов нод и размера — чтобы агент сразу получил понятную ошибку.
import { processDesign } from "./icons.mjs";
import { resolveImages } from "./images.mjs";

const NODE_TYPES = new Set(["frame", "text", "rect", "ellipse", "line", "image", "icon", "instance", "ref", "shape", "bool"]);
const BLOCK_TYPES = new Set(["chart", "table", "avatar", "logo", "qr", "barcode", "mockup", "map"]);
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
		if (BLOCK_TYPES.has(n.type))
			return `тип «${n.type}» пока не поддерживается: соберите его из frame/text/rect/shape (диаграммы, таблицы, QR — в одном из следующих выпусков)`;
		if (!NODE_TYPES.has(n.type)) return `неизвестный тип ноды «${n.type}». Допустимо: ${[...NODE_TYPES].join(", ")}`;
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

// Мутирует value, возвращает отчёт для агента.
export async function prepareDesign(value, { env = process.env } = {}) {
	const icons = processDesign(value);
	const images = await resolveImages(value, undefined, { max: MAX_IMAGES, enabled: env.MCP_NO_IMAGES !== "1" });
	const notes = [];
	if (icons.unresolved.length) notes.push(`иконки не найдены (будут пустыми): ${icons.unresolved.join(", ")} — подберите имена через figma_icons`);
	if (icons.emojiStripped) notes.push(`эмодзи удалены из текстов (${icons.emojiStripped}): используйте иконки`);
	for (const f of images.failed) notes.push(f);
	return { icons: icons.icons, images: images.resolved, notes };
}
