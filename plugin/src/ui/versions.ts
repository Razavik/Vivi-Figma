// Список версий дизайна: каждая версия — состояние ДО запроса прогона.
// Восстановление откатывает прогон этой версии и все последующие; копии
// блоков лежат на странице «⟲ Vivi history» в файле, поэтому список
// переживает пересборку и перезапуск плагина.
import { S } from "./ui-state";
import { pushStep } from "./chat";

let panel: HTMLElement | null = null;
let post: (message: Record<string, unknown>) => void = () => {};
let onOpen: (() => void) | null = null;
// Ожидаем ответ плагина на восстановление — чтобы показать итог в чате.
let pendingRestore: number | null = null;

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

export function closeVersions(): void {
	if (panel) panel.hidden = true;
}

function actionBtn(
	title: string,
	label: string,
	onClick: () => void,
): HTMLButtonElement {
	const b = document.createElement("button");
	b.className = "ver-act";
	b.title = title;
	b.textContent = label;
	b.onclick = (e) => {
		e.stopPropagation();
		onClick();
	};
	return b;
}

function render(): void {
	if (!panel || panel.hidden) return;
	panel.textContent = "";
	const head = document.createElement("div");
	head.className = "rb-head";
	head.textContent = "Версии дизайна";
	panel.appendChild(head);
	const list = [...S.versions].sort((a, b) => b.id - a.id);
	if (!list.length) {
		const empty = document.createElement("div");
		empty.className = "ver-empty";
		empty.textContent =
			"Пока нет версий — они появятся после первого прогона";
		panel.appendChild(empty);
	}
	for (const v of list) {
		const row = document.createElement("div");
		row.className = "ver-row";
		const info = document.createElement("div");
		info.className = "ver-info";
		const time = document.createElement("span");
		time.className = "ver-time";
		time.textContent = fmtTime(v.ts || v.id);
		const prompt = document.createElement("span");
		prompt.className = "ver-prompt";
		prompt.textContent = v.prompt || "прогон";
		prompt.title = v.prompt;
		info.append(time, prompt);
		row.appendChild(info);
		row.appendChild(
			actionBtn("Вернуть состояние до этого запроса", "↩", () => {
				if (S.busy) return;
				pendingRestore = v.id;
				post({ type: "undo_to", from: v.id });
				closeVersions();
			}),
		);
		row.appendChild(
			actionBtn("Удалить версию", "×", () => {
				if (S.busy) return;
				post({ type: "drop_run", runId: v.id });
			}),
		);
		panel.appendChild(row);
	}
	if (list.length) {
		const foot = document.createElement("div");
		foot.className = "ver-foot";
		const clear = document.createElement("button");
		clear.className = "ver-clear";
		clear.textContent = "Очистить всё";
		clear.onclick = () => {
			if (S.busy) return;
			post({ type: "clear_history" });
		};
		foot.appendChild(clear);
		panel.appendChild(foot);
	}
}

// Плагин прислал свежий список версий или итог операции над ними.
export function onVersionsReply(msg: {
	type?: string;
	versions?: unknown;
	restored?: number;
	removed?: number;
}): void {
	if (msg.type === "undone" && pendingRestore !== null) {
		// Контекст агента (последняя спека) уже не соответствует канвасу —
		// сбрасываем, следующий запрос пойдёт с чистого листа.
		S.lastSpec = null;
		// Промпт ищем до замены списка: восстановленная версия из него выпадает.
		const v = S.versions.find((x) => x.id === pendingRestore);
		const label = v?.prompt ? ` «${v.prompt.slice(0, 60)}»` : "";
		const parts: string[] = [];
		if (msg.removed) parts.push(`удалено: ${msg.removed}`);
		pushStep(`Откат к версии${label}`, {
			status: "info",
			warnings: parts.length ? parts : undefined,
		});
		pendingRestore = null;
	}
	if (Array.isArray(msg.versions)) {
		S.versions = msg.versions as {
			id: number;
			ts: number;
			prompt: string;
		}[];
	}
	render();
}

export function initVersions(
	btn: HTMLButtonElement,
	panelEl: HTMLElement,
	send: (message: Record<string, unknown>) => void,
	onOpenCb?: () => void,
): void {
	panel = panelEl;
	post = send;
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
			closeVersions();
	});
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") closeVersions();
	});
}
