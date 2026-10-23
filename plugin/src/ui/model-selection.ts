// Чистая логика выбора модели по доступному списку (без DOM):
// восстановленное предпочтение важнее временного fallback'а и хранится,
// пока модель не появится в списке.
import { type MergedModel, type Settings, modelIdOf } from "./settings-core";

// Старый сохранённый выбор указывал на конкретный вариант
// (devin:claude-opus-5-5-high): переносим на семейство с его уровнем и Fast.
function migrateSelection(
	id: string,
	models: MergedModel[],
	prefs: Settings["prefs"],
): string | null {
	for (const m of models) {
		for (const v of m.family?.variants || []) {
			if (modelIdOf(m.provider, v.id) === id) {
				prefs[m.id] = { level: v.level, fast: v.fast };
				return m.id;
			}
		}
	}
	return null;
}

// Выбор текущей модели: доступное saved-предпочтение первым, затем
// доступный current, иначе первая модель списка. Недоступное saved
// не сбрасываем — оно применится, когда модель появится в списке.
export function resolveModelSelection(
	currentModel: string,
	savedModel: string | null,
	models: MergedModel[],
	prefs: Settings["prefs"],
): { currentModel: string; savedModel: string | null } {
	const present = new Set(models.map((m) => m.id));
	// Миграция current — первой: saved той же семьи потом переопределит prefs.
	if (currentModel && !present.has(currentModel)) {
		const moved = migrateSelection(currentModel, models, prefs);
		if (moved) currentModel = moved;
	}
	if (savedModel && !present.has(savedModel)) {
		const moved = migrateSelection(savedModel, models, prefs);
		if (moved) savedModel = moved;
	}
	currentModel =
		savedModel && present.has(savedModel)
			? savedModel
			: present.has(currentModel)
				? currentModel
				: (models[0]?.id ?? "");
	return { currentModel, savedModel };
}
