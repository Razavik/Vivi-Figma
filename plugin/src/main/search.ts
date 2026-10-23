// Поиск нод для агента: по имени и по тексту, в пределах страницы или одного
// фрейма, с фильтром по типу. Чистая функция над деревом нод — проверяется
// тестами без Figma.

export const SEARCH_DEFAULT_LIMIT = 100;
export const SEARCH_MAX_LIMIT = 100;

export interface SearchNode {
	id: string;
	name: string;
	type: string;
	visible?: boolean;
	characters?: string;
	width?: number;
	height?: number;
	x?: number;
	y?: number;
	parent?: SearchNode | null;
	findAll?: (cb: (n: SearchNode) => boolean) => SearchNode[];
}

export interface SearchOptions {
	// Подстрока (без учёта регистра); "*" — любая нода (с фильтром по типу).
	query: string;
	// Искать ещё и в содержимом текстовых слоёв.
	text?: boolean;
	// Только этот тип: TEXT, FRAME, COMPONENT, INSTANCE, RECTANGLE…
	type?: string;
	limit?: number;
	// Пропустить первые N совпадений — следующая страница большого результата.
	offset?: number;
}

export interface SearchResult {
	results: Record<string, unknown>[];
	total: number;
	truncated: boolean;
}

export function clampLimit(limit: unknown): number {
	const n = typeof limit === "number" ? Math.round(limit) : SEARCH_DEFAULT_LIMIT;
	return Math.max(1, Math.min(SEARCH_MAX_LIMIT, n || SEARCH_DEFAULT_LIMIT));
}

export function searchIn(root: SearchNode, opts: SearchOptions): SearchResult {
	const q = opts.query.trim().toLowerCase();
	const type = opts.type?.trim().toUpperCase();
	const limit = clampLimit(opts.limit);
	const offset = Math.max(0, Math.round(opts.offset || 0));
	if (!q || !root.findAll) return { results: [], total: 0, truncated: false };
	const any = q === "*";
	const matches = root.findAll((n) => {
		if (n.visible === false) return false;
		if (type && n.type !== type) return false;
		if (any) return true;
		if (n.name.toLowerCase().includes(q)) return true;
		return !!opts.text && n.type === "TEXT" && (n.characters || "").toLowerCase().includes(q);
	});
	const results = matches.slice(offset, offset + limit).map((n) => {
		const entry: Record<string, unknown> = { id: n.id, name: n.name, type: n.type };
		if (typeof n.width === "number") {
			entry.w = Math.round(n.width);
			entry.h = Math.round(n.height || 0);
			entry.x = Math.round(n.x || 0);
			entry.y = Math.round(n.y || 0);
		}
		// Текст слоя — чтобы выбрать нужный из нескольких «Title».
		if (n.type === "TEXT" && n.characters) entry.text = n.characters.slice(0, 80);
		if (n.parent && n.parent.type !== "PAGE") {
			entry.parent = n.parent.name;
			entry.parentId = n.parent.id;
		}
		return entry;
	});
	return { results, total: matches.length, truncated: matches.length > offset + limit };
}
