// Relay запросов MCP → плагин. Подключённые плагины (UI-соединения моста)
// регистрируются тут; вызов уходит в самое «свежее» открытое соединение и
// ждёт mcp_result с тем же reqId. Только белый список инструментов плагина.
import { isPluginTool, timeoutFor } from "./mcp-tools.mjs";

export const MCP_TIMEOUT_MS = 30_000;

export function createRelay({ timeoutMs = MCP_TIMEOUT_MS } = {}) {
	const plugins = new Set();
	const pending = new Map();
	let seq = 0;

	// plugin: { send(message), isOpen(), lastSeen }
	return {
		add(plugin) {
			plugin.lastSeen = plugin.lastSeen ?? Date.now();
			plugins.add(plugin);
		},
		remove(plugin) {
			plugins.delete(plugin);
		},
		touch(plugin) {
			plugin.lastSeen = Date.now();
		},
		// Есть ли открытое соединение с плагином.
		available() {
			return [...plugins].some((p) => p.isOpen());
		},
		call(tool, args = {}) {
			if (!isPluginTool(tool))
				return Promise.reject(new Error(`неизвестный инструмент: ${String(tool)}`));
			const open = [...plugins].filter((p) => p.isOpen());
			if (!open.length)
				return Promise.reject(
					new Error("плагин Vivi не подключён: откройте его в Figma и проверьте, что мост запущен"),
				);
			const plugin = open.sort((a, b) => b.lastSeen - a.lastSeen)[0];
			const reqId = `mcp-${++seq}`;
			return new Promise((resolve, reject) => {
				const timer = setTimeout(() => {
					pending.delete(reqId);
					reject(new Error("плагин не ответил за отведённое время"));
				}, timeoutFor(tool, timeoutMs));
				pending.set(reqId, { resolve, reject, timer });
				plugin.send({ type: "mcp_call", reqId, tool, args: args && typeof args === "object" ? args : {} });
			});
		},
		// Ответ плагина: { reqId, ok, data?, images?, error? }.
		result(msg) {
			const item = pending.get(msg?.reqId);
			if (!item) return false;
			pending.delete(msg.reqId);
			clearTimeout(item.timer);
			if (msg.ok === true) item.resolve({ data: msg.data, images: Array.isArray(msg.images) ? msg.images : [] });
			else item.reject(new Error(typeof msg.error === "string" && msg.error ? msg.error : "ошибка плагина"));
			return true;
		},
		pendingCount: () => pending.size,
	};
}
