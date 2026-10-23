// Панель бесед: список чатов, переключение, новая беседа, удаление.
// Беседы живут в clientStorage (chat.ts) и переживают перезапуск плагина.
// Переключаться можно и во время прогона — он продолжит писать в свой чат;
// удалить его беседу или откатиться в это время нельзя.
import { S } from "./ui-state";
import { chatList, deleteChat, newChat, renameChat, switchChat } from "./chat";

let panel: HTMLElement | null = null;
let onOpen: (() => void) | null = null;

export function closeChats(): void {
	if (panel) panel.hidden = true;
}

function fmtTime(ts: number): string {
	const d = new Date(ts);
	return Number.isFinite(d.getTime())
		? d.toLocaleString("ru-RU", {
				day: "2-digit",
				month: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
			})
		: "";
}

// Инлайн-редактирование имени чата: input вместо заголовка, Enter/blur —
// сохранить, Escape — отмена. Пустое значение возвращает автоназвание.
function startRename(row: HTMLElement, id: string, current: string): void {
	const info = row.querySelector(".ver-info") as HTMLElement | null;
	const titleEl = info?.querySelector(".ver-prompt");
	if (!info || !titleEl) return;
	const input = document.createElement("input");
	input.className = "chat-rename";
	input.value = current === "Новый чат" ? "" : current;
	input.placeholder = "Имя чата";
	const commit = () => {
		renameChat(id, input.value);
		render();
	};
	input.onkeydown = (e) => {
		e.stopPropagation();
		if (e.key === "Enter") commit();
		else if (e.key === "Escape") render();
	};
	input.onblur = commit;
	input.onclick = (e) => e.stopPropagation();
	titleEl.replaceWith(input);
	input.focus();
	input.select();
}

function render(): void {
	if (!panel || panel.hidden) return;
	panel.textContent = "";
	const head = document.createElement("div");
	head.className = "rb-head";
	head.textContent = "Чаты";
	panel.appendChild(head);
	for (const c of chatList()) {
		const row = document.createElement("div");
		row.className = "ver-row" + (c.active ? " current" : "");
		const info = document.createElement("div");
		info.className = "ver-info";
		const time = document.createElement("span");
		time.className = "ver-time";
		time.textContent = fmtTime(c.ts);
		const title = document.createElement("span");
		title.className = "ver-prompt";
		title.textContent = c.title;
		title.title = c.title;
		info.append(time, title);
		row.appendChild(info);
		if (c.active) {
			const mark = document.createElement("span");
			mark.className = "chat-mark";
			mark.textContent = "●";
			row.appendChild(mark);
		}
		if (c.running) {
			const mark = document.createElement("span");
			mark.className = "chat-mark chat-run";
			mark.textContent = "●";
			mark.title = "Агент работает в этом чате";
			row.appendChild(mark);
		}
		const edit = document.createElement("button");
		edit.className = "ver-act";
		edit.title = "Переименовать";
		edit.textContent = "✎";
		edit.onclick = (e) => {
			e.stopPropagation();
			startRename(row, c.id, c.title);
		};
		row.appendChild(edit);
		const del = document.createElement("button");
		del.className = "ver-act";
		del.title = "Удалить чат";
		del.textContent = "×";
		if (c.running) {
			del.disabled = true;
			del.title = "Агент работает — чат нельзя удалить";
		}
		del.onclick = (e) => {
			e.stopPropagation();
			deleteChat(c.id);
			render();
		};
		row.appendChild(del);
		row.onclick = () => {
			// В момент ожидания ответа на откат не переключаемся.
			if (c.active || S.pendingRollback) return;
			switchChat(c.id);
			closeChats();
		};
		panel.appendChild(row);
	}
	const foot = document.createElement("div");
	foot.className = "ver-foot";
	const add = document.createElement("button");
	add.className = "ver-clear";
	add.textContent = "+ Новый чат";
	add.onclick = () => {
		if (S.pendingRollback) return;
		newChat();
		closeChats();
	};
	foot.appendChild(add);
	panel.appendChild(foot);
}

export function initChats(
	btn: HTMLButtonElement,
	panelEl: HTMLElement,
	onOpenCb?: () => void,
): void {
	panel = panelEl;
	onOpen = onOpenCb || null;
	btn.onclick = (e) => {
		e.stopPropagation();
		if (!panel) return;
		panel.hidden = !panel.hidden;
		if (!panel.hidden) onOpen?.();
		render();
	};
	document.addEventListener("click", (e) => {
		if (
			panel &&
			!panel.hidden &&
			!panel.contains(e.target as Node) &&
			e.target !== btn
		)
			closeChats();
	});
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") closeChats();
	});
}
