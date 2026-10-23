// Сообщения пользователя, написанные пока агент работал: чистка и текст раунда.
export const MAX_UPDATES = 10;
export const MAX_UPDATE_CHARS = 2000;

export function sanitizeUpdates(list) {
	if (!Array.isArray(list)) return [];
	return list
		.filter((t) => typeof t === "string" && t.trim())
		.map((t) => t.trim().slice(0, MAX_UPDATE_CHARS))
		.slice(-MAX_UPDATES);
}

export function updatesText(list) {
	const items = sanitizeUpdates(list);
	if (!items.length) return "";
	return (
		"\n\nNEW MESSAGES FROM THE USER — written while you were working, in order (the latest wins). They may add to, refine or change the task: apply them to the design now, keep what is not contradicted, and mention it in the summary:\n" +
		items.map((t, i) => `${i + 1}. ${t}`).join("\n") +
		"\n"
	);
}
