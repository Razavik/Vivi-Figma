// Настройки плагина: правила для агента и список моделей. Доступны все модели
// подключённых провайдеров (Claude, Devin, ACP-агенты) — здесь их можно
// отключить, чтобы не засорять список у поля ввода, и переименовать.
// Хранятся в figma.clientStorage через code.ts. Команды ACP-агентов здесь
// НЕ задаются — они регистрируются на сервере (server/agents.json), иначе
// любой локальный клиент мог бы заставить сервер запустить произвольную
// программу.
import { S } from "./ui-state";
import { refreshModels } from "./models";
import { customSelect } from "./select";
import {
	MAX_RULES_CHARS,
	type MergedModel,
	allModels,
	enabledModels,
} from "./settings-core";

export {
	MAX_RULES_CHARS,
	defaultSettings,
	normalizeSettings,
	type Settings,
} from "./settings-core";

let panel: HTMLElement | null = null;
// Запрос каталога моделей провайдера у сервера (ставит ui.ts).
let requestModels: (provider: string, force: boolean) => void = () => {};
let post: (message: Record<string, unknown>) => void = () => {};
let saveTimer: number | undefined;
let query = "";
let redrawModels: (() => void) | null = null;
let bridgeTokenChange: () => void = () => {};

export function setBridgeTokenChangeHandler(fn: () => void): void {
	bridgeTokenChange = fn;
}

// Сохранить настройки сразу (например, после выбора уровня размышления).
export function saveSettingsNow(): void {
	post({ type: "save_settings", data: S.settings });
}

function save(): void {
	window.clearTimeout(saveTimer);
	saveTimer = window.setTimeout(saveSettingsNow, 300);
}

function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className?: string,
	text?: string,
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

function section(
	parent: HTMLElement,
	title: string,
	hint?: string,
): HTMLElement {
	const box = el("section", "st-section");
	box.appendChild(el("h3", "st-title", title));
	if (hint) box.appendChild(el("p", "st-hint", hint));
	parent.appendChild(box);
	return box;
}

function providerName(id: string): string {
	const found = S.providers.find((p) => p.id === id)?.label;
	if (found) return found;
	if (id === "claude") return "Claude";
	if (id === "devin") return "Devin";
	return id.replace(/^acp:/, "");
}

function renderRules(parent: HTMLElement): void {
	const box = section(parent, "Правила");
	const area = el("textarea", "st-input st-rules");
	area.rows = 6;
	area.maxLength = MAX_RULES_CHARS;
	area.placeholder =
		"Например:\n— основной цвет #FF5500, шрифт Inter\n— кнопки со скруглением 8, названия слоёв по-английски";
	area.value = S.settings.rules;
	const counter = el("div", "st-counter");
	const update = () => {
		counter.textContent = `${area.value.length} / ${MAX_RULES_CHARS}`;
	};
	update();
	area.oninput = () => {
		S.settings.rules = area.value;
		update();
		save();
	};
	box.append(area, counter);
}

function renderBridgeSettings(parent: HTMLElement): void {
	const box = section(parent, "Подключение к мосту");
	const label = el("label", "st-row");
	label.appendChild(el("span", "st-model-name", "Токен моста"));
	const token = el("input", "st-input");
	token.type = "password";
	token.autocomplete = "off";
	token.maxLength = 200;
	token.value = S.settings.bridgeToken;
	token.oninput = () => {
		S.settings.bridgeToken = token.value.slice(0, 200);
		save();
	};
	token.onchange = () => {
		bridgeTokenChange();
	};
	label.appendChild(token);
	box.appendChild(label);
}

// Строка «подпись — переключатель» (как у списка моделей).
function toggleRow(
	box: HTMLElement,
	text: string,
	get: () => boolean,
	set: (v: boolean) => void,
): void {
	const row = el("label", "st-row st-model-row st-toggle");
	const input = el("input");
	input.type = "checkbox";
	input.checked = get();
	input.onchange = () => {
		set(input.checked);
		save();
	};
	const sw = el("span", "st-switch");
	sw.append(input, el("span", "st-switch-track"));
	row.append(el("span", "st-toggle-text", text), sw);
	box.appendChild(row);
}

function renderBrief(parent: HTMLElement): void {
	const box = section(parent, "Уточнения");
	toggleRow(
		box,
		"Уточнять перед большими задачами",
		() => S.settings.askBrief,
		(v) => (S.settings.askBrief = v),
	);
	toggleRow(
		box,
		"Объяснять правки (разбор «было → стало → почему»)",
		() => S.settings.teach,
		(v) => (S.settings.teach = v),
	);
	toggleRow(
		box,
		"Предлагать направления для новой страницы (дороже)",
		() => S.settings.offerVariants,
		(v) => (S.settings.offerVariants = v),
	);
}

