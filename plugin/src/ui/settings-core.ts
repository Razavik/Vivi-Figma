// Чистая логика настроек (без DOM): типы, нормализация из хранилища,
// сборка списка моделей из каталогов провайдеров и «семейства» — одна модель,
// объединяющая варианты по уровню размышления и Fast-режиму.

// Вариант семейства: конкретная модель у провайдера.
// Цены за 1M токенов, $.
export type Price = { input?: number; cached?: number; output?: number };

export type FamilyVariant = {
	id: string; // id модели у провайдера (например claude-opus-5-5-high-fast)
	level: string; // уровень размышления: low | medium | high | … | default
	fast: boolean; // Fast-режим (быстрее и дороже)
	label: string;
	price?: Price | null; // null — каталог Devin цены не даёт: бесплатно; undefined — нет данных
};

// Семейство: одна запись в списке моделей вместо десятков вариантов.
export type ModelFamily = {
	id: string;
	label: string;
	variants: FamilyVariant[];
	// Окно контекста в токенах (если провайдер сообщает)
	context?: number;
	price?: Price | null;
};

// Выбор опций у поля ввода для семейства.
export type ModelPrefs = { level?: string; fast?: boolean };

export type Settings = {
	rules: string;
	bridgeToken: string;
	fallbackModel: string;
	// Независимая проверка результата отдельным критиком; "" — та же модель, что у прогона.
	// Уточнять у пользователя перед большой размытой задачей (бриф).
	askBrief: boolean;
	// Режим MCP: окно плагина сворачивается в маленький блок, плагин остаётся запущенным.
	mcpMode: boolean;
	// Режим «учитель»: итог — разбор «было → стало → почему».
	teach: boolean;
	// Предлагать 2–3 направления для новой страницы (дороже).
	offerVariants: boolean;
	critic: boolean;
	criticModel: string;
	// Свои имена для моделей: id -> имя.
	labels: Record<string, string>;
	// Отключённые модели (id записей списка): в выпадающем списке их нет.
	disabled: string[];
	// Выбранные уровень и Fast по ключам семейств.
	prefs: Record<string, ModelPrefs>;
};

// Запись итогового списка моделей.
export type MergedModel = {
	id: string;
	label: string;
	provider: string; // "claude" | "devin" | "acp:<агент>"
	description?: string;
	family?: ModelFamily;
	// Возможности обычной модели: Fast-режим и поддерживаемые уровни размышления
	fast?: boolean;
	levels?: string[];
	context?: number;
	price?: Price | null;
};

// Модель в каталоге провайдера. fast/levels — возможности (у моделей Claude).
export type CatalogModel = {
	id: string;
	label: string;
	description?: string;
	fast?: boolean;
	levels?: string[];
	context?: number;
	price?: Price | null;
};

// Что провайдер отдал в каталоге (ответ list_models).
export type CatalogEntry = {
	models?: CatalogModel[];
	families?: ModelFamily[];
};

export const MAX_RULES_CHARS = 8000;

export function defaultSettings(): Settings {
	return {
		rules: "",
		bridgeToken: "",
		fallbackModel: "",
		askBrief: true,
		mcpMode: false,
		teach: false,
		offerVariants: false,
		critic: true,
		criticModel: "",
		labels: {},
		disabled: [],
		prefs: {},
	};
}

// Полный id модели для сервера по провайдеру и id у провайдера.
export function modelIdOf(provider: string, model: string): string {
	if (provider === "claude") return model;
	if (provider === "devin") return `devin:${model}`;
	return `${provider}:${model}`; // acp:<агент>:<модель>
}

// Провайдер по полному id модели.
export function providerOf(id: string): string {
	if (id.startsWith("devin:")) return "devin";
	const acp = /^(acp:[^:]+):/.exec(id);
	return acp ? acp[1] : "claude";
}

// Ключ семейства в списке моделей и в настройках.
export function familyKey(provider: string, familyId: string): string {
	return `family:${provider}:${familyId}`;
}

// Уровни размышления показываем как в оригинале провайдера (Low, Medium,
// High, XHigh, Max…), без перевода.
const LEVEL_ORDER = [
	"default",
	"none",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
];

export const LEVEL_LABELS: Record<string, string> = {
	default: "Default",
	none: "None",
	minimal: "Minimal",
	low: "Low",
	medium: "Medium",
	high: "High",
	xhigh: "XHigh",
	max: "Max",
};

export function levelLabel(level: string): string {
	return LEVEL_LABELS[level] || level;
}

// Уровни, доступные у семейства, от слабого к сильному.
export function levelsOf(family: ModelFamily): string[] {
	const set = new Set(family.variants.map((v) => v.level));
	return [...set].sort((a, b) => {
		const ia = LEVEL_ORDER.indexOf(a);
		const ib = LEVEL_ORDER.indexOf(b);
		return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
	});
}

