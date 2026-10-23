// Чек-лист требований задачи: модель выписывает требования в первом ответе
// ("checklist") и отмечает выполненные номера ("checked") — как plan/planDone.
const MAX_ITEMS = 12;

export function cleanChecklist(raw) {
	if (!Array.isArray(raw)) return [];
	const seen = new Set();
	const out = [];
	for (const item of raw) {
		if (typeof item !== "string") continue;
		const text = item.replace(/\s+/g, " ").trim().slice(0, 100);
		if (!text || seen.has(text.toLowerCase())) continue;
		seen.add(text.toLowerCase());
		out.push(text);
		if (out.length >= MAX_ITEMS) break;
	}
	return out;
}

// Номера (с 1) в пределах списка, без повторов, по возрастанию.
export function cleanChecked(raw, size) {
	if (!Array.isArray(raw)) return [];
	const nums = raw
		.map(Number)
		.filter((n) => Number.isInteger(n) && n >= 1 && n <= size);
	return [...new Set(nums)].sort((a, b) => a - b);
}

// Блок запроса: список требований с отметками.
export function checklistText(items, checked) {
	const list = cleanChecklist(items);
	if (!list.length) return "";
	const done = new Set(cleanChecked(checked, list.length));
	return (
		"\n\nRequirements checklist for this task (from your first answer), in order:\n" +
		list.map((t, i) => `${i + 1}. ${t}${done.has(i + 1) ? " — done" : ""}`).join("\n") +
		'\nIn every answer send "checked":[...] with the numbers of ALL requirements that are really fulfilled so far. Before approving, every item must be checked; anything you cannot do goes into "remaining".'
	);
}
