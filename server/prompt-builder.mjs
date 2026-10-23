// Сборка частей запроса. Стабильная часть — то, что почти не меняется между
// раундами (шрифты, дизайн-система, каталог компонентов файла): она уходит
// в хвост системного промпта, чтобы кэшировалась вместе с ним, а у Devin
// переотправлялась только при изменении.

export function stableBlock(msg) {
	let out = "";
	if (Array.isArray(msg.fonts) && msg.fonts.length) {
		out +=
			"\n\nFont families available in the user's Figma (use only these in fontFamily; anything else falls back to Inter Regular): " +
			msg.fonts
				.filter((f) => typeof f === "string")
				.slice(0, 60)
				.join(", ");
	}
	if (msg.designSystem && typeof msg.designSystem === "object") {
		out +=
			"\n\nDesign system of the user's Figma file (local styles and variables). " +
			'Prefer these over invented values: use a color style as "style:<name>" in any color/fill field and a text style as "textStyle":"<name>" on text nodes; ' +
			"variables are listed for their values (use the same hex / numbers):\n" +
			JSON.stringify(msg.designSystem);
	}
	if (Array.isArray(msg.components) && msg.components.length) {
		out +=
			'\n\nComponents already in the user\'s Figma file (main components and component sets, all pages). Reuse them: place instances {"type":"instance","component":"<id>"} instead of rebuilding the same structure. For a set pick "variants" with one of the listed values; "overrides" keys are the listed text layer names. A set\'s "variants" lists its properties and their values:\n' +
			JSON.stringify(
				msg.components
					.filter((c) => c && typeof c.id === "string")
					.slice(0, 60),
			);
	}
	return out;
}

// Нужно ли слать Devin полный системный промпт в этом раунде: новая сессия,
// изменился промпт/стабильный контекст или прошло every раундов.
export function needsFullSystem({ isNew, sent, system, rounds, every }) {
	return isNew || sent !== system || rounds >= every;
}

// Стартовое «семя» дизайна для НОВОЙ работы: направление и пара шрифтов,
// выбранные детерминированно по тексту запроса. Ломает привычку модели
// выбирать одно и то же; запрос, референс и дизайн-система сильнее семени.
export const DIRECTIONS = [
	"editorial (serif display headings, warm paper tones, thin rules, generous margins)",
	"Swiss/minimal (strict grid, near-monochrome + one sharp accent, tight type, small radii)",
	"bold product (saturated accent, oversized type, big contrasting blocks)",
	"soft/friendly (rounded shapes, pastel tinted surfaces, warm photos)",
	"premium dark (deep tinted surfaces, restrained light accent, lots of air)",
	"utilitarian/dense (compact rows, small type, almost no decoration)",
	"brutalist/graphic (hard edges, thick borders, flat saturated fills, mono accents)",
	"playful/illustrative (bright palette, big rounded shapes, tilted stickers, chunky type)",
];

function hashOf(text) {
	let h = 2166136261;
	for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
	return h;
}

// Пустая строка, если работа не новая (есть что менять/продолжать).
export function designSeed(msg, { isReview, hasImages }) {
	if (isReview || hasImages || msg.previousSpec || msg.selection) return "";
	if (Array.isArray(msg.page) && msg.page.length) return "";
	const ds = msg.designSystem;
	if (ds && typeof ds === "object" && Object.values(ds).some((v) => Array.isArray(v) ? v.length : v))
		return "";
	const h = hashOf(msg.prompt ?? "");
	let out = `\n\nDesign seed for this NEW design (a starting point so results differ from brief to brief): visual direction — ${DIRECTIONS[h % DIRECTIONS.length]}.`;
	const fonts = (Array.isArray(msg.fonts) ? msg.fonts : []).filter((f) => typeof f === "string");
	if (fonts.length >= 2) {
		const a = fonts[(h >>> 3) % fonts.length];
		const b = fonts[((h >>> 3) + 1 + ((h >>> 9) % (fonts.length - 1))) % fonts.length];
		out += ` Consider these font families: ${a} and ${b}.`;
	}
	return out + " Use it unless the user's words, a reference image or an existing design system point elsewhere; derive a fitting palette yourself (D1-D2) and record the final choice in notes.";
}
