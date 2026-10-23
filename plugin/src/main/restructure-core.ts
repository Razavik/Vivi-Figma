// Операция restructure: целевое дерево из существующих нод (только id) и новых
// контейнеров (с type). Чистая логика разбора и проверок — без Figma.
export interface PlanNode {
	/** id существующей ноды — переносится как есть. */
	id?: string;
	/** Поля update для существующей ноды (кроме id/children). */
	fields?: Record<string, unknown>;
	/** Спека нового контейнера (без children). */
	spec?: Record<string, unknown>;
	children: PlanNode[];
}

export const MAX_PLAN_NODES = 200;
export const MAX_PLAN_DEPTH = 8;

export function planTree(tree: unknown): { plan: PlanNode[]; ids: string[]; errors: string[] } {
	const ids: string[] = [];
	const errors: string[] = [];
	let count = 0;
	const walk = (list: unknown, depth: number): PlanNode[] => {
		if (!Array.isArray(list)) return [];
		const out: PlanNode[] = [];
		for (const raw of list) {
			if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
				errors.push("элемент дерева должен быть объектом");
				continue;
			}
			if (++count > MAX_PLAN_NODES) {
				errors.push(`больше ${MAX_PLAN_NODES} узлов`);
				return out;
			}
			if (depth > MAX_PLAN_DEPTH) {
				errors.push(`вложенность глубже ${MAX_PLAN_DEPTH}`);
				return out;
			}
			const { children, ...rest } = raw as Record<string, unknown>;
			if (typeof rest.type === "string") {
				const { id: _ignored, ...spec } = rest;
				out.push({ spec, children: walk(children, depth + 1) });
			} else if (typeof rest.id === "string" && rest.id) {
				if (children !== undefined)
					errors.push(`${rest.id}: у существующей ноды нельзя задавать children — опишите контейнер с type`);
				if (ids.includes(rest.id)) errors.push(`${rest.id}: id встречается дважды`);
				ids.push(rest.id);
				const { id, ...fields } = rest;
				out.push({ id, fields, children: [] });
			} else {
				errors.push("у элемента нет ни id, ни type");
			}
		}
		return out;
	};
	const plan = walk(tree, 0);
	return { plan, ids, errors };
}

// Минимальное описание ноды для проверок положения (без Figma).
export interface NodeLike {
	id: string;
	type: string;
	parent: NodeLike | null;
}

// Причина, по которой перенос невозможен; null — можно.
export function moveProblem(node: NodeLike, parent: NodeLike, moving: Set<string>): string | null {
	if (node.id === parent.id) return `${node.id}: нода и есть родитель`;
	let inside = false;
	for (let p = node.parent; p; p = p.parent) {
		if (p.id === parent.id) {
			inside = true;
			break;
		}
		if (p.type === "INSTANCE") return `${node.id}: слой внутри экземпляра — правьте главный компонент`;
	}
	if (!inside) return `${node.id}: не лежит внутри родителя ${parent.id}`;
	for (let p: NodeLike | null = parent; p; p = p.parent) {
		if (p.type === "INSTANCE") return `родитель ${parent.id} — экземпляр или лежит в нём`;
		if (moving.has(p.id)) return `родитель ${parent.id} лежит внутри переносимой ноды ${p.id}`;
	}
	return null;
}