function renderCritic(parent: HTMLElement): void {
	const box = section(parent, "Независимая проверка");
	toggleRow(
		box,
		"Проверять результат отдельным критиком",
		() => S.settings.critic,
		(v) => (S.settings.critic = v),
	);
	box.appendChild(
		customSelect(
			[{ value: "", label: "Та же модель" }, ...S.merged.map((m) => ({ value: m.id, label: m.label }))],
			S.settings.criticModel,
			(v) => {
				S.settings.criticModel = v;
				save();
			},
		),
	);
}

function renderFallbackModel(parent: HTMLElement): void {
	const box = section(parent, "Запасная модель");
	box.classList.add("st-fallback");
	box.appendChild(
		customSelect(
			[{ value: "", label: "Нет" }, ...S.merged.map((m) => ({ value: m.id, label: m.label }))],
			S.settings.fallbackModel,
			(v) => {
				S.settings.fallbackModel = v;
				save();
			},
		),
	);
}

// Сколько моделей сейчас включено (хотя бы одна должна остаться).
function enabledCount(all: MergedModel[]): number {
	return enabledModels(all, S.settings).length;
}

function renderModelRow(
	list: HTMLElement,
	m: MergedModel,
	all: MergedModel[],
	onToggle: () => void,
	notice: HTMLElement,
): void {
	const row = el("div", "st-row st-model-row");
	const off = S.settings.disabled.includes(m.id);
	if (off) row.classList.add("off");

	// Переключатель вкл/выкл
	const switchLabel = el("label", "st-switch");
	const box = el("input");
	box.type = "checkbox";
	box.checked = !off;
	box.onchange = () => {
		if (!box.checked) {
			if (enabledCount(all) <= 1) {
				box.checked = true;
				notice.textContent =
					"Хотя бы одна модель должна остаться включённой";
				return;
			}
			if (!S.settings.disabled.includes(m.id))
				S.settings.disabled.push(m.id);
		} else {
			S.settings.disabled = S.settings.disabled.filter(
				(id) => id !== m.id,
			);
		}
		notice.textContent = "";
		save();
		refreshModels();
		onToggle();
	};
	switchLabel.append(box, el("span", "st-switch-track"));

	const name = el("span", "st-model-name", m.label);
	name.title = m.id;
	row.append(name, switchLabel);
	list.appendChild(row);
}