export function hasFast(family: ModelFamily): boolean {
	return family.variants.some((v) => v.fast);
}

// Есть ли Fast-вариант на этом уровне.
export function fastAvailable(family: ModelFamily, level: string): boolean {
	return family.variants.some((v) => v.fast && v.level === level);
}

// Уровень по умолчанию: «medium», потом «high», иначе первый доступный.
export function defaultLevel(family: ModelFamily): string {
	const levels = levelsOf(family);
	return (
		["medium", "high", "default"].find((l) => levels.includes(l)) ||
		levels[0]
	);
}

// Какой вариант выбран при данных опциях. Недоступное сочетание не ломает
// запрос: нет такого уровня — берём уровень по умолчанию, нет Fast на этом
// уровне — обычный вариант.
export function resolveVariant(
	family: ModelFamily,
	prefs: ModelPrefs | undefined,
): FamilyVariant {
	const levels = levelsOf(family);
	const level =
		prefs?.level && levels.includes(prefs.level)
			? prefs.level
			: defaultLevel(family);
	const wantFast = !!prefs?.fast && fastAvailable(family, level);
	return (
		family.variants.find((v) => v.level === level && v.fast === wantFast) ||
		family.variants.find((v) => v.level === level) ||
		family.variants[0]
	);
}

// Что отправлять серверу для выбранной записи списка: у обычной модели —
// её id, у семейства — id выбранного варианта с учётом уровня и Fast.
export function activeModelId(
	selectedId: string,
	merged: MergedModel[],
	prefs: Record<string, ModelPrefs>,
): string {
	const entry = merged.find((m) => m.id === selectedId);
	if (!entry?.family) return selectedId;
	const variant = resolveVariant(entry.family, prefs[entry.id]);
	return modelIdOf(entry.provider, variant.id);
}

// Уровни размышления у моделей Claude (у них нет семейств): от слабого к
// сильному. По умолчанию — medium.
export const CLAUDE_LEVELS = ["low", "medium", "high", "xhigh", "max"];
export const CLAUDE_DEFAULT_LEVEL = "medium";

// Уровень размышления для запроса: только у обычных моделей Claude.
export function activeEffort(
	selectedId: string,
	merged: MergedModel[],
	prefs: Record<string, ModelPrefs>,
): string | undefined {
	const entry = merged.find((m) => m.id === selectedId);
	if (!entry || entry.family || entry.provider !== "claude") return undefined;
	const level = prefs[entry.id]?.level;
	return level && claudeLevels(entry).includes(level)
		? level
		: CLAUDE_DEFAULT_LEVEL;
}

// Уровни обычной модели Claude: те, что она сама заявила, иначе общий набор.
export function claudeLevels(entry: MergedModel): string[] {
	return entry.levels && entry.levels.length ? entry.levels : CLAUDE_LEVELS;
}

// Включён ли Fast у обычной модели Claude (только если модель его поддерживает).
export function activeFast(
	selectedId: string,
	merged: MergedModel[],
	prefs: Record<string, ModelPrefs>,
): boolean {
	const entry = merged.find((m) => m.id === selectedId);
	return (
		!!entry &&
		!entry.family &&
		entry.provider === "claude" &&
		!!entry.fast &&
		!!prefs[entry.id]?.fast
	);
}

// Приводит прочитанное из хранилища к безопасному виду.
export function normalizeSettings(raw: unknown): Settings {
	const out = defaultSettings();
	if (!raw || typeof raw !== "object") return out;
	const data = raw as Partial<Settings>;
	if (typeof data.rules === "string")
		out.rules = data.rules.slice(0, MAX_RULES_CHARS);
	if (typeof data.bridgeToken === "string")
		out.bridgeToken = data.bridgeToken.slice(0, 200);
	if (typeof data.fallbackModel === "string")
		out.fallbackModel = data.fallbackModel;
	if (typeof data.askBrief === "boolean") out.askBrief = data.askBrief;
	if (typeof data.mcpMode === "boolean") out.mcpMode = data.mcpMode;
	if (typeof data.teach === "boolean") out.teach = data.teach;
	if (typeof data.offerVariants === "boolean") out.offerVariants = data.offerVariants;
	if (typeof data.critic === "boolean") out.critic = data.critic;
	if (typeof data.criticModel === "string")
		out.criticModel = data.criticModel;
	if (data.labels && typeof data.labels === "object") {
		for (const [id, label] of Object.entries(data.labels)) {
			if (typeof label === "string" && label.trim())
				out.labels[id] = label.trim();
		}
	}
	if (Array.isArray(data.disabled)) {
		out.disabled = [
			...new Set(
				data.disabled.filter(
					(id): id is string => typeof id === "string" && !!id,
				),
			),
		];
	}
	if (data.prefs && typeof data.prefs === "object") {
		for (const [key, p] of Object.entries(data.prefs)) {
			if (!p || typeof p !== "object") continue;
			out.prefs[key] = {
				...(typeof p.level === "string" ? { level: p.level } : {}),
				...(typeof p.fast === "boolean" ? { fast: p.fast } : {}),
			};
		}
	}
	return out;
}

