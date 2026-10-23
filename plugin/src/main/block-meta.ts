// Блоки (chart/table/avatar/…), которые сервер разворачивает в слои: их
// исходная спека лежит в pluginData("meta"), модель получает её обратно
// вместо слоёв. Чистая логика — проверяется тестами без Figma.
export const BLOCK_KINDS = ["chart", "table", "avatar", "logo", "qr", "barcode", "mockup", "map", "shape", "bool"];

// raw — pluginData("meta"); null — это не блок (или meta битая).
export function blockSpecFromMeta(
	raw: string,
	id: string,
	name: string,
): Record<string, unknown> | null {
	if (!raw) return null;
	try {
		const meta = JSON.parse(raw) as Record<string, unknown>;
		const kind = BLOCK_KINDS.find((k) => meta[k] && typeof meta[k] === "object");
		if (!kind) return null;
		return { ...(meta[kind] as Record<string, unknown>), type: kind, name, id };
	} catch {
		return null;
	}
}

// Заливка-паттерн, сохранённая в pluginData("patternFill") → снова fill спеки.
export function patternFillFromData(raw: string): Record<string, unknown> | null {
	if (!raw) return null;
	try {
		const v = JSON.parse(raw) as Record<string, unknown>;
		return typeof v.pattern === "string" ? v : null;
	} catch {
		return null;
	}
}