function renderModels(parent: HTMLElement): void {
	const box = section(parent, "Модели");
	const bar = el("div", "st-toolbar");
	const search = el("input", "st-input");
	search.placeholder = "Поиск модели…";
	search.value = query;
	const refresh = el("button", "st-refresh");
	refresh.appendChild(el("span", "st-refresh-icon", "↻"));
	refresh.type = "button";
	refresh.title = "Обновить списки моделей";
	bar.append(search, refresh);
	const notice = el("div", "st-error");
	const list = el("div", "st-list");
	box.append(bar, notice, list);

	// Крутится с клика и до конца загрузки (минимум 700 мс — виден и быстрый ответ).
	let spinSince = 0;
	let spinTimer: number | undefined;
	const updateSpin = () => {
		window.clearTimeout(spinTimer);
		const loading = S.providers.some((p) => S.catalog[p.id]?.loading);
		const rest = spinSince ? 700 - (Date.now() - spinSince) : 0;
		if (loading || rest > 0) {
			refresh.classList.add("spin");
			if (!loading) spinTimer = window.setTimeout(updateSpin, rest);
		} else {
			spinSince = 0;
			refresh.classList.remove("spin");
		}
	};
	const draw = () => {
		updateSpin();
		list.textContent = "";
		const all = allModels(
			S.serverModels,
			S.catalog,
			S.providers,
			S.settings,
		);
		box.querySelector(".st-fallback")?.remove();
		renderFallbackModel(box);
		const q = query.trim().toLowerCase();
		const providers = [...new Set(all.map((m) => m.provider))];
		// Провайдеры, у которых список ещё грузится или не получился, тоже видны.
		for (const p of S.providers)
			if (!providers.includes(p.id)) providers.push(p.id);
		let shown = 0;
		for (const provider of providers) {
			const items = all.filter((m) => m.provider === provider);
			const entry = S.catalog[provider];
			const filtered = q
				? items.filter((m) =>
						`${m.label} ${m.id} ${m.description || ""}`
							.toLowerCase()
							.includes(q),
					)
				: items;
			if (q && !filtered.length) continue;
			const head = el("div", "st-group");
			const on = items.filter(
				(m) => !S.settings.disabled.includes(m.id),
			).length;
			head.append(
				el("span", "st-group-name", providerName(provider)),
				el("span", "st-group-count", `${on} / ${items.length}`),
			);
			// Массовое включение/отключение провайдера
			const bulk = el("span", "st-bulk");
			const allOn = el("button", "st-link", "Все");
			const allOff = el("button", "st-link", "Никакие");
			allOn.type = "button";
			allOff.type = "button";
			allOn.onclick = () => {
				const ids = new Set(items.map((m) => m.id));
				S.settings.disabled = S.settings.disabled.filter(
					(id) => !ids.has(id),
				);
				notice.textContent = "";
				save();
				refreshModels();
				draw();
			};
			allOff.onclick = () => {
				const ids = new Set(items.map((m) => m.id));
				const rest = all.filter(
					(m) =>
						!ids.has(m.id) && !S.settings.disabled.includes(m.id),
				);
				if (!rest.length) {
					notice.textContent =
						"Хотя бы одна модель должна остаться включённой";
					return;
				}
				S.settings.disabled = [
					...new Set([...S.settings.disabled, ...ids]),
				];
				notice.textContent = "";
				save();
				refreshModels();
				draw();
			};
			bulk.append(allOn, allOff);
			head.appendChild(bulk);
			list.appendChild(head);
			if (entry?.loading && !items.length) {
				list.appendChild(el("div", "st-note", "Загрузка списка…"));
			}
			if (entry?.error) {
				list.appendChild(
					el("div", "st-note st-note-error", entry.error),
				);
			}
			if (entry?.note) {
				list.appendChild(
					el("div", "st-note st-note-error", entry.note),
				);
			}
			for (const m of filtered) {
				shown++;
				renderModelRow(list, m, all, draw, notice);
			}
		}
		if (!shown)
			list.appendChild(
				el("div", "st-note", q ? "Ничего не найдено" : "Список пуст"),
			);
	};
	redrawModels = draw;
	search.oninput = () => {
		query = search.value;
		draw();
	};
	refresh.onclick = () => {
		spinSince = Date.now();
		for (const p of S.providers) {
			requestModels(p.id, true);
		}
		draw();
	};
	draw();
}

function render(): void {
	if (!panel) return;
	const body = panel.querySelector(".st-body") as HTMLElement;
	const scroll = body.scrollTop;
	body.textContent = "";
	renderBridgeSettings(body);
	renderRules(body);
	renderBrief(body);
	renderCritic(body);
	renderModels(body);
	body.scrollTop = scroll;
}

// Настройки выезжают справа поверх чата и уезжают обратно (анимация в CSS).
export function openSettings(): void {
	if (!panel) return;
	render();
	panel.classList.remove("out");
	panel.hidden = false;
	panel.classList.add("in");
}

export function closeSettings(): void {
	if (!panel || panel.hidden || panel.classList.contains("out")) return;
	const node = panel;
	node.classList.remove("in");
	node.classList.add("out");
	const done = () => {
		node.hidden = true;
		node.classList.remove("out");
	};
	node.addEventListener("animationend", done, { once: true });
	// Страховка, если анимации отключены или событие не пришло
	window.setTimeout(() => node.classList.contains("out") && done(), 400);
}

// Пришли настройки из хранилища или список от сервера: обновляем открытый экран.
export function refreshSettingsView(): void {
	if (panel && !panel.hidden) render();
}

// Пришёл каталог моделей провайдера: перерисовываем только список моделей,
// чтобы не сбивать ввод в правилах.
export function onCatalogUpdate(): void {
	if (panel && !panel.hidden) redrawModels?.();
}

export function initSettings(
	root: HTMLElement,
	button: HTMLButtonElement,
	send: (message: Record<string, unknown>) => void,
	listModels: (provider: string, force: boolean) => void,
): void {
	post = send;
	requestModels = listModels;
	panel = root;
	root.hidden = true;
	const head = el("div", "st-head");
	const close = el("button", "st-close");
	close.type = "button";
	close.title = "Закрыть";
	close.innerHTML =
		'<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>';
	close.onclick = closeSettings;
	head.append(el("span", "st-head-title", "Настройки"), close);
	root.append(head, el("div", "st-body"));
	button.onclick = () =>
		root.hidden || root.classList.contains("out")
			? openSettings()
			: closeSettings();
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && !root.hidden) closeSettings();
	});
}