// Устаревшие и служебные модели в списке не показываем: Fusion, Adaptive,
// GPT кроме 6-го поколения, Claude кроме 5-го поколения,
// SWE кроме второго поколения, Gemini/Grok/GLM/Kimi кроме выбранных версий.
export function isHiddenModel(id: string, label: string): boolean {
	const text = `${id} ${label}`.toLowerCase();
	if (/fusion/.test(text)) return true;
	// Fable из Claude ACP скрыт (у Devin Fable остаётся: там id claude-fable-…)
	if (id === "fable" || /^fable( |$)/.test(label.toLowerCase())) return true;
	// DeepSeek: остаются V4.1 Flash и V4 Pro
	if (/deepseek/.test(text) && !/v4[-.]1|pro/.test(text)) return true;
	// Opus с окном контекста 1M скрыт (алиас opus[1m])
	if (/opus/.test(text) && /1m/.test(text)) return true;
	// Sonnet: версии кроме 5-го поколения скрыты; алиас без версии остаётся
	const sonnet = /sonnet\D*(\d+)/.exec(text);
	if (sonnet && sonnet[1] !== "5") return true;
	if (id === "default" || /^default( |$)/.test(label.toLowerCase()))
		return true;
	// Голый алиас "GPT-6 Sol" — дубль семейства; варианты с уровнем
	// (gpt-6-sol-none/-low/…-max, -priority) — настоящая модель, видны.
	if (/gpt[-\s]?6[-\s]sol$/.test(text)) return true;
	if (/(^|[\s:-])adaptive/.test(text)) return true;
	// GPT: видно только 6-е поколение (astra/sol/luna, 6.1).
	const gpt = /gpt[-\s]?(\d+)/.exec(text);
	if (gpt && gpt[1] !== "6") return true;
	// Claude: видно 5-е поколение целиком (5, 5.1, 5.5 …), 4.x — нет.
	const claude = /claude[-\s](?:[a-z]+[-\s])?(\d+)/.exec(text);
	if (claude && claude[1] !== "5") return true;
	const swe = /swe[-\s]?(\d+)/.exec(text);
	if (swe && swe[1] !== "2") return true;
	// Из остальных семейств оставляем только выбранные версии.
	if (/gemini/.test(text) && !/gemini[-\s]?(3[-.]8|4)/.test(text))
		return true;
	if (/grok/.test(text) && !/grok[-\s]?4[-.]7/.test(text)) return true;
	if (/glm/.test(text) && !/glm[-\s]?5[-.]3/.test(text)) return true;
	if (/kimi/.test(text) && !/kimi[-\s]?k3/.test(text)) return true;
	return false;
}

// Порядок групп моделей по вендору; неизвестные — в конце.
const VENDOR_ORDER = [
	"claude",
	"gpt",
	"gemini",
	"grok",
	"glm",
	"kimi",
	"swe",
	"deepseek",
	"nemotron",
];

function vendorRank(m: MergedModel): number {
	const text = `${m.id} ${m.label}`.toLowerCase();
	const i = VENDOR_ORDER.findIndex((v) => text.includes(v));
	// Алиасы Claude (sonnet/opus/haiku) — к группе Claude
	if (i < 0 && /(sonnet|opus|haiku|fable)/.test(text)) return 0;
	return i < 0 ? VENDOR_ORDER.length : i;
}

// Внутри каждого провайдера — по группам вендоров, затем по названию.
// Порядок провайдеров — из списка сервера (providerOrder): его нельзя брать
// из порядка моделей — встроенные модели вычёркиваются каталогом, и группы
// «прыгали» в зависимости от того, какой каталог успел загрузиться.
function sortModels(
	list: MergedModel[],
	providerOrder: string[],
): MergedModel[] {
	const rank = (p: string) => {
		const i = providerOrder.indexOf(p);
		return i < 0 ? providerOrder.length : i;
	};
	return list
		.map((m, i) => ({ m, i }))
		.sort(
			(a, b) =>
				rank(a.m.provider) - rank(b.m.provider) ||
				vendorRank(a.m) - vendorRank(b.m) ||
				a.m.label.localeCompare(b.m.label, "en", { numeric: true }) ||
				a.i - b.i,
		)
		.map((x) => x.m);
}

