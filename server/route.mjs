import { SCHEMA_NAMES } from "./schemas.mjs";

// Маршрутизация ответа модели: какой исход выбрать по распарсенной спеке.
// Вынесено из index.mjs, чтобы проверять порядок веток юнит-тестами.
// Отличие от старой цепочки: inspect разрешён и в раунде ревью — иначе
// {"inspect":[...]} в ревью молча попадал в «одобрено».
export function routeReply(
	spec,
	{ isReview, noInspect, noPhotos, noAsk },
) {
	// Бриф: вопросы вместо сборки. Один бриф на задачу — повторный (или
	// выключенный в настройках) отклоняем, а не зацикливаем пользователя.
	if (spec && Array.isArray(spec.ask) && spec.ask.length)
		return noAsk ? "ask_limit" : "ask";
	// Лимит просмотров исчерпан, а модель всё равно просит ещё.
	if (noInspect && spec && Array.isArray(spec.inspect))
		return "inspect_limit";
	// Полная схема редкого типа/операции — по просьбе модели.
	if (
		spec &&
		typeof spec.schema === "string" &&
		SCHEMA_NAMES.includes(spec.schema.trim().toLowerCase())
	)
		return "schema";
	// Поиск нод (по имени/тексту, на странице или во фрейме) — в любом раунде.
	if (spec && typeof spec.search === "string" && spec.search.trim())
		return "search";
	// Визуальный просмотр нод — и в обычном запросе, и в ревью.
	if (spec && Array.isArray(spec.inspect)) return "inspect";
	// Предпросмотр стоковых фото — тоже в любом раунде.
	if (
		noPhotos &&
		spec &&
		typeof spec.photos === "string" &&
		spec.photos.trim()
	)
		return "photos_limit";
	if (spec && typeof spec.photos === "string" && spec.photos.trim())
		return "photos";
	// Ревью одобрено: {"ok":true}, просто текст или объект без спеки/правок.
	if (
		isReview &&
		(!spec ||
			spec.ok === true ||
			(spec.type !== "frame" && !Array.isArray(spec.edits)))
	)
		return "review_ok";
	if (spec && Array.isArray(spec.edits)) return "edits";
	// {"ok":true,"summary":...} вне ревью — модель считает работу
	// завершённой и отчитывается. Это финальная реплика, а не ошибка
	// спеки; то же для любого объекта-отчёта с summary ({"ok":false,...}).
	if (
		spec &&
		(spec.ok === true ||
			(typeof spec.summary === "string" && spec.summary.trim()))
	)
		return "say";
	if (!spec || typeof spec !== "object" || spec.type !== "frame")
		return "invalid";
	return "frame";
}
