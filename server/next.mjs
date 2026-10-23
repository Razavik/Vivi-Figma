// Быстрые действия: модель предлагает до 3 следующих шагов к готовому макету.
const MAX_NEXT = 3;
const MAX_LEN = 40;

// Чистка поля "next": строки, без пустых и повторов, обрезка по длине.
export function cleanNext(raw) {
	if (!Array.isArray(raw)) return [];
	const seen = new Set();
	const out = [];
	for (const item of raw) {
		if (typeof item !== "string") continue;
		const text = item.replace(/\s+/g, " ").trim().slice(0, MAX_LEN);
		const key = text.toLowerCase();
		if (!text || seen.has(key)) continue;
		seen.add(key);
		out.push(text);
		if (out.length >= MAX_NEXT) break;
	}
	return out;
}