// Все модели: встроенные модели сервера + каталоги провайдеров (семейства
// одной записью, одиночные модели как есть). Названия из настроек перекрывают
// стандартные. Встроенная модель, которая уже есть в загруженном каталоге
// своего провайдера, не дублируется.
export function allModels(
	serverModels: { id: string; label: string }[],
	catalog: Record<string, CatalogEntry | undefined>,
	providers: { id: string }[],
	settings: Settings,
): MergedModel[] {
	const out: MergedModel[] = [];
	const seen = new Set<string>();
	const push = (entry: MergedModel) => {
		if (seen.has(entry.id)) return;
		if (isHiddenModel(entry.id, entry.label)) return;
		seen.add(entry.id);
		out.push({ ...entry, label: settings.labels[entry.id] || entry.label });
	};
	// Идентификаторы, которые уже покрыты каталогами (для отсева дублей).
	const covered = new Set<string>();
	for (const [provider, entry] of Object.entries(catalog)) {
		for (const m of entry?.models || [])
			covered.add(modelIdOf(provider, m.id));
	}
	for (const m of serverModels) {
		if (covered.has(m.id)) continue;
		push({ id: m.id, label: m.label, provider: providerOf(m.id) });
	}
	// Провайдеры в порядке, который прислал сервер; неизвестные — следом.
	const order = [...providers.map((p) => p.id), ...Object.keys(catalog)];
	const providerOrder = [...new Set(order)];
	for (const provider of providerOrder) {
		const entry = catalog[provider];
		if (!entry) continue;
		const inFamily = new Set<string>();
		for (const f of entry.families || []) {
			for (const v of f.variants) inFamily.add(v.id);
			push({
				id: familyKey(provider, f.id),
				label: f.label,
				provider,
				family: f,
			});
		}
		for (const m of entry.models || []) {
			if (inFamily.has(m.id)) continue;
			push({
				id: modelIdOf(provider, m.id),
				label: m.label || m.id,
				provider,
				description: m.description,
				fast: m.fast,
				levels: m.levels,
				context: m.context,
				price: m.price,
			});
		}
	}
	return sortModels(out, providerOrder);
}

// Включённые модели: то, что показывается в выпадающем списке у поля ввода.
export function enabledModels(
	all: MergedModel[],
	settings: Settings,
): MergedModel[] {
	const off = new Set(settings.disabled);
	return all.filter((m) => !off.has(m.id));
}

// Окно контекста для карточки: 1000000 -> «1M», 200000 -> «200K».
export function formatContext(tokens: number | undefined): string {
	if (!tokens || tokens <= 0) return "";
	if (tokens >= 1_000_000) return `${+(tokens / 1_000_000).toFixed(1)}M`;
	return `${Math.round(tokens / 1000)}K`;
}

// Сведения о модели для карточки при наведении в списке: с учётом
// выбранных сейчас уровня и Fast.
export function modelInfo(
	m: MergedModel,
	prefs: Record<string, ModelPrefs>,
): {
	title: string;
	levels: string[];
	current: string; // выбранный уровень (пусто, если выбирать не из чего)
	context: string;
	fast: boolean; // Fast есть у модели
	fastOn: boolean; // и включён
	fastAvail: boolean; // и доступен на выбранном уровне
	price?: Price;
	free: boolean; // у модели Devin нет цены в каталоге — бесплатная
} {
	const levels = m.family
		? levelsOf(m.family)
		: m.provider === "claude"
			? claudeLevels(m)
			: [];
	let current = "";
	let fastOn = false;
	let price: Price | null | undefined = m.price;
	if (m.family) {
		const v = resolveVariant(m.family, prefs[m.id]);
		current = v.level;
		fastOn = v.fast;
		// Цена выбранного варианта (уровень и Fast), а не семейства в целом
		price = v.price;
	} else if (levels.length) {
		const lv = prefs[m.id]?.level;
		current = lv && levels.includes(lv) ? lv : CLAUDE_DEFAULT_LEVEL;
		fastOn = !!m.fast && !!prefs[m.id]?.fast;
	}
	return {
		title: m.label,
		levels,
		current,
		context: formatContext(m.family?.context ?? m.context),
		fast: m.family ? hasFast(m.family) : !!m.fast,
		fastOn,
		fastAvail: m.family ? fastAvailable(m.family, current) : !!m.fast,
		price: price || undefined,
		// Бесплатно — только если каталог явно сказал «цены нет» (null)
		free: price === null && m.provider === "devin",
	};
}

// Цена для карточки: 4 -> «$4», 0.2 -> «$0.20», нет данных -> «—».
export function formatPrice(value: number | undefined): string {
	if (value === undefined) return "—";
	if (value >= 1) return `$${+value.toFixed(2)}`;
	// Мелкие цены (кэш Haiku — $0.005) без потери значимых знаков
	const fixed = value.toFixed(3);
	return `$${fixed.endsWith("0") ? value.toFixed(2) : fixed}`;
}
