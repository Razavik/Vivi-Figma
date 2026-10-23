// Критик: отдельный раунд, который смотрит на результат без памяти строителя.
// Текст запроса и разбор ответа вынесены сюда, чтобы их проверять юнит-тестами.
import { extractJson } from "./parse.mjs";

export function critiqueUserText({
	prompt,
	spec,
	issues,
	refCount,
	labels = [],
}) {
	return (
		`Request: "${prompt}"\n\nThe design was built in Figma. Node tree (actual sizes after auto-layout):\n${JSON.stringify(spec)}\n\n` +
		(issues?.length
			? `Automatic lint report (measured on the real nodes; mention an item only if it really hurts the design): ${JSON.stringify(issues.slice(0, 40))}\n\n`
			: "") +
		(refCount
			? `The FIRST ${refCount} attached image(s) are the user's reference.\n`
			: "") +
		(labels.length
			? `Then the result screenshots: ${labels.map((l, i) => `#${i + 1} ${l}`).join("; ")}.\n`
			: "") +
		`Return the JSON now.`
	);
}

// Чистка одного замечания: без текста проблемы замечание не нужно.
function cleanProblem(item) {
	if (!item || typeof item !== "object") return null;
	if (typeof item.problem !== "string" || !item.problem.trim()) return null;
	const out = { problem: item.problem.trim().slice(0, 300) };
	if (typeof item.id === "string" && item.id.trim())
		out.id = item.id.trim().slice(0, 40);
	if (typeof item.fix === "string" && item.fix.trim())
		out.fix = item.fix.trim().slice(0, 300);
	return out;
}

export function sanitizeCritique(list) {
	if (!Array.isArray(list)) return [];
	return list.map(cleanProblem).filter(Boolean).slice(0, 8);
}

// Разбор ответа критика. Неразборчивый ответ — failed, а не пустой список замечаний.
export function parseCritique(text) {
	const { spec } = extractJson(String(text || ""));
	if (!spec || typeof spec !== "object" || !Array.isArray(spec.problems))
		return { problems: [], summary: "", failed: true };
	const summary =
		typeof spec.summary === "string" ? spec.summary.trim().slice(0, 300) : "";
	return { problems: sanitizeCritique(spec.problems), summary };
}
