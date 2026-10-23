// Расход раунда у разных провайдеров приводим к одному виду:
// {input, output, cached, cost?}. Нет данных — null.
export function usageOf(result) {
	const u = result && typeof result === "object" ? result.usage : null;
	if (!u || typeof u !== "object") return null;
	const num = (...keys) => {
		for (const k of keys) if (typeof u[k] === "number") return u[k];
		return 0;
	};
	const input = num("inputTokens", "input_tokens");
	const output = num("outputTokens", "output_tokens");
	const cached =
		num("cachedReadTokens", "cache_read_input_tokens", "cachedInputTokens") +
		num("cachedWriteTokens", "cache_creation_input_tokens");
	if (!input && !output && !cached) return null;
	const out = { input, output, cached };
	if (typeof result.costUsd === "number") out.cost = result.costUsd;
	return out;
}
