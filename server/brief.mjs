// Бриф: модель вместо сборки задаёт уточняющие вопросы большой задачи.
// Чистка вопросов от модели и текст раунда с ответами пользователя.

const MAX_QUESTIONS = 5;
const MAX_OPTIONS = 6;

const text = (v, max) =>
	typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

// Вопросы модели → безопасный список для UI: строки с лимитами, без пустых
// вопросов и без вопросов без вариантов (выбирать не из чего).
export function sanitizeQuestions(raw) {
	if (!Array.isArray(raw)) return [];
	const out = [];
	for (const item of raw) {
		if (!item || typeof item !== "object") continue;
		const q = text(item.q, 140);
		const seen = new Set();
		const options = (Array.isArray(item.options) ? item.options : [])
			.map((o) => text(o, 60))
			.filter((o) => o && !seen.has(o.toLowerCase()) && seen.add(o.toLowerCase()))
			.slice(0, MAX_OPTIONS);
		if (!q || options.length < 2) continue;
		out.push({
			id: text(item.id, 30) || `q${out.length + 1}`,
			q,
			options,
			multi: item.multi === true,
		});
		if (out.length >= MAX_QUESTIONS) break;
	}
	return out;
}

// Ответы пользователя из UI: [{id, q, answer}] → чистый список.
export function sanitizeAnswers(raw) {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((a) => ({
			q: text(a?.q, 140),
			answer: text(a?.answer, 200),
		}))
		.filter((a) => a.q && a.answer)
		.slice(0, MAX_QUESTIONS);
}

// Блок для текста раунда после брифа.
export function briefText(answers, skipped) {
	if (skipped)
		return "The user skipped your questions: decide everything yourself with sensible defaults. Build now; do not ask again in this task.";
	const list = sanitizeAnswers(answers);
	if (!list.length) return "";
	return `The user answered your brief:\n${list.map((a) => `- ${a.q} → ${a.answer}`).join("\n")}\nBuild now using these answers (record them in "notes"); do not ask again in this task.`;
}
