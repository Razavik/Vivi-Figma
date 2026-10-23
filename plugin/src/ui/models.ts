// Кастомный дропдаун моделей, группировка по провайдеру:
// "devin:*" -> Devin, остальное -> Claude.
import { S, modelLabels } from "./ui-state";
import { persistChat } from "./chat";
import { renderRing } from "./context-ring";
import {
	type MergedModel,
	activeEffort as effortOf,
	activeFast as fastOf,
	activeModelId,
	allModels,
	enabledModels,
	resolveVariant,
	formatPrice,
	levelLabel,
	modelInfo,
} from "./settings-core";
import { resolveModelSelection } from "./model-selection";

// Вызывается при смене выбранной модели или обновлении списка: ui.ts
// показывает/прячет опции уровня размышления и Fast.
let onModelChange: () => void = () => {};
export function setModelChangeHandler(fn: () => void): void {
	onModelChange = fn;
}

// Что отправлять серверу: для обычной модели её id, для семейства — id
// варианта с учётом выбранных уровня размышления и Fast.
export function activeModel(): string {
	return activeModelId(S.currentModel, S.merged, S.settings.prefs);
}

// Уровень размышления для запроса (только у моделей Claude).
export function activeEffort(): string | undefined {
	return effortOf(S.currentModel, S.merged, S.settings.prefs);
}

// Fast-режим для запроса (только у моделей Claude, которые его поддерживают).
export function activeFast(): boolean {
	return fastOf(S.currentModel, S.merged, S.settings.prefs);
}

const modelDd = document.getElementById("model-dd") as HTMLDivElement;
const modelBtn = document.getElementById("model-btn") as HTMLButtonElement;
const modelLabel = modelBtn.querySelector(".label") as HTMLElement;
const ddList = document.getElementById("dd-list") as HTMLDivElement;
// Прокручиваемая часть списка: поиск над ней закреплён, полоса прокрутки начинается под ним.
const ddScroll = document.createElement("div");
ddScroll.className = "dd-scroll";
const sendBtn = document.getElementById("send") as HTMLButtonElement;

