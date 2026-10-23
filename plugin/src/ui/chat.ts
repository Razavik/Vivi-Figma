// Лента сообщений: баблы юзера, строки агента (реплики, вызовы
// инструментов, сворачиваемые «Размышления»), три точки-индикатор,
// персист в figma.clientStorage через code.ts.
import type { DesignSpec } from "../spec";
import { S } from "./ui-state";
import { renderMarkdown } from "./markdown";
import { linkNodeIds } from "./node-links";
import { showChecklist, showPlan } from "./plan";
import { renderRing } from "./context-ring";
import { fileExt, fileIcon } from "./file-icon";

const messagesEl = document.getElementById("messages") as HTMLDivElement;
const clearBtn = document.getElementById("clear") as HTMLButtonElement;

// Служебный статус-разделитель в ленте: «Остановлено», «Отменено» и т.п.
export type StatusKind = "stopped" | "info" | "error";

const STATUS_ICONS: Record<StatusKind, string> = {
	stopped: `<svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor"><rect x="1.5" y="1.5" width="9" height="9" rx="1.5"/></svg>`,
	info: `<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.3l2.4 2.4L9.5 3.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
	error: `<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M6 2.5v4M6 9v.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
};

export type StoredMsg =
	| {
			role: "user";
			text: string;
			sel?: string;
			runId?: number;
			images?: string[];
			files?: string[];
	  }
	| { role: "thought"; text: string }
	| {
			role: "agent";
			title: string;
			meta?: string;
			error?: boolean;
			warnings?: string[];
			thought?: string;
			plain?: boolean;
			tool?: boolean;
			status?: StatusKind;
	  };

// Лог отображаемой беседы — алиас на messages активной записи
// (переприсваивается в applyChat). Сообщения пишутся через pushMsg:
// во время прогона — в его беседу, даже если на экране другая.
export let chatLog: StoredMsg[] = [];

// Хранилище бесед: несколько чатов в одном ключе figma-agent-chat.
// У каждого — сообщения и контекст агента (lastSpec, lastPrompt, docNotes);
// версии дизайна и откат общие по холсту и сюда не входят.
export type ChatRecord = {
	id: string;
	title: string;
	// Имя задано вручную — автоназвание из первого сообщения его не трогает.
	titleCustom?: boolean;
	ts: number;
	messages: StoredMsg[];
	lastSpec: DesignSpec | null;
	lastPrompt: string;
	docNotes: string;
	// План работы агента — показывается кнопкой в углу, не в ленте.
	plan?: string[];
	planDone?: number[];
	interrupted?: {
		runId: number;
		prompt: string;
		rootId?: string;
		remaining?: string;
		plan?: string[];
		planDone?: number[];
		model?: string;
		ts: number;
	};
	// Выжимка истории: сжатые ранние реплики и число записей, которые она покрывает.
	summary?: string;
	summaryCount?: number;
	// Занято контекста в последнем раунде (токены) — для индикатора.
	ctxTokens?: number;
};

type ChatStore = {
	active: string;
	model?: string;
	chats: Record<string, ChatRecord>;
};

let store: ChatStore = { active: "", chats: {} };
export type InterruptedRun = NonNullable<ChatRecord["interrupted"]>;
let interruptedPrompt: HTMLElement | null = null;
let onContinueInterrupted: ((run: InterruptedRun) => void) | null = null;

export function setInterruptedHandlers(
	resume: (run: InterruptedRun) => void,
): void {
	onContinueInterrupted = resume;
}

export function showInterruptedPrompt(): void {
	renderInterruptedPrompt(store.chats[store.active]);
}

export function updateInterrupted(
	fields: Partial<InterruptedRun>,
	chatId?: string,
): void {
	const rec = (chatId && store.chats[chatId]) || runRec() || ensureChat();
	if (!rec.interrupted) return;
	rec.interrupted = { ...rec.interrupted, ...fields, ts: Date.now() };
	persistChat();
}

