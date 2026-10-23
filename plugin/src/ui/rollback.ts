// Откат к сообщению: у каждого сообщения пользователя есть кнопка ↩. Меню
// даёт выбор — откатить чат вместе с дизайном или только чат (дизайн
// остаётся как есть). Контекст агента — последняя спека, последний промпт и
// транскрипт чата, поэтому «подтереть контекст» значит вернуть спеку/промпт
// к состоянию до выбранного сообщения и обрезать чат.
import { S } from "./ui-state";
import { setRollbackHandler, truncateChat } from "./chat";
import { restoreAttachments, serializeAttachments } from "./attachments";

type UserMsg = Parameters<Parameters<typeof setRollbackHandler>[0]>[1];

let menu: HTMLElement | null = null;
let promptEl: HTMLTextAreaElement | null = null;
let post: (message: Record<string, unknown>) => void = () => {};

function closeMenu(): void {
	menu?.remove();
	menu = null;
}

// Есть ли что откатывать в дизайне: прогоны с изменениями от этого сообщения.
function designRunsFrom(msg: UserMsg): number[] {
	if (typeof msg.runId !== "number") return [];
	const id = msg.runId;
	return S.undoRuns.filter((r) => r >= id);
}

// Откат чата и контекста (после того, как плагин ответил про дизайн).
function finishRollback(): void {
	const pending = S.pendingRollback;
	S.pendingRollback = null;
	if (!pending) return;
	const msg = pending.msg;
	truncateChat(msg);
	// Контекст агента — как было до этого сообщения.
	const ctx =
		typeof msg.runId === "number" ? S.ctxByRun.get(msg.runId) : undefined;
	S.lastSpec = (ctx?.spec as typeof S.lastSpec) ?? null;
	S.lastPrompt = ctx?.prompt ?? "";
	S.remaining = "";
	if (typeof msg.runId === "number") {
		for (const id of [...S.ctxByRun.keys()]) {
			if (id >= msg.runId) S.ctxByRun.delete(id);
		}
		// Вложения этого сообщения возвращаем в поле ввода; от него и позже
		// в памяти больше не нужны (прогоны отброшены).
		restoreAttachments(S.attachByRun.get(msg.runId) || []);
		for (const id of [...S.attachByRun.keys()]) {
			if (id >= msg.runId) S.attachByRun.delete(id);
		}
		post({
			type: "save_attachments",
			data: serializeAttachments(S.attachByRun),
		});
	}
	// Текст сообщения возвращаем в поле ввода — можно поправить и отправить заново.
	if (promptEl) {
		promptEl.value = msg.text;
		promptEl.focus();
	}
}

// Вызывает ui.ts, когда плагин ответил на undo_to / drop_runs.
export function onRollbackReply(): void {
	if (S.pendingRollback) finishRollback();
}

function choose(msg: UserMsg, withDesign: boolean): void {
	closeMenu();
	if (S.busy || S.pendingRollback) return;
	S.pendingRollback = { msg, withDesign };
	const runs = designRunsFrom(msg);
	if (typeof msg.runId === "number" && runs.length) {
		// Ответ придёт как "undone" (вернули дизайн) или "runs" (забыли копии).
		post({ type: withDesign ? "undo_to" : "drop_runs", from: msg.runId });
	} else {
		onRollbackReply();
	}
}

function option(
	parent: HTMLElement,
	title: string,
	hint: string,
	disabled: boolean,
	onClick: () => void,
): void {
	const btn = document.createElement("button");
	btn.className = "rb-item";
	btn.disabled = disabled;
	const t = document.createElement("span");
	t.className = "rb-title";
	t.textContent = title;
	const h = document.createElement("span");
	h.className = "rb-hint";
	h.textContent = hint;
	btn.append(t, h);
	btn.onclick = onClick;
	parent.appendChild(btn);
}

function openMenu(anchor: HTMLElement, msg: UserMsg): void {
	closeMenu();
	if (S.busy) return;
	const hasDesign = designRunsFrom(msg).length > 0;
	const el = document.createElement("div");
	el.className = "rb-menu";
	const head = document.createElement("div");
	head.className = "rb-head";
	head.textContent = "Откатить к этому сообщению";
	el.appendChild(head);
	option(
		el,
		"Чат и дизайн",
		hasDesign
			? "Дизайн вернётся к состоянию до этого сообщения"
			: "Нет изменений дизайна для отката",
		!hasDesign,
		() => choose(msg, true),
	);
	option(el, "Только чат", "Дизайн останется как есть", false, () =>
		choose(msg, false),
	);
	option(el, "Отмена", "", false, closeMenu);
	document.body.appendChild(el);
	// Позиционируем рядом с кнопкой, не выходя за окно плагина.
	const a = anchor.getBoundingClientRect();
	const w = el.offsetWidth;
	el.style.left = `${Math.max(6, Math.min(a.left, window.innerWidth - w - 6))}px`;
	const below = a.bottom + 4;
	el.style.top =
		below + el.offsetHeight > window.innerHeight
			? `${Math.max(6, a.top - el.offsetHeight - 4)}px`
			: `${below}px`;
	menu = el;
}

export function initRollback(
	input: HTMLTextAreaElement,
	send: (message: Record<string, unknown>) => void,
): void {
	promptEl = input;
	post = send;
	setRollbackHandler(openMenu);
	document.addEventListener("click", (e) => {
		if (menu && !menu.contains(e.target as Node)) closeMenu();
	});
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") closeMenu();
	});
}