const TICK_SVG = `<svg class="tick" width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5.5l2.3 2.3L8.5 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Название группы в списке по id провайдера (claude | devin | acp:<агент>).
function providerLabel(id: string): string {
	const found = S.providers.find((p) => p.id === id)?.label;
	if (found) return found;
	if (id === "claude") return "Claude";
	if (id === "devin") return "Devin";
	return id.replace(/^acp:/, "");
}

// Доступны все модели провайдеров; отключённые в настройках скрыты.
export function refreshModels(): void {
	const all = allModels(S.serverModels, S.catalog, S.providers, S.settings);
	fillModels(enabledModels(all, S.settings));
}

const modelTag = document.createElement("span");
modelTag.className = "pill-tag";
modelLabel.after(modelTag);

function updateModelBtn(): void {
	modelLabel.textContent = modelLabels.get(S.currentModel) || "Модель…";
	updateModelTag();
	// Окно контекста зависит от модели (и появляется, когда список загружен).
	renderRing();
}

// Выбранные уровень размышления и Fast рядом с названием на кнопке модели.
function updateModelTag(): void {
	modelTag.textContent = "";
	const m = S.merged.find((x) => x.id === S.currentModel);
	if (!m) return;
	const info = modelInfo(m, S.settings.prefs);
	modelTag.textContent = tagText(info.current, info.fastOn, info.free);
}

// Текст метки: уровень, Free (цены нет в каталоге) и Fast, если режим включён.
function tagText(level: string, fast: boolean, free: boolean): string {
	return [
		level ? levelLabel(level) : "",
		free ? "Free" : "",
		fast ? "Fast" : "",
	]
		.filter(Boolean)
		.join(" · ");
}

// Приглушённая метка у модели в списке: выбранный уровень размышления и Fast.
export function refreshItemTags(): void {
	updateModelTag();
	for (const item of Array.from(
		ddList.querySelectorAll<HTMLElement>(".dd-item"),
	)) {
		item.querySelector(".dd-tag")?.remove();
		const m = S.merged.find((x) => x.id === item.dataset.id);
		if (!m) continue;
		const info = modelInfo(m, S.settings.prefs);
		if (!info.current && !info.fastOn && !info.free) continue;
		const tag = document.createElement("span");
		tag.className = "dd-tag";
		tag.textContent = tagText(info.current, info.fastOn, info.free);
		item.appendChild(tag);
	}
}

function markActiveItem(): void {
	for (const item of Array.from(
		ddList.querySelectorAll<HTMLElement>(".dd-item"),
	)) {
		item.classList.toggle("active", item.dataset.id === S.currentModel);
	}
}

// Поиск вверху списка моделей: закреплён, не прокручивается вместе со списком.
const searchWrap = document.createElement("div");
searchWrap.className = "dd-search";
const searchInput = document.createElement("input");
searchInput.type = "text";
searchInput.placeholder = "Поиск модели…";
const searchBox = document.createElement("div");
searchBox.className = "dd-search-box";
searchBox.insertAdjacentHTML(
	"afterbegin",
	'<svg class="dd-search-icon" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>',
);
const searchClear = document.createElement("button");
searchClear.type = "button";
searchClear.className = "dd-search-clear";
searchClear.title = "Очистить";
searchClear.hidden = true;
searchClear.insertAdjacentHTML(
	"afterbegin",
	'<svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 2l6 6M8 2l-6 6"/></svg>',
);
searchBox.append(searchInput, searchClear);
// Кнопка перезагрузки справа от поиска: заново запрашивает списки моделей у провайдеров.
const searchRefresh = document.createElement("button");
searchRefresh.type = "button";
searchRefresh.className = "dd-refresh";
searchRefresh.title = "Обновить списки моделей";
searchRefresh.insertAdjacentHTML(
	"afterbegin",
	'<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 8a5.5 5.5 0 1 1-1.8-4.1"/><path d="M13.5 2.5v3h-3"/></svg>',
);
let onReload: () => void = () => {};
export function setReloadHandler(fn: () => void): void {
	onReload = fn;
}
// Крутится с клика и до конца загрузки (минимум MIN_SPIN мс, чтобы быстрый
// ответ из кэша тоже был виден).
const MIN_SPIN = 700;
let spinSince = 0;
let spinTimer: number | undefined;
function updateSpin(): void {
	window.clearTimeout(spinTimer);
	const loading = S.providers.some((p) => S.catalog[p.id]?.loading);
	const rest = spinSince ? MIN_SPIN - (Date.now() - spinSince) : 0;
	if (loading || rest > 0) {
		searchRefresh.classList.add("spin");
		if (!loading) spinTimer = window.setTimeout(updateSpin, rest);
	} else {
		spinSince = 0;
		searchRefresh.classList.remove("spin");
	}
}
searchRefresh.onclick = () => {
	spinSince = Date.now();
	updateSpin();
	onReload();
	updateSpin();
};
searchWrap.append(searchBox, searchRefresh);

// Скрывает модели, не подходящие под запрос, и группы без подходящих моделей.
function applySearch(): void {
	const q = searchInput.value.trim().toLowerCase();
	let group: HTMLElement | null = null;
	let shown = 0;
	const flush = () => {
		if (group) group.hidden = shown === 0;
	};
	for (const child of Array.from(ddScroll.children) as HTMLElement[]) {
		if (child === searchWrap) continue;
		if (child.classList.contains("dd-group")) {
			flush();
			group = child;
			shown = 0;
			continue;
		}
		const text =
			`${modelLabels.get(child.dataset.id || "") || ""} ${child.dataset.id || ""}`.toLowerCase();
		const match = !q || text.includes(q);
		child.hidden = !match;
		if (match) shown++;
	}
	flush();
}
searchInput.oninput = () => {
	searchClear.hidden = !searchInput.value;
	applySearch();
};
searchClear.onclick = () => {
	searchInput.value = "";
	searchClear.hidden = true;
	applySearch();
	searchInput.focus();
};

export function fillModels(models: MergedModel[]): void {
	S.merged = models;
	ddList.innerHTML = "";
	ddScroll.innerHTML = "";
	ddList.append(searchWrap, ddScroll);
	modelLabels.clear();
	for (const m of models) {
		modelLabels.set(m.id, m.label);
		const provider = providerLabel(m.provider);
		// Поиск без селектора: имя провайдера может содержать кавычки.
		const hasGroup = Array.from(ddScroll.children).some(
			(c) => (c as HTMLElement).dataset.group === provider,
		);
		if (!hasGroup) {
			const head = document.createElement("div");
			head.className = "dd-group";
			head.dataset.group = provider;
			head.textContent = provider;
			ddScroll.appendChild(head);
		}
		const item = document.createElement("button");
		item.className = "dd-item";
		item.dataset.id = m.id;
		item.innerHTML = `${TICK_SVG}<span></span>`;
		(item.lastElementChild as HTMLElement).textContent = m.label;
		item.onclick = () => {
			S.currentModel = m.id;
			// Ручной выбор — новое предпочтение, оно переживёт fallback и refresh.
			S.savedModel = m.id;
			S.modelChosenByUser = true;
			updateModelBtn();
			markActiveItem();
			closeDropdown();
			persistChat();
			onModelChange();
		};
		item.onmouseenter = () => showInfo(m, item);
		ddScroll.appendChild(item);
	}
	applySearch();
	// Крутится, пока хотя бы один провайдер отдаёт список
	updateSpin();
	// Выбор сохраняется при обновлении списка: предпочтение (saved) важнее
	// временного fallback'а и переживает пустые/частичные списки.
	const sel = resolveModelSelection(
		S.currentModel,
		S.savedModel,
		models,
		S.settings.prefs,
	);
	S.currentModel = sel.currentModel;
	S.savedModel = sel.savedModel;
	updateModelBtn();
	markActiveItem();
	modelBtn.disabled = models.length === 0;
	sendBtn.disabled = models.length === 0;
	refreshItemTags();
	// Выбор определён — показываем опции (уровень размышления, Fast) под него.
	onModelChange();
}

// Вызывается, когда в карточке изменили Fast: ui.ts сохраняет настройки.
let onPrefsChange: () => void = () => {};
export function setPrefsChangeHandler(fn: () => void): void {
	onPrefsChange = fn;
}

// Карточка модели справа от списка при наведении: название, уровни, контекст, Fast.
const infoCard = document.createElement("div");
infoCard.className = "model-info";
infoCard.hidden = true;
document.body.appendChild(infoCard);

function infoEl(tag: string, cls: string, text?: string): HTMLElement {
	const node = document.createElement(tag);
	node.className = cls;
	if (text !== undefined) node.textContent = text;
	return node;
}

// Раскрыт ли список уровней в карточке; сбрасывается при наведении на другую модель.
let levelsOpen = false;
let infoModel = "";

function showInfo(m: MergedModel, item: HTMLElement): void {
	cancelHide();
	if (infoModel !== m.id) levelsOpen = false;
	infoModel = m.id;
	const info = modelInfo(m, S.settings.prefs);
	infoCard.textContent = "";
	// Заголовок: название и выбранный сейчас уровень приглушённо
	const head = infoEl("div", "mi-head");
	head.appendChild(infoEl("span", "mi-title", info.title));
	// Рядом с названием в карточке: Free (цены нет в каталоге) и Fast, если включён
	const tags = [info.free ? "Free" : "", info.fastOn ? "Fast" : ""].filter(
		Boolean,
	);
	if (tags.length)
		head.appendChild(infoEl("span", "mi-sub", tags.join(" · ")));
	infoCard.appendChild(head);
	if (info.context)
		infoCard.appendChild(
			infoEl("div", "mi-muted", `${info.context} контекст`),
		);
	if (info.levels.length) {
		// Селект уровня: строка «Размышление — значение ▾», список раскрывается в карточке
		const row = infoEl("div", "mi-line");
		const select = infoEl(
			"button",
			levelsOpen ? "mi-select open" : "mi-select",
		);
		select.append(infoEl("span", "", levelLabel(info.current)));
		select.insertAdjacentHTML(
			"beforeend",
			'<svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
		);
		select.onclick = (e) => {
			e.stopPropagation();
			levelsOpen = !levelsOpen;
			showInfo(m, item);
		};
		// Список раскрывается поверх карточки, не меняя её размер
		const wrap = infoEl("span", "mi-select-wrap");
		wrap.appendChild(select);
		row.append(infoEl("span", "mi-label", "Размышление"), wrap);
		infoCard.appendChild(row);
		if (levelsOpen) {
			const list = infoEl("div", "mi-options");
			for (const level of info.levels) {
				const opt = infoEl(
					"button",
					level === info.current ? "mi-opt on" : "mi-opt",
				);
				opt.append(infoEl("span", "", levelLabel(level)));
				opt.insertAdjacentHTML("beforeend", TICK_SVG);
				opt.onclick = (e) => {
					e.stopPropagation();
					levelsOpen = false;
					S.settings.prefs[m.id] = {
						...S.settings.prefs[m.id],
						level,
					};
					onPrefsChange();
					showInfo(m, item);
				};
				list.appendChild(opt);
			}
			wrap.appendChild(list);
			// Не хватает места снизу — открываем вверх
			requestAnimationFrame(() => {
				if (
					list.getBoundingClientRect().bottom >
					window.innerHeight - 6
				)
					list.classList.add("up");
			});
		}
	}
	if (info.fast) {
		const row = infoEl("div", "mi-line");
		const sw = infoEl("button", info.fastOn ? "mi-switch on" : "mi-switch");
		if (!info.fastAvail) {
			sw.classList.add("unavailable");
			sw.title = "Fast недоступен на этом уровне размышления";
		}
		sw.onclick = (e) => {
			// Карточка перерисуется: не даём клику дойти до закрытия списка
			e.stopPropagation();
			if (!info.fastAvail) return;
			S.settings.prefs[m.id] = {
				...S.settings.prefs[m.id],
				fast: !info.fastOn,
			};
			// Для семейства выбранный уровень фиксируем, чтобы он не «прыгнул»
			if (m.family)
				S.settings.prefs[m.id].level = resolveVariant(
					m.family,
					S.settings.prefs[m.id],
				).level;
			onPrefsChange();
			showInfo(m, item);
		};
		row.append(infoEl("span", "mi-label", "Fast-режим"), sw);
		infoCard.appendChild(row);
	}
	if (info.price) {
		infoCard.appendChild(infoEl("hr", "mi-sep"));
		const grid = infoEl("div", "mi-prices");
		for (const [name, value] of [
			["Ввод", info.price.input],
			["Кэш ввода", info.price.cached],
			["Вывод", info.price.output],
		] as const) {
			const cell = infoEl("div", "mi-price");
			const val = infoEl("span", "mi-price-val", formatPrice(value));
			cell.append(infoEl("span", "mi-price-name", name), val);
			grid.appendChild(cell);
		}
		infoCard.appendChild(grid);
		infoCard.appendChild(infoEl("div", "mi-note", "Цены за 1M токенов"));
	}
	infoCard.hidden = false;
	const list = ddList.getBoundingClientRect();
	const row = item.getBoundingClientRect();
	const left = list.right + 3;
	const width = Math.max(185, Math.min(230, window.innerWidth - left - 6));
	// Не хватает места справа — карточка чуть заходит на список, но не за край окна
	infoCard.style.left = `${Math.max(6, Math.min(left, window.innerWidth - width - 6))}px`;
	infoCard.style.width = `${width}px`;
	const height = infoCard.offsetHeight;
	const top = Math.min(
		Math.max(6, row.top + row.height / 2 - height / 2),
		window.innerHeight - height - 6,
	);
	infoCard.style.top = `${top}px`;
}

export function closeDropdown(): void {
	cancelHide();
	infoCard.hidden = true;
	ddList.hidden = true;
	modelDd.classList.remove("open");
}

export function lockModelSelect(): void {
	modelBtn.disabled = true;
	closeDropdown();
}

modelBtn.onclick = () => {
	const open = ddList.hidden;
	closeDropdown();
	if (open) {
		ddList.hidden = false;
		modelDd.classList.add("open");
		searchInput.value = "";
		searchClear.hidden = true;
		applySearch();
		searchInput.focus();
	}
};

// Закрываем выпадашку по клику вне неё и по Escape.
document.addEventListener("click", (e) => {
	const target = e.target as Node;
	if (!modelDd.contains(target) && !infoCard.contains(target))
		closeDropdown();
});
document.addEventListener("keydown", (e) => {
	if (e.key === "Escape") closeDropdown();
});

// Карточка скрывается с небольшой задержкой: курсор успевает перейти на неё.
let hideTimer: number | undefined;
function scheduleHide(): void {
	window.clearTimeout(hideTimer);
	hideTimer = window.setTimeout(() => {
		infoCard.hidden = true;
	}, 150);
}
function cancelHide(): void {
	window.clearTimeout(hideTimer);
}
ddList.addEventListener("mouseleave", scheduleHide);
ddList.addEventListener("mouseenter", cancelHide);
infoCard.addEventListener("mouseenter", cancelHide);
infoCard.addEventListener("mouseleave", scheduleHide);