export function saveInterrupted(run: InterruptedRun): void {
	const rec = runRec() || ensureChat();
	rec.interrupted = run;
	persistChat();
}

export function clearInterrupted(chatId?: string): void {
	const rec = (chatId && store.chats[chatId]) || runRec() || ensureChat();
	delete rec.interrupted;
	renderInterruptedPrompt(store.chats[store.active]);
	persistChat();
}

function renderInterruptedPrompt(rec?: ChatRecord): void {
	interruptedPrompt?.remove();
	interruptedPrompt = null;
	if (!rec?.interrupted || S.busy) return;
	const box = document.createElement("div");
	box.className = "interrupted-prompt";
	const text = document.createElement("span");
	text.textContent = "Прогон прерван — продолжить?";
	const resume = document.createElement("button");
	resume.type = "button";
	resume.textContent = "Продолжить";
	resume.onclick = () => onContinueInterrupted?.(rec.interrupted!);
	const reject = document.createElement("button");
	reject.type = "button";
	reject.textContent = "Отклонить";
	reject.onclick = () => clearInterrupted(rec.id);
	box.append(text, resume, reject);
	interruptedPrompt = box;
	messagesEl.appendChild(box);
	scrollBottom();
}
// Защита от неограниченного роста: совсем старые пустые беседы вытесняем.
const MAX_CHATS = 30;
let idSeq = 0;

function genId(): string {
	return `c${Date.now().toString(36)}${(idSeq++).toString(36)}`;
}

// Первое сообщение пользователя в ленте — из него берём заголовок беседы.
function firstUserText(log: StoredMsg[]): string | null {
	for (const m of log) {
		if (m.role === "user" && m.text) return m.text.slice(0, 60);
	}
	return null;
}

// Активная запись; если беседы ещё нет — создаём пустую.
function ensureChat(): ChatRecord {
	let rec = store.chats[store.active];
	if (!rec) {
		rec = {
			id: store.active || genId(),
			title: "",
			ts: Date.now(),
			messages: [],
			lastSpec: null,
			lastPrompt: "",
			docNotes: "",
		};
		store.chats[rec.id] = rec;
		store.active = rec.id;
	}
	return rec;
}

export function activeChatId(): string {
	return ensureChat().id;
}

// Беседа текущего прогона — её лог и контекст живут отдельно от экрана.
function runRec(): ChatRecord | null {
	return S.runChatId ? store.chats[S.runChatId] || null : null;
}

// Куда писать очередное сообщение: в чат прогона, иначе в отображаемый.
function targetRec(): ChatRecord {
	return runRec() || ensureChat();
}

function isShown(rec: ChatRecord): boolean {
	return rec.id === store.active;
}

// Единая точка записи в лог: идёт в беседу-владельца, а на экран — только
// если она отображается. persistChat фиксирует всё в хранилище.
function pushMsg(m: StoredMsg, render?: (m: StoredMsg) => void): void {
	const rec = targetRec();
	rec.messages.push(m);
	if (isShown(rec)) {
		render?.(m);
		clearBtn.hidden = false;
		scrollBottom();
	}
	persistChat();
}

// Текст недописанных «Размышлений» прогона — при переключении чатов
// покажем в его беседе, когда вернёмся.
let pendingThought = "";

