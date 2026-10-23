// Правки экземпляров: вид и состав меняются в ГЛАВНОМ компоненте (тогда все
// копии следуют за ним), а локально остаются только содержимое и размещение
// конкретного экземпляра. Модуль не зависит от Figma — проверяется на фейках.

export interface TNode {
	id: string;
	type: string;
	parent?: TNode | null;
	children?: readonly TNode[];
	removed?: boolean;
	// Компонент из внешней библиотеки: править его нельзя.
	remote?: boolean;
	getMainComponentAsync?: () => Promise<TNode | null>;
}

// Поля update, которые меняют вид компонента. У самого экземпляра на месте
// остаются размещение (w/h/x/y/position…) и содержимое; у слоя ВНУТРИ экземпляра
// локально только содержимое (STYLE_KEYS не нужны — туда уходит всё остальное).
export const STYLE_KEYS = new Set([
	"fill",
	"stroke",
	"strokeWidth",
	"strokeSides",
	"strokeAlign",
	"dash",
	"radius",
	"shadow",
	"layerBlur",
	"backgroundBlur",
	"layout",
	"gap",
	"padding",
	"align",
	"cross",
	"clip",
	"minW",
	"maxW",
	"fontSize",
	"fontWeight",
	"fontFamily",
	"lineHeight",
	"letterSpacing",
	"textCase",
	"textDecoration",
	"maxLines",
	"color",
	"textStyle",
	"spans",
	"fit",
	"overlay",
]);

// Содержимое конкретного экземпляра: у каждой копии своё.
export const CONTENT_KEYS = new Set(["text", "variants", "query", "data", "photo"]);

const SKIP_KEYS = new Set(["op", "id", "as", "local"]);

// Делит update на локальную часть (остаётся на ноде) и часть для главного
// компонента. selfInstance: нода сама экземпляр (размещение — локально) или
// слой внутри него (локально только содержимое, остальное — в компонент).
export function splitUpdate(
	op: Record<string, unknown>,
	selfInstance: boolean,
): { local: Record<string, unknown>; main: Record<string, unknown> } {
	const local: Record<string, unknown> = {};
	const main: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(op)) {
		if (SKIP_KEYS.has(k)) continue;
		const toMain = selfInstance
			? STYLE_KEYS.has(k)
			: !CONTENT_KEYS.has(k);
		(toMain ? main : local)[k] = v;
	}
	return { local, main };
}

function instanceAncestor(node: TNode): TNode | null {
	let p = node.parent || null;
	while (p && p.type !== "PAGE" && p.type !== "DOCUMENT") {
		if (p.type === "INSTANCE") return p;
		p = p.parent || null;
	}
	return null;
}

function indexPath(from: TNode, to: TNode): number[] | null {
	const path: number[] = [];
	let cur: TNode | null | undefined = to;
	while (cur && cur !== from) {
		const parent: TNode | null | undefined = cur.parent;
		if (!parent?.children) return null;
		path.unshift(parent.children.indexOf(cur));
		cur = parent;
	}
	return cur === from && path.every((i) => i >= 0) ? path : null;
}

export interface MainTarget {
	node: TNode;
	// Нода оказалась экземпляром/слоем экземпляра и заменена на оригинал.
	redirected: boolean;
	// Это сам экземпляр (а не слой внутри).
	selfInstance: boolean;
	// Оригинал недоступен (библиотека, удалён) — правим как есть.
	unavailable?: string;
}

async function mainOf(inst: TNode): Promise<TNode | null> {
	try {
		const main = (await inst.getMainComponentAsync?.()) || null;
		return main && !main.removed ? main : null;
	} catch {
		return null;
	}
}

// Куда на самом деле применять правку вида/состава. Сам экземпляр → его главный
// компонент; слой внутри экземпляра → тот же слой в главном компоненте (цепочки
// вложенных экземпляров проходим до оригинала).
export async function toMain(node: TNode): Promise<MainTarget> {
	const selfInstance = node.type === "INSTANCE";
	let cur = node;
	let redirected = false;
	if (selfInstance) {
		const main = await mainOf(cur);
		if (!main) return { node, redirected: false, selfInstance, unavailable: "компонент недоступен" };
		if (main.remote)
			return { node, redirected: false, selfInstance, unavailable: "компонент из внешней библиотеки" };
		cur = main;
		redirected = true;
	}
	for (let hop = 0; hop < 6; hop++) {
		const inst = instanceAncestor(cur);
		if (!inst) break;
		const main = await mainOf(inst);
		if (!main) return { node, redirected: false, selfInstance, unavailable: "компонент недоступен" };
		if (main.remote)
			return { node, redirected: false, selfInstance, unavailable: "компонент из внешней библиотеки" };
		const path = indexPath(inst, cur);
		if (!path) return { node, redirected: false, selfInstance, unavailable: "слой не найден в компоненте" };
		let target: TNode | undefined = main;
		for (const i of path) target = target?.children?.[i];
		if (!target) return { node, redirected: false, selfInstance, unavailable: "слой не найден в компоненте" };
		cur = target;
		redirected = true;
	}
	return { node: cur, redirected, selfInstance };
}
