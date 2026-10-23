// Что считать контекстом запроса: прошлый собранный дизайн чата (previousSpec)
// или выделение на холсте. Если пользователь выделил ДРУГОЙ блок, прежний
// дизайн из чата в запрос не кладём — иначе «меняй этот JSON» перетягивает
// модель на старый макет, и выделение будто не замечается.
type Spec = { id?: unknown; children?: Spec[]; mainComponentTree?: Spec };

function idsOf(node: Spec | Spec[] | null | undefined, out = new Set<string>()): Set<string> {
	if (!node) return out;
	if (Array.isArray(node)) {
		for (const n of node) idsOf(n, out);
		return out;
	}
	if (typeof node.id === "string") out.add(node.id);
	for (const c of node.children ?? []) idsOf(c, out);
	return out;
}

// Связано ли выделение с прошлым дизайном: есть общие ноды в любую сторону.
export function selectionTouches(selection: unknown, last: unknown): boolean {
	const a = idsOf(selection as Spec[]);
	const b = idsOf(last as Spec);
	for (const id of a) if (b.has(id)) return true;
	return false;
}

// previousSpec для запроса: прошлый дизайн — если нет выделения или оно его касается.
export function priorSpecFor<T>(last: T | null, selection: unknown): T | undefined {
	if (!last) return undefined;
	if (!Array.isArray(selection) || !selection.length) return last;
	return selectionTouches(selection, last) ? last : undefined;
}