// Отрисовать содержимое беседы в ленте. Контекст агента (S) подставляем
// только когда прогона нет — во время работы S принадлежит его чату.
function applyChat(rec: ChatRecord): void {
	messagesEl.innerHTML = "";
	showPlan(rec.plan ?? legacyPlan(rec.messages), rec.planDone);
	// Чек-лист требований принадлежит работающему прогону: в чужой беседе его нет.
	const working = runRec();
	if (working && working.id === rec.id) showChecklist(S.checklist, S.checked);
	else showChecklist([]);
	S.ctxTokens = rec.ctxTokens ?? estimateCtx(rec);
	renderRing();
	chatLog = rec.messages;
	S.thoughtEl = null;
	for (const m of rec.messages) {
		// Устаревшие плашки итога отката из старой истории не показываем.
		if (
			m.role === "agent" &&
			m.status === "info" &&
			m.title.startsWith("Откат к сообщению")
		)
			continue;
		renderStored(m);
	}
	const run = runRec();
	if (run && run.id === rec.id) {
		// Вернулись в беседу с работающим агентом — достраиваем поток.
		if (pendingThought) {
			S.thoughtEl = renderThought(pendingThought, true);
			messagesEl.appendChild(S.thoughtEl);
		}
		pinDots();
	}
	if (!run) {
		S.lastSpec = rec.lastSpec;
		S.lastPrompt = rec.lastPrompt;
		S.docNotes = rec.docNotes;
		S.remaining = "";
		S.runWarnings = [];
	}
	clearBtn.hidden = rec.messages.length === 0;
	scrollBottom();
	renderInterruptedPrompt(rec);
}

const PLAN_PREFIX = "plan: ";

// Старые беседы хранили план строкой «plan: A → B» в ленте.
function legacyPlan(messages: StoredMsg[]): string[] | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (m.role === "agent" && m.tool && m.title.startsWith(PLAN_PREFIX))
			return m.title.slice(PLAN_PREFIX.length).split(" → ");
	}
	return undefined;
}

// План прогона — в его беседу; кнопка обновляется, если беседа на экране.
// Новый план обнуляет отметки о готовых частях.
export function setPlan(plan: string[]): void {
	const rec = targetRec();
	rec.plan = plan;
	rec.planDone = [];
	if (rec.interrupted) {
		rec.interrupted.plan = plan.slice();
		rec.interrupted.planDone = [];
	}
	if (isShown(rec)) showPlan(plan, []);
	persistChat();
}

// Номера готовых частей (с 1) — агент присылает их накопительно.
export function setPlanDone(done: number[]): void {
	const rec = targetRec();
	if (!rec.plan?.length) return;
	rec.planDone = [...new Set(done)].filter(
		(n) => n >= 1 && n <= rec.plan!.length,
	);
	if (rec.interrupted) rec.interrupted.planDone = rec.planDone.slice();
	if (isShown(rec)) showPlan(rec.plan, rec.planDone);
	persistChat();
}

// План беседы прогона — продолжаем его в следующих запросах.
export function chatPlan(): { plan: string[]; done: number[] } {
	const rec = targetRec();
	return { plan: rec.plan || [], done: rec.planDone || [] };
}

// Транскрипт беседы прогона для контекста запроса: реплики юзера и
// ответы/действия агента. Мысли, статусы и детали предупреждений не
// нужны — а сырые JSON-спеки не шлём, текущее состояние несёт previousSpec.
// У одноразовых ACP-агентов (Devin) нет памяти между запросами — сервер
// подмешивает транскрипт, чтобы «дальше» и отсылки к прошлому работали.
// Контекст запроса: выжимка (если есть) и реплики после неё.
export function chatContext(): {
	summary?: string;
	history: { role: "user" | "agent"; text: string }[];
} {
	const rec = runRec() || ensureChat();
	const all = allHistory();
	const covered =
		rec.summary && rec.summaryCount && rec.summaryCount <= all.length
			? rec.summaryCount
			: 0;
	return {
		summary: covered ? rec.summary : undefined,
		history: all.slice(covered),
	};
}

// Сервер сжал старые реплики: выжимка покрывает ещё covers записей.
// chatId — беседа, для которой запускали ручное сжатие (её могли сменить).
export function setChatSummary(
	text: string,
	covers: number,
	chatId?: string,
): void {
	const rec = (chatId && store.chats[chatId]) || targetRec();
	rec.summary = text;
	rec.summaryCount = (rec.summaryCount || 0) + covers;
	persistChat();
}

