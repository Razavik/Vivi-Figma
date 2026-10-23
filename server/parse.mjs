// Разбор ответа модели: JSON из текста (с прозой вокруг, фенсами, висячими
// запятыми). Вынесено из index.mjs, чтобы тестироваться без запуска сервера.
// JSON.parse, который прощает висячие запятые перед } и ] — частая
// ошибка моделей. Строки с такими запятыми внутри не затрагиваем.
export function parseLoose(text) {
	try {
		return JSON.parse(text);
	} catch {
		let out = "";
		let inString = false;
		let escaped = false;
		for (let i = 0; i < text.length; i++) {
			const ch = text[i];
			if (inString) {
				out += ch;
				if (escaped) escaped = false;
				else if (ch === "\\") escaped = true;
				else if (ch === '"') inString = false;
				continue;
			}
			if (ch === '"') inString = true;
			if (ch === ",") {
				const rest = text.slice(i + 1).match(/^\s*[}\]]/);
				if (rest) continue;
			}
			out += ch;
		}
		return JSON.parse(out);
	}
}

// Достаёт JSON-объект из текста ответа модели. Возвращает { spec, prose } —
// prose это текст вокруг JSON (модель иногда пишет пояснение вместо summary).
export function extractJson(text) {
	const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	for (const candidate of [fence?.[1], text]) {
		if (!candidate) continue;
		try {
			const spec = parseLoose(candidate.trim());
			// Проза — всё, что осталось вокруг съеденного JSON.
			const prose = fence
				? (
						text.slice(0, fence.index) +
						text.slice(fence.index + fence[0].length)
					).trim()
				: "";
			return { spec, prose };
		} catch {
			/* пробуем дальше */
		}
	}
	const start = text.indexOf("{");
	if (start < 0) return { spec: null, prose: text.trim() };
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === "\\") escaped = true;
			else if (ch === '"') inString = false;
			continue;
		}
		if (ch === '"') inString = true;
		else if (ch === "{") depth++;
		else if (ch === "}") {
			depth--;
			if (depth === 0) {
				try {
					return {
						spec: parseLoose(text.slice(start, i + 1)),
						prose: (
							text.slice(0, start) + text.slice(i + 1)
						).trim(),
					};
				} catch {
					return { spec: null, prose: text.trim() };
				}
			}
		}
	}
	return { spec: null, prose: text.trim() };
}

// "remaining" — что модель считает недоделанным (пусто, если всё сделано).
export function remainingOf(spec) {
	return spec && typeof spec.remaining === "string" && spec.remaining.trim()
		? spec.remaining.trim().slice(0, 300)
		: undefined;
}

