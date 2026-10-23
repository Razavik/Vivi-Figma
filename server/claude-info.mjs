// Сведения о модели Claude из её описания в каталоге SDK:
// «Opus 5 with 1M context · … · $5/$25 per Mtok». Цена кэша и точное окно
// контекста SDK не отдаёт; цена кэша считается как ввод / 20 (Haiku — / 10).
export function parseClaudeInfo(description = "", label = "") {
	const out = {};
	const price = /\$([\d.]+)\s*\/\s*\$([\d.]+)\s*per\s*Mtok/i.exec(description);
	// Кэш ввода у Claude дешевле обычного ввода в 20 раз, у Haiku — в 10
	if (price) {
		const input = Number(price[1]);
		const divider = /haiku/i.test(`${label} ${description}`) ? 10 : 20;
		out.price = { input, cached: +(input / divider).toFixed(4), output: Number(price[2]) };
	}
	const context = /(\d+(?:\.\d+)?)\s*M\s*context/i.exec(`${label} ${description}`);
	if (context) out.context = Math.round(Number(context[1]) * 1_000_000);
	return out;
}