// Занятый контекст беседы: из usage раунда или после сжатия.
export function setChatCtx(tokens: number, chatId?: string): void {
	const rec = (chatId && store.chats[chatId]) || targetRec();
	rec.ctxTokens = Math.max(0, Math.round(tokens));
	if (isShown(rec)) {
		S.ctxTokens = rec.ctxTokens;
		renderRing();
	}
	persistChat();
}

// Токены системного промпта и служебных блоков запроса (схема, правила) —
// у новой беседы без раундов контекст уже не пустой.
const BASE_CTX_TOKENS = 14_000;

// Оценка занятого контекста, пока нет реальных данных раунда: база +
// выжимка + реплики после неё (около 3 символов на токен).
function estimateCtx(rec: ChatRecord): number {
	const all = allHistory(rec);
	const covered =
		rec.summary && rec.summaryCount && rec.summaryCount <= all.length
			? rec.summaryCount
			: 0;
	const chars =
		(covered ? rec.summary!.length : 0) +
		all.slice(covered).reduce((n, h) => n + Math.min(h.text.length, 800), 0);
	return all.length || rec.summary
		? BASE_CTX_TOKENS + Math.ceil(chars / 3)
		: 0;
}

export function chatCtx(chatId?: string): number {
	const rec = (chatId && store.chats[chatId]) || targetRec();
	return rec.ctxTokens ?? estimateCtx(rec);
}

function allHistory(rec: ChatRecord = runRec() || ensureChat()): {
	role: "user" | "agent";
	text: string;
}[] {
	const out: { role: "user" | "agent"; text: string }[] = [];
	for (const m of rec.messages) {
		if (m.role === "user") {
			const bits = [m.text || ""];
			if (m.images?.length) bits.push(`[${m.images.length} image(s)]`);
			if (m.files?.length) bits.push(`[files: ${m.files.join(", ")}]`);
			out.push({ role: "user", text: bits.join(" ").trim() });
		} else if (m.role === "agent") {
			if (m.plain || m.tool) out.push({ role: "agent", text: m.title });
			else if (m.error)
				out.push({
					role: "agent",
					text: `Error: ${m.meta || m.title}`,
				});
		}
	}
	return out;
}

// Прогон завершён (одобрен, остановлен, упал): контекст сохраняем в его
// беседу и возвращаем S контекст отображаемой — следующий запрос уйдёт с ним.
export function endRun(): void {
	const run = runRec();
	if (!run) return;
	closeThought();
	run.lastSpec = S.lastSpec;
	run.lastPrompt = S.lastPrompt;
	run.docNotes = S.docNotes;
	S.runChatId = null;
	const shown = ensureChat();
	S.lastSpec = shown.lastSpec;
	S.lastPrompt = shown.lastPrompt;
	S.docNotes = shown.docNotes;
	persistChat();
}

// Список бесед для панели: новые сверху.
export function chatList(): {
	id: string;
	title: string;
	ts: number;
	active: boolean;
	running: boolean;
}[] {
	return Object.values(store.chats)
		.map((c) => ({
			id: c.id,
			title: c.title || "Новый чат",
			ts: c.ts,
			active: c.id === store.active,
			running: S.busy && c.id === S.runChatId,
		}))
		.sort((a, b) => b.ts - a.ts);
}

// Пустая беседа без сообщений пользователя («Новый чат») не нужна —
// при уходе с неё удаляем, чтобы список не засорялся.
function dropEmptyCurrent(): void {
	const rec = store.chats[store.active];
	if (rec && !rec.messages.some((m) => m.role === "user"))
		delete store.chats[rec.id];
}

// Переключиться на другую беседу: текущую фиксируем, целевую рисуем.
export function switchChat(id: string): void {
	if (id === store.active || !store.chats[id]) return;
	persistChat();
	dropEmptyCurrent();
	store.active = id;
	applyChat(store.chats[id]);
	persistChat();
}

