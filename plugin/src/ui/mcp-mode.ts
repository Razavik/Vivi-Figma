// Режим MCP: внешним агентам нужен запущенный плагин, но чат в этот момент не
// нужен — окно сжимается в маленький блок (точка связи, счётчик вызовов,
// кнопка «развернуть»). Выбор запоминается в настройках.
import { S } from "./ui-state";

export const MCP_MINI_SIZE = { w: 156, h: 44 };
export const NORMAL_SIZE = { w: 420, h: 660 };

const btn = document.getElementById("mcp-btn") as HTMLButtonElement;
const mini = document.getElementById("mcp-mini") as HTMLElement;
const dot = document.getElementById("mcp-dot") as HTMLElement;
const label = document.getElementById("mcp-label") as HTMLElement;
const expand = document.getElementById("mcp-expand") as HTMLButtonElement;

let post: (message: Record<string, unknown>) => void = () => {};
let save: () => void = () => {};
let calls = 0;
let connected = false;

function render(): void {
	dot.classList.toggle("on", connected);
	dot.title = connected ? "Мост подключён" : "Нет связи с мостом";
	label.textContent = calls ? `MCP · ${calls}` : "MCP";
	label.title = calls ? `Вызовов от внешних агентов: ${calls}` : "Ожидает вызовов от внешних агентов";
}

// Применить режим к окну (без записи в настройки).
export function applyMcpMode(on: boolean): void {
	document.body.classList.toggle("mcp-mode", on);
	mini.hidden = !on;
	btn.classList.toggle("active", on);
	post({ type: "resize_ui", ...(on ? MCP_MINI_SIZE : NORMAL_SIZE) });
	render();
}

export function setMcpMode(on: boolean): void {
	S.settings.mcpMode = on;
	save();
	applyMcpMode(on);
}

export function setMcpConnected(value: boolean): void {
	connected = value;
	render();
}

export function noteMcpCall(): void {
	calls++;
	dot.classList.remove("pulse");
	void dot.offsetWidth;
	dot.classList.add("pulse");
	render();
}

export function initMcpMode(opts: {
	post: (message: Record<string, unknown>) => void;
	save: () => void;
}): void {
	post = opts.post;
	save = opts.save;
	btn.onclick = () => setMcpMode(!S.settings.mcpMode);
	expand.onclick = () => setMcpMode(false);
	render();
}
