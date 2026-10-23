import type { CatalogModel } from "./settings-core";
import type { DesignSpec } from "../spec";
import type { Attachment } from "./attachments";
import {
	type MergedModel,
	type Settings,
	defaultSettings,
} from "./settings-core";

// Общее изменяемое состояние UI: модули chat.ts/models.ts/ui.ts
// читают и пишут напрямую — без циклических импортов.
export const S = {
	busy: false,
	// Индикатор контекста: занято токенов и окно (если модель его не знает).
	ctxTokens: 0,
	ctxWindow: 0,
	lastSpec: null as DesignSpec | null,
	selectionSpec: null as DesignSpec[] | null,
	selectionHidden: false,
	selectionNames: [] as string[],
	// Оглавление страницы — агент по нему решает, что посмотреть.
	pageOutline: [] as unknown[],
	// Агентный цикл: после сборки модель ревьюит результат и может исправить.
	lastPrompt: "",
	reviewCount: 0,
	inspectCount: 0,
	// Сколько раз за прогон модель запросила предпросмотр стоковых фото.
	photoCount: 0,
	briefAsked: false,
	schemaCount: 0,
	selectionImage: "",
	selectionImageSent: false,
	styleSwap: false,
	styleCardShown: false,
	runRefMode: "" as "" | "copy" | "mood",
	runPalette: [] as string[],
	variantLabels: null as string[] | null,
	checklist: [] as string[],
	checked: [] as number[],
	checkRetries: 0,
	nextActions: [] as string[],
	agentSpoke: false,
	// Итог прогона: что модель считает недоделанным, сколько нод тронуто,
	// предупреждения сборки.
	remaining: "",
	// Откат к сообщению: id текущего прогона, прогоны с изменениями на холсте
	// (из плагина), контекст агента до каждого прогона и ожидающий откат.
	// Настройки (правила, свои модели, названия) и то, что прислал сервер.
	settings: defaultSettings() as Settings,
	// Итоговый список моделей (с семействами) — по нему выбираются опции.
	merged: [] as MergedModel[],
	serverModels: [] as { id: string; label: string }[],
	// Каталог доступных моделей по провайдерам (по запросу из настроек).
	catalog: {} as Record<
		string,
		{
			loading?: boolean;
			error?: string;
			// Пояснение, если список неполный (получен запасным путём).
			note?: string;
			models?: CatalogModel[];
			// Модели-семейства: варианты по уровню размышления и Fast одной записью.
			families?: import("./settings-core").ModelFamily[];
		}
	>,
	providers: [] as { id: string; label: string }[],
	runId: 0,
	// Беседа, которой принадлежит текущий прогон (null — агент свободен).
	// Её сообщения и контекст идут мимо экрана, если пользователь переключился.
	runChatId: null as string | null,
	// Изображения, приложенные пользователем к текущему прогону (уходят в каждом раунде).
	// Вложения каждого сообщения по runId — возвращаем в поле при откате к нему.
	attachByRun: new Map<number, Attachment[]>(),
	// Очередь запросов, заготовленных, пока агент работает.
	// Сообщения пользователя, добавленные пока агент работал (весь прогон).
	runUpdates: [] as string[],
	updatesDelivered: 0,
	runImages: [] as { data: string; mimeType: string }[],
	// Документы пользователя к текущему прогону (сервер достаёт текст).
	runFiles: [] as { name: string; data: string; mimeType: string }[],
	// Рабочая выжимка агента по документам ("notes"): после неё полный
	// текст документов больше не уходит в запросы.
	docNotes: "",
	undoRuns: [] as number[],
	// Версии дизайна (прогоны с копиями на странице истории) — список для панели.
	versions: [] as { id: number; ts: number; prompt: string }[],
	ctxByRun: new Map<number, { spec: unknown; prompt: string }>(),
	pendingRollback: null as null | {
		msg: { role: "user"; text: string; sel?: string; runId?: number };
		withDesign: boolean;
	},
	// Стили/переменные файла (приходят из плагина) — уходят модели как контекст.
	designSystem: null as unknown,
	components: [] as unknown[],
	// Семейства шрифтов, доступные в Figma пользователя
	fonts: [] as string[],
	lastImage: "",
	// Предупреждения последней сборки (то, что ещё не исправлено)
	runWarnings: [] as string[],
	// Измеримые проблемы последней сборки (lint): вылезание, контраст, отступы…
	runIssues: [] as { id: string; name: string; kind: string; detail: string }[],
	// Расход прогона: раунды модели, токены, стоимость (если провайдер сообщает), старт
	runUsage: { rounds: 0, input: 0, output: 0, cached: 0, cost: 0 },
	runStarted: 0,
	// План большой задачи от модели (части по порядку) — возвращается ей в каждом раунде
	plan: [] as string[],
	// Номера готовых частей плана (с 1) и пришёл ли план в этом прогоне.
	planDone: [] as number[],
	planInRun: false,
	// Подряд одинаковые непройденные предупреждения (защита от бесконечного цикла)
	warnRepeat: 0,
	warnKey: "",
	// Финальная перепроверка всего результата по запросу уже выполнена
	finalChecked: false,
	// Подряд одинаковый «remaining» в раундах продолжения (защита от зацикливания)
	remainingKey: "",
	remainingRepeat: 0,
	// Поля ревью-раунда (review/warnings/finalCheck/unresolved): inspect и
	// search в ревью повторяют запрос с ними, иначе раунд станет обычным.
	reviewExtra: null as Record<string, unknown> | null,
	// Куски длинного скриншота текущего результата (пусто, если страница короткая).
	lastTiles: [] as { data: string; mimeType: "image/jpeg"; label: string }[],
	// Критик уже проверял этот прогон; итоговое резюме держим до его ответа.
	critiqued: false,
	pendingSummary: "",
	inflight: null as Record<string, unknown> | null,
	inflightUnsent: false,
	disconnectedAt: 0,
	runModel: "",
	fallbackUsed: false,
	pendingInterruptedContinue: null as null | {
		rootId?: string;
		prompt: string;
		remaining?: string;
		plan?: string[];
		planDone?: number[];
		model?: string;
	},
	// Предпочтение модели, переживающее прогоны: ручной выбор или модель
	// из сохранённого чата. В currentModel попадает, когда она есть в списке.
	savedModel: null as string | null,
	currentModel: "",
	// Пользователь сам выбрал модель в списке — модель из старого чата её не перекроет.
	modelChosenByUser: false,
	// Сохранённый чат из clientStorage применён; до этого persistChat молчит.
	chatRestored: false,
	// Текущий стримящийся блок «Размышления» (если модель шлёт thinking).
	thoughtEl: null as HTMLElement | null,
};

// Лимитов на раунды нет: цикл идёт, пока модель сама не одобрит результат
// или не ответит без спеки/правок. Остановить можно кнопкой «Стоп».
export const MAX_REVIEWS = Infinity;
// Сколько раз подряд модель может оставить те же самые непройденные операции,
// прежде чем остановиться (иначе — работает, пока не исправит всё)
export const MAX_SAME_WARNINGS = 5;
// Сколько раз подряд модель может вернуть тот же «remaining», не продвинувшись
export const MAX_SAME_REMAINING = 3;
export const MAX_INSPECTS = Infinity;
// Поиск фото тяжелее inspect (сеть + картинки в контекст) — ограничиваем.
export const MAX_PHOTOS = 4;

export const modelLabels = new Map<string, string>();