// Новая пустая беседа: чистый контекст агента, холст не трогаем.
export function newChat(): void {
	persistChat();
	dropEmptyCurrent();
	const fresh: ChatRecord = {
		id: genId(),
		title: "",
		ts: Date.now(),
		messages: [],
		lastSpec: null,
		lastPrompt: "",
		docNotes: "",
	};
	store.chats[fresh.id] = fresh;
	store.active = fresh.id;
	// Вытесняем самые старые неактивные беседы сверх лимита.
	const ids = Object.keys(store.chats).sort(
		(a, b) => store.chats[a].ts - store.chats[b].ts,
	);
	while (ids.length > MAX_CHATS) {
		const oldest = ids.shift() as string;
		if (oldest !== store.active) delete store.chats[oldest];
	}
	applyChat(fresh);
	persistChat();
}

// Переименовать беседу. Пустое имя — возврат к автоназванию
// (подставится первое сообщение пользователя).
export function renameChat(id: string, title: string): void {
	const rec = store.chats[id];
	if (!rec) return;
	const trimmed = title.trim();
	rec.titleCustom = !!trimmed;
	rec.title = trimmed || firstUserText(rec.messages) || "";
	persistChat();
}

// Удалить беседу. Активную заменяем самой свежей из оставшихся; последнюю —
// пустой новой (хранилище без чатов быть не должно). Чат работающего
// прогона удалять нельзя — ему некуда будет писать.
export function deleteChat(id: string): void {
	if (!store.chats[id] || id === S.runChatId) return;
	delete store.chats[id];
	if (store.active === id) {
		const rest = Object.values(store.chats).sort((a, b) => b.ts - a.ts);
		if (rest.length) {
			store.active = rest[0].id;
			applyChat(rest[0]);
		} else {
			store.active = "";
			applyChat(ensureChat());
		}
	}
	persistChat();
}

// Три точки-индикатор: пока агент занят, всегда висят последним элементом ленты.
const dotsEl = document.createElement("div");
dotsEl.className = "msg agent";
dotsEl.innerHTML = `<div class="agent-title"><span class="dots"><i></i><i></i><i></i></span></div>`;

// Перемещаем точки в конец ленты после каждого нового блока.
// Если прогон идёт в другой беседе — точки там невидимы, здесь не рисуем.
export function pinDots(): void {
	const run = runRec();
	if (S.busy && (!run || isShown(run))) messagesEl.appendChild(dotsEl);
}

export function removeDots(): void {
	dotsEl.remove();
}

// Произвольный блок в конец ленты (карточка брифа): не часть истории чата.
export function appendToFeed(node: HTMLElement): void {
	messagesEl.appendChild(node);
	scrollBottom();
}

export function scrollBottom(): void {
	messagesEl.scrollTop = messagesEl.scrollHeight;
}

export function persistChat(): void {
	// Пока хранилище не прочитано, писать нельзя: затрём прошлую историю и модель.
	if (!S.chatRestored) return;
	// Контекст S принадлежит рабочей беседе (прогону), в покое — отображаемой.
	const ctx = runRec() || ensureChat();
	ctx.ts = Date.now();
	ctx.lastSpec = S.lastSpec;
	ctx.lastPrompt = S.lastPrompt;
	ctx.docNotes = S.docNotes;
	// Храним не больше ста последних сообщений — обрезаем на месте:
	// messages активной беседы — тот же массив, что и лог ленты.
	for (const rec of Object.values(store.chats)) {
		if (rec.messages.length > 100)
			rec.messages.splice(0, rec.messages.length - 100);
		// Заголовок — первое сообщение пользователя; при пустом чате сбрасываем.
		// Ручное имя (titleCustom) автоназвание не перекрывает.
		if (!rec.titleCustom && !rec.messages.length) rec.title = "";
	}
	if (!ctx.titleCustom && !ctx.title)
		ctx.title = firstUserText(ctx.messages) || "";
	// Пишем предпочтение, а не временный fallback из списка.
	store.model = S.savedModel || S.currentModel;
	parent.postMessage(
		{ pluginMessage: { type: "save_chat", data: store } },
		"*",
	);
}

