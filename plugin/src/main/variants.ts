/// <reference types="@figma/plugin-typings" />
// Наборы вариантов и прототипные связи компонентов. Общий код для builder
// и edits — вынесен в отдельный модуль, чтобы они не импортировали друг
// друга (циклическая зависимость).

// Имя варианта вида "State=Default, Size=Medium" → {State:"Default",…}.
// null — формат нарушен (нет "=", пустой ключ/значение, ключ повторяется).
export function parseVariantName(name: string): Record<string, string> | null {
	const props: Record<string, string> = {};
	for (const part of name.split(",")) {
		const eq = part.indexOf("=");
		if (eq <= 0) return null;
		const key = part.slice(0, eq).trim();
		const value = part.slice(eq + 1).trim();
		if (!key || !value) return null;
		// Свойство уже было — дубликат ключа. Проверяем own-свойство:
		// "toString"/"constructor" — законные имена свойств варианта.
		if (Object.prototype.hasOwnProperty.call(props, key)) return null;
		// "__proto__" присваиванием менял бы прототип — defineProperty
		// создаёт его обычным enumerable-свойством.
		if (key === "__proto__")
			Object.defineProperty(props, key, {
				value,
				writable: true,
				enumerable: true,
				configurable: true,
			});
		else props[key] = value;
	}
	return Object.keys(props).length ? props : null;
}

// Проверка имён компонентов перед combineAsVariants: все имена — пары
// «Свойство=Значение», наборы ключей одинаковые, комбинации уникальны.
// null — всё корректно, иначе текст ошибки.
export function combineNameError(names: string[]): string | null {
	let keySig: string | null = null;
	let keyList: string[] = [];
	const seen = new Set<string>();
	for (const name of names) {
		const props = parseVariantName(name);
		if (!props) return `имя «${name}» не вида «Свойство=Значение, …»`;
		const ks = Object.keys(props).sort();
		// JSON.stringify, а не join — иначе разные разбиения строк
		// дают коллизии ("a"+"bc" === "ab"+"c").
		const sig = JSON.stringify(ks);
		if (keySig === null) {
			keySig = sig;
			keyList = ks;
		} else if (sig !== keySig)
			return `у «${name}» другой набор свойств (нужны: ${keyList.join(", ")})`;
		const combo = JSON.stringify(ks.map((k) => [k, props[k]]));
		if (seen.has(combo))
			return `комбинация свойств «${name}» уже занята другим вариантом`;
		seen.add(combo);
	}
	return null;
}

// Выбор варианта. properties === undefined — вариант по умолчанию
// (defaultVariant набора / сам компонент вне набора). Задан — ищем в наборе
// COMPONENT, у которого variantProperties совпадают по всем указанным
// свойствам; совпало несколько — детерминированно defaultVariant, если он
// подходит, иначе первый по порядку. Ошибки — throw, без тихих дефолтов.
export function selectVariant(
	source: ComponentNode | ComponentSetNode,
	properties: unknown,
): ComponentNode {
	// Без properties — сам компонент (это может быть конкретный вариант
	// по его id!) или defaultVariant, когда source — набор.
	if (properties === undefined)
		return source.type === "COMPONENT" ? source : source.defaultVariant;
	const set =
		source.type === "COMPONENT_SET"
			? source
			: source.parent && source.parent.type === "COMPONENT_SET"
				? (source.parent as ComponentSetNode)
				: null;
	if (
		!properties ||
		typeof properties !== "object" ||
		Array.isArray(properties)
	)
		throw new Error('variants: ожидался объект вида {"State":"Hover"}');
	const wanted = Object.entries(properties as Record<string, unknown>);
	if (
		!wanted.length ||
		wanted.some(([k, v]) => !k.trim() || typeof v !== "string" || !v.trim())
	)
		throw new Error(
			"variants: нужен непустой объект «Свойство: Значение» со строковыми значениями",
		);
	const desc = wanted.map(([k, v]) => `${k}=${String(v)}`).join(", ");
	if (!set)
		throw new Error(
			`variants (${desc}): компонент не входит в набор вариантов`,
		);
	const matches = set.children.filter(
		(c): c is ComponentNode =>
			c.type === "COMPONENT" &&
			!!c.variantProperties &&
			wanted.every(([k, v]) => c.variantProperties?.[k] === v),
	);
	if (!matches.length)
		throw new Error(`variants: нет варианта ${desc} в «${set.name}»`);
	const def = set.defaultVariant;
	return def && matches.includes(def) ? def : matches[0];
}

// Map, а не Record: лукап на обычном объекте принимает унаследованные
// ключи ("toString", "constructor") за валидные значения.
const TRIGGERS = new Map<string, "ON_HOVER" | "ON_PRESS" | "ON_CLICK">([
	["hover", "ON_HOVER"],
	["press", "ON_PRESS"],
	["click", "ON_CLICK"],
]);
const TRANSITIONS = new Map<string, "DISSOLVE" | "SMART_ANIMATE">([
	["dissolve", "DISSOLVE"],
	["smart_animate", "SMART_ANIMATE"],
]);

// Одна запись op.interactions → Reaction для setReactionsAsync.
// null — невалидный ввод (trigger/transition/duration); принадлежность
// target набору проверяет вызывающий.
export function buildReaction(
	entry: unknown,
	targetId: string,
): Reaction | null {
	if (!entry || typeof entry !== "object" || Array.isArray(entry))
		return null;
	const e = entry as Record<string, unknown>;
	const trigger =
		typeof e.trigger === "string" ? TRIGGERS.get(e.trigger) : undefined;
	if (!trigger) return null;
	const duration = e.duration === undefined ? 0.15 : e.duration;
	if (
		typeof duration !== "number" ||
		!Number.isFinite(duration) ||
		duration < 0 ||
		duration > 10
	)
		return null;
	let transition: Transition | null = null;
	if (e.transition !== undefined && e.transition !== "instant") {
		const kind =
			typeof e.transition === "string"
				? TRANSITIONS.get(e.transition)
				: undefined;
		if (!kind) return null;
		transition = {
			type: kind,
			easing: { type: "EASE_IN_AND_OUT" },
			duration,
		};
	}
	return {
		trigger: { type: trigger },
		actions: [
			{
				type: "NODE",
				navigation: "CHANGE_TO",
				destinationId: targetId,
				transition,
			},
		],
	};
}
