// Контекст модели: оценка размера запроса, окно модели и выжимка истории.
// Реальный расход берём из ответа провайдера (usage) последнего раунда той же
// модели; для нового текста считаем грубо по символам (с запасом).

// ~3 символа на токен: кириллица и JSON плотнее английского, оценка с запасом.
export const CHARS_PER_TOKEN = 3;
// Одна картинка (скриншот/фото) — примерно столько токенов.
export const IMAGE_TOKENS = 1_500;
// Окно, если провайдер не сообщил свое (acp:*).
export const FALLBACK_WINDOW = 200_000;
// Сжимаем, когда запрос занимает больше этой доли окна: остаётся запас на ответ.
export const COMPACT_AT = 0.8;
// Выжимка — 17–20k токенов; верхняя граница задаёт и размер ответа summarizer.
export const SUMMARY_MAX_TOKENS = 20_000;
// Последние реплики, которые идут дословно, а не в выжимке.
export const KEEP_RECENT_TOKENS = 12_000;
// Ручной компакт оставляет дословно столько последних реплик.
export const KEEP_RECENT_MESSAGES = 4;
// Сколько истории отдаём summarizer (чтобы сам запрос к нему не переполнился).
export const SUMMARY_INPUT_TOKENS = 120_000;

export function estimateTokens(text) {
	return Math.ceil(String(text || "").length / CHARS_PER_TOKEN);
}

// Размер запроса: если модель уже считала такой же текст (или его начало) —
// берём её реальный расход и добавляем только новое; иначе оцениваем по символам.
// last = { tokens, chars, images } из прошлого раунда этой модели.
export function promptEstimate({ chars, images = 0, last = null }) {
	if (last && last.tokens > 0 && chars >= last.chars) {
		const extraImages = Math.max(0, images - (last.images || 0));
		return (
			last.tokens +
			Math.ceil((chars - last.chars) / CHARS_PER_TOKEN) +
			extraImages * IMAGE_TOKENS
		);
	}
	return Math.ceil(chars / CHARS_PER_TOKEN) + images * IMAGE_TOKENS;
}

export function needsCompaction(promptTokens, windowTokens) {
	return promptTokens > windowTokens * COMPACT_AT;
}

// Делит историю (от старых к новым) на старую часть для выжимки и последние
// реплики, которые остаются дословно. Возвращает число старых записей.
export function olderCount(entries, keepTokens = KEEP_RECENT_TOKENS) {
	let kept = 0;
	let i = entries.length;
	while (i > 0) {
		const cost = estimateTokens(lineOf(entries[i - 1]));
		if (kept + cost > keepTokens) break;
		kept += cost;
		i--;
	}
	return i;
}

export function lineOf(entry) {
	const role = entry?.role === "user" ? "User" : "Assistant";
	return `${role}: ${String(entry?.text || "").slice(0, 800)}`;
}

// Вход для summarizer: прошлая выжимка + старые реплики, самые свежие из
// старых в приоритете, если всё не влезает в SUMMARY_INPUT_TOKENS.
export function summaryInput(previous, older) {
	const budget = SUMMARY_INPUT_TOKENS * CHARS_PER_TOKEN;
	const head = previous ? `Earlier summary:\n${previous}\n\n` : "";
	const lines = [];
	let total = head.length;
	for (let i = older.length - 1; i >= 0; i--) {
		const line = lineOf(older[i]);
		if (total + line.length > budget) break;
		lines.unshift(line);
		total += line.length + 1;
	}
	return `${head}Conversation to fold into the summary (oldest first):\n${lines.join("\n")}`;
}

// Меньше этого — не выжимка (отказ сервиса или пустой ответ).
export const MIN_SUMMARY_CHARS = 200;

// Выжимка не длиннее лимита: обрезаем по границе предложения, если выше.
export function clampSummary(text) {
	const max = SUMMARY_MAX_TOKENS * CHARS_PER_TOKEN;
	const s = String(text || "").trim();
	if (s.length <= max) return s;
	const cut = s.slice(0, max);
	const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("\n"));
	return end > max / 2 ? cut.slice(0, end + 1) : cut;
}

export const SUMMARY_SYSTEM = `You compress the chat history of a design assistant working inside Figma with a user. Write a working summary that lets the assistant continue the work with no other context. Keep: the user's requirements, brand and style decisions, content facts (names, prices, texts, numbers), what has already been built and its key node/component ids, open issues and remaining work, and every correction or dislike the user expressed. Drop greetings, repeated status lines and tool noise. Write in the language the user writes in. Plain text with short headings or bullets; no JSON, no markdown fences. Stay under ${SUMMARY_MAX_TOKENS} tokens.`;

// Окно модели: Claude — 1M у всех; devin — из каталога; остальное — запасное.
export function windowOf(model, devinContext) {
	if (typeof model !== "string") return FALLBACK_WINDOW;
	if (model.startsWith("devin:")) {
		const n = devinContext?.(model.slice("devin:".length));
		return Number.isFinite(n) && n > 0 ? n : FALLBACK_WINDOW;
	}
	if (model.startsWith("acp:")) return FALLBACK_WINDOW;
	return 1_000_000;
}
