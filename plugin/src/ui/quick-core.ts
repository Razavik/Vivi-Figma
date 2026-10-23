// Быстрые действия под «Итогом»: запасной набор, если модель не прислала next.
// Чистая логика (без DOM) — проверяется тестами.
type Node = {
	type?: string;
	name?: string;
	w?: number | string;
	children?: Node[];
};

const MAX_ACTIONS = 3;

function names(node: Node, out: string[] = []): string[] {
	if (node.name) out.push(node.name);
	if (node.type) out.push(node.type);
	for (const c of node.children ?? []) names(c, out);
	return out;
}

// Действия по результату: десктоп → мобильная версия, форма → состояния
// полей, любой макет → ещё вариант.
export function fallbackActions(root: Node | null): string[] {
	if (!root) return [];
	const out: string[] = [];
	if (typeof root.w === "number" && root.w >= 900)
		out.push("Сделать мобильную версию");
	if (names(root).some((n) => /input|field|email|поле|форма|form/i.test(n)))
		out.push("Добавить состояния полей");
	out.push("Предложить ещё вариант");
	return out.slice(0, MAX_ACTIONS);
}

// Куда подставить действие: в пустое поле — целиком (и сразу отправить),
// в набранный текст — в конец, не затирая.
export function mergeAction(
	current: string,
	action: string,
): { text: string; send: boolean } {
	const typed = current.trim();
	if (!typed) return { text: action, send: true };
	return { text: `${typed}. ${action}`, send: false };
}
