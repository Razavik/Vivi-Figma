// Чистая часть брифа (без DOM) — проверяется тестами.
export type BriefQuestion = {
	id: string;
	q: string;
	options: string[];
	multi: boolean;
};
export type BriefAnswer = { id: string; q: string; answer: string };

// Ответ на вопрос из выбранных чипов и «своего варианта».
export function answerOf(picked: string[], custom: string): string {
	const own = custom.trim();
	return [...picked, ...(own ? [own] : [])].join(", ");
}