// Откат к сообщению: обработчик ставит ui.ts (меню «чат и дизайн / только чат»).
type RollbackHandler = (
	anchor: HTMLElement,
	msg: Extract<StoredMsg, { role: "user" }>,
) => void;
let rollbackHandler: RollbackHandler | null = null;
export function setRollbackHandler(fn: RollbackHandler): void {
	rollbackHandler = fn;
}

// Бабл юзера: текст, чип выделенного и кнопка отката к этому сообщению.
function renderUser(m: Extract<StoredMsg, { role: "user" }>): HTMLElement {
	const el = document.createElement("div");
	el.className = "msg user";
	// Пустой текст (голые вложения) не рисуем — бабл покажет только их.
	if (m.text) {
		const text = document.createElement("span");
		text.className = "msg-text";
		text.textContent = m.text;
		el.appendChild(text);
	}
	if (m.images?.length) {
		const row = document.createElement("div");
		row.className = "msg-images";
		for (const src of m.images) {
			const img = document.createElement("img");
			img.src = src;
			img.alt = "";
			row.appendChild(img);
		}
		el.appendChild(row);
	}
	if (m.files?.length) {
		const row = document.createElement("div");
		row.className = "msg-files";
		for (const name of m.files) {
			const f = document.createElement("span");
			f.className = "msg-file";
			f.title = name;
			const label = document.createElement("span");
			label.className = "msg-file-ext";
			label.textContent = fileExt(name);
			f.append(fileIcon(name), label);
			row.appendChild(f);
		}
		el.appendChild(row);
	}
	if (m.sel) {
		const tag = document.createElement("span");
		tag.className = "msg-sel";
		tag.textContent = m.sel;
		el.appendChild(tag);
	}
	const btn = document.createElement("button");
	btn.className = "msg-rollback";
	btn.title = "Откатить к этому сообщению";
	btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M5 3L2 6l3 3M2 6h6.5a3.5 3.5 0 010 7H6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
	btn.onclick = (e) => {
		e.stopPropagation();
		rollbackHandler?.(btn, m);
	};
	el.appendChild(btn);
	return el;
}

// Прибавляет бабл юзера в ленту и лог. Контекст прогона (runId) нужен для отката.
export function addUserMessage(
	text: string,
	sel?: string,
	runId?: number,
	images?: string[],
	files?: string[],
): void {
	const m = { role: "user" as const, text, sel, runId, images, files };
	pushMsg(m, () => messagesEl.appendChild(renderUser(m)));
}

// Рисует сохранённое сообщение в ленте (без записи в лог).
function renderStored(m: StoredMsg): void {
	if (m.role === "user") messagesEl.appendChild(renderUser(m));
	else if (m.role === "thought")
		messagesEl.appendChild(renderThought(m.text, true));
	else renderAgentEntry(m);
}

// Откат чата к сообщению: оно и всё после него исчезают из ленты и лога.
// Возвращает само сообщение (его текст возвращаем в поле ввода) и убранные.
export function truncateChat(
	msg: Extract<StoredMsg, { role: "user" }>,
): StoredMsg[] | null {
	const index = chatLog.indexOf(msg);
	if (index < 0) return null;
	const removed = chatLog.slice(index);
	const keep = chatLog.slice(0, index);
	messagesEl.innerHTML = "";
	chatLog.length = 0;
	S.thoughtEl = null;
	for (const m of keep) {
		renderStored(m);
		chatLog.push(m);
	}
	clearBtn.hidden = chatLog.length === 0;
	persistChat();
	scrollBottom();
	return removed;
}

// Завершённое действие агента — строка-блок в ленте.
export function pushStep(
	text: string,
	opts?: { error?: string; warnings?: string[]; status?: StatusKind },
): void {
	const m: StoredMsg = {
		role: "agent",
		title: text,
		meta: opts?.error,
		error: !!opts?.error,
		warnings: opts?.warnings,
		status: opts?.status,
	};
	pushMsg(m, () => renderAgentEntry(m));
}

