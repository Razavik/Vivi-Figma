// Массовый update: список id или выборка по шаблону (match). Чистая логика
// разбора — без Figma; поиск нод выполняет edits.ts через searchIn.
export const MAX_BULK = 100;

export interface MatchSpec {
	in?: string;
	name?: string;
	text?: string;
	type?: string;
}

export type BulkPlan =
	| { kind: "none" }
	| { kind: "ids"; ids: string[] }
	| { kind: "match"; match: MatchSpec; query: string; byText: boolean }
	| { kind: "error"; error: string };

// Как разобрать update: одна нода (id), список (ids) или выборка (match).
export function bulkPlan(op: { id?: unknown; ids?: unknown; match?: unknown }): BulkPlan {
	if (Array.isArray(op.ids)) {
		const ids = [...new Set(op.ids.filter((x): x is string => typeof x === "string" && !!x))];
		if (!ids.length) return { kind: "error", error: "ids пуст" };
		return { kind: "ids", ids: ids.slice(0, MAX_BULK) };
	}
	if (op.match && typeof op.match === "object" && !Array.isArray(op.match)) {
		const m = op.match as Record<string, unknown>;
		const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
		const match: MatchSpec = { in: str(m.in), name: str(m.name), text: str(m.text), type: str(m.type)?.toUpperCase() };
		if (!match.name && !match.text && !match.type)
			return { kind: "error", error: "match: нужен хотя бы один из name, text, type" };
		return { kind: "match", match, query: match.name ?? match.text ?? "*", byText: !match.name && !!match.text };
	}
	return { kind: "none" };
}
