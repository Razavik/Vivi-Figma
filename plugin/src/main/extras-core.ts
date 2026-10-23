// Чистые части инструментов Figma (паттерны, аннотации) — без обращения к Figma API.

// ── Паттерны ───────────────────────────────────────────────────────────────
// Плитку svg размножаем в один svg нужного размера — запасной путь, если
// PATTERN-заливка недоступна. Не больше maxCells плиток.
export function tiledSvg(tile: string, side: number, w: number, h: number, maxCells = 2500): string {
	const body = tile.replace(/^[\s\S]*?<svg[^>]*>/i, "").replace(/<\/svg>\s*$/i, "");
	const cols = Math.ceil(w / side);
	const rows = Math.ceil(h / side);
	const parts: string[] = [];
	for (let r = 0; r < rows && parts.length < maxCells; r++)
		for (let c = 0; c < cols && parts.length < maxCells; c++)
			parts.push(`<g transform="translate(${c * side} ${r * side})">${body}</g>`);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">${parts.join("")}</svg>`;
}

// ── Аннотации ──────────────────────────────────────────────────────────────
export const VIVI_REVIEW = "Vivi review";

// Аннотации ноды с учётом чужих: добавляем свои, не затирая остальные.
export type AnnotationLike = { label?: string; labelMarkdown?: string; categoryId?: string; properties?: unknown };

export function addAnnotation<T extends AnnotationLike>(existing: readonly T[], extra: T): T[] {
	const dup = existing.some(
		(a) => a.categoryId === extra.categoryId && (a.label ?? a.labelMarkdown) === (extra.label ?? extra.labelMarkdown),
	);
	return dup ? [...existing] : [...existing, extra];
}

// Убрать только аннотации своей категории.
export function withoutCategory<T extends AnnotationLike>(existing: readonly T[], categoryId: string): T[] {
	return existing.filter((a) => a.categoryId !== categoryId);
}