// Самостоятельная строка от агента — его summary/пояснение.
export function pushAgentText(text: string): void {
	S.agentSpoke = true;
	const m: StoredMsg = { role: "agent", title: text, plain: true };
	pushMsg(m, () => renderAgentEntry(m));
}

// Строка вызова инструмента — видно, что агент дергает (inspect, build…).
export function pushTool(text: string): void {
	const m: StoredMsg = { role: "agent", title: text, tool: true };
	pushMsg(m, () => renderAgentEntry(m));
}

const CHEV_SVG = `<svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Сырой текст храним в data-raw: textContent после markdown-рендера
// уже без разметки, а стрим дописывает текст к исходнику.
function setThoughtText(body: HTMLElement, raw: string): void {
	body.dataset.raw = raw;
	renderMarkdown(body, raw);
}

export function renderThought(bodyText: string, closed: boolean): HTMLElement {
	const box = document.createElement("div");
	box.className = "msg agent thought" + (closed ? " closed" : "");
	box.innerHTML = `<div class="thought-head">${CHEV_SVG}<span>Размышления</span></div><div class="thought-body"></div>`;
	setThoughtText(
		box.querySelector(".thought-body") as HTMLElement,
		bodyText.trim(),
	);
	const head = box.querySelector(".thought-head") as HTMLElement;
	head.onclick = () => box.classList.toggle("closed");
	return box;
}

// Завершённый шаг или текст агента — статичная строка в ленте чата.
export function renderAgentEntry(m: {
	title: string;
	meta?: string;
	error?: boolean;
	warnings?: string[];
	thought?: string;
	plain?: boolean;
	tool?: boolean;
	status?: StatusKind;
}): void {
	if (m.status) {
		const row = document.createElement("div");
		row.className = `msg agent status-row ${m.status}`;
		row.innerHTML = `<span class="status-line"></span><span class="status-pill">${STATUS_ICONS[m.status]}<span class="status-text"></span></span><span class="status-line"></span>`;
		(row.querySelector(".status-text") as HTMLElement).textContent =
			m.title;
		messagesEl.appendChild(row);
		clearBtn.hidden = false;
		if (m.warnings?.length) {
			const warn = document.createElement("div");
			warn.className = "agent-warnings";
			warn.textContent = m.warnings.join("\n");
			messagesEl.appendChild(warn);
		}
		pinDots();
		return;
	}
	// План из старой истории (строкой в ленте) — теперь он за кнопкой в углу.
	if (m.tool && m.title.startsWith(PLAN_PREFIX)) return;
	const box = document.createElement("div");
	box.className = "msg agent" + (m.error ? " error" : "");
	const title = document.createElement("div");
	title.className = m.tool
		? "agent-tool"
		: m.plain
			? "agent-plain"
			: "agent-title";
	// Реплики самой модели (summary) могут содержать markdown.
	if (m.plain) {
		renderMarkdown(title, m.title);
		linkNodeIds(title);
	}
	else title.textContent = m.title;
	box.appendChild(title);
	if (m.meta) {
		const meta = document.createElement("div");
		meta.className = "agent-meta";
		meta.textContent = m.meta;
		box.appendChild(meta);
	}
	if (m.warnings?.length) {
		const warn = document.createElement("div");
		warn.className = "agent-warnings";
		warn.textContent = m.warnings.join("\n");
		box.appendChild(warn);
	}
	messagesEl.appendChild(box);
	clearBtn.hidden = false;
	if (m.thought) messagesEl.appendChild(renderThought(m.thought, true));
	pinDots();
}

// Конец работы агента: если он ничего не написал, показываем
// минимальный итог, чтобы завершение было заметно.
export function finishRun(): void {
	if (!S.agentSpoke) pushAgentText("Готово");
}

// Раунд модели закончился — сворачиваем блок «Размышления» и логируем.
// Текст копится в pendingThought отдельно от DOM: прогон может идти,
// пока на экране другая беседа.
export function closeThought(): void {
	const text = pendingThought.trim();
	if (S.thoughtEl) S.thoughtEl.classList.add("closed");
	S.thoughtEl = null;
	pendingThought = "";
	if (text) pushMsg({ role: "thought", text });
}

// Стримящийся thinking модели — сворачиваемая курсивная простыня.
export function appendThought(text: string): void {
	// Схлопываем серии пустых строк — чанки часто приходят
	// с переносами, из-за них получаются пустоты в блоке.
	pendingThought = (pendingThought + text)
		.trimStart()
		.replace(/\n{3,}/g, "\n\n")
		.slice(-60000);
	const run = runRec();
	if (run && !isShown(run)) return;
	if (!S.thoughtEl) {
		// Свёрнут по умолчанию: поток размышлений не должен вытеснять чат.
		S.thoughtEl = renderThought("", true);
		messagesEl.appendChild(S.thoughtEl);
	}
	const body = S.thoughtEl.querySelector(".thought-body") as HTMLElement;
	// Автопрокрутка вниз — только если пользователь и так внизу: иначе
	// каждый новый кусок сбрасывал бы его прокрутку вверх.
	const stick = body.scrollHeight - body.scrollTop - body.clientHeight < 24;
	setThoughtText(body, pendingThought);
	if (stick) body.scrollTop = body.scrollHeight;
	pinDots();
	scrollBottom();
}

// Восстановление истории при открытии плагина. Понимает и старый формат
// ({messages, lastSpec, model}) — мигрирует его в одну беседу.
export function restoreChat(data: {
	messages?: StoredMsg[];
	lastSpec?: DesignSpec | null;
	lastPrompt?: string;
	docNotes?: string;
	model?: string;
	active?: string;
	chats?: Record<string, ChatRecord>;
}): void {
	if (data?.chats && typeof data.chats === "object") {
		store = {
			active: typeof data.active === "string" ? data.active : "",
			chats: data.chats,
		};
	} else {
		// Старый формат: одна беседа со всей историей.
		const rec: ChatRecord = {
			id: genId(),
			title: "",
			ts: Date.now(),
			messages: data?.messages || [],
			lastSpec: data?.lastSpec || null,
			lastPrompt: data?.lastPrompt || "",
			docNotes: data?.docNotes || "",
		};
		store = { active: rec.id, chats: { [rec.id]: rec } };
	}
	const rec = ensureChat();
	// Лог ленты — тот же массив, что у беседы: просто отрисовываем его.
	applyChat(rec);
	// Заголовок беседы, если история пришла из старого формата.
	if (!rec.title && !rec.titleCustom)
		rec.title = firstUserText(rec.messages) || "";
	// Модель из прошлой сессии становится предпочтением, если пользователь
	// сам ещё ничего не выбрал в этом запуске.
	const model = data?.model;
	if (typeof model === "string" && model && !S.modelChosenByUser)
		S.savedModel = model;
	// Хранилище прочитано — с этого момента persistChat может писать обратно.
	S.chatRestored = true;
}

// Очистка чата: стираем ленту, историю и контекст предыдущего дизайна.
// Во время прогона контекст S не трогаем — он принадлежит работающему чату.
clearBtn.onclick = () => {
	const rec = ensureChat();
	messagesEl.innerHTML = "";
	rec.messages.length = 0;
	rec.plan = undefined;
	rec.planDone = undefined;
	// Незаконченный прогон тоже уносил план — после очистки его не продолжаем.
	rec.interrupted = undefined;
	rec.summary = undefined;
	rec.summaryCount = undefined;
	rec.ctxTokens = undefined;
	S.ctxTokens = 0;
	renderRing();
	showPlan(undefined);
	if (!runRec()) {
		S.plan = [];
		S.planDone = [];
		S.checklist = [];
		S.checked = [];
		showChecklist([]);
		S.lastSpec = null;
		S.docNotes = "";
	}
	clearBtn.hidden = true;
	S.thoughtEl = null;
	persistChat();
	window.dispatchEvent(new Event("vivi-clear"));
};
