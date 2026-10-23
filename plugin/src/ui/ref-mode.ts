// Как трактовать приложенные картинки: "copy" — повторить макет,
// "mood" — мудборд: вывести общий стиль, композиции не копировать.
const MOOD_WORDS =
	/мудборд|moodboard|mood board|в стиле|в духе|как на этих|вдохнов|inspired by|in the style of|style of these/i;

export function refModeOf(imageCount: number, prompt: string): "copy" | "mood" | "" {
	if (imageCount <= 0) return "";
	if (imageCount >= 2 || MOOD_WORDS.test(prompt)) return "mood";
	return "copy";
}

const STYLE_WORDS =
	/как у|как в|как этот|как тот|как первый|в стиле|стиль|под стиль|оформи как|сделай как|like the first|like this|same style|match the style|style of/i;

// «Сделай как вот этот блок»: выделено 2+ нод и запрос про стиль.
export function wantsStyleTransfer(prompt: string, selectedCount: number): boolean {
	return selectedCount >= 2 && STYLE_WORDS.test(prompt);
}

// Направление и цвета из рабочей выжимки: «Direction: ... Accent #B4532A ...».
export function styleFromNotes(notes: string): { direction: string; colors: string[] } | null {
	const m = /Direction:\s*([^\n]*?)(?:\.\s|\n|$)/i.exec(notes);
	if (!m) return null;
	const colors = [...new Set((notes.match(/#[0-9a-f]{6}\b/gi) || []).map((c) => c.toUpperCase()))].slice(0, 10);
	return { direction: m[1].trim().slice(0, 120), colors };
}
