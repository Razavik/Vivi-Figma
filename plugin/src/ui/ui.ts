// UI плагина (MCP-версия): держит WebSocket к мосту и передаёт вызовы MCP
// в main-код плагина и обратно. Показывает только состояние моста.
const WS_URL = "ws://localhost:8787";
const CLIENT_ID = `vivi-${Math.random().toString(36).slice(2, 10)}`;

const dot = document.getElementById("dot") as HTMLElement;
const stateEl = document.getElementById("state") as HTMLElement;

let ws: WebSocket | null = null;
let reconnectTimer: number | undefined;

function setState(connected: boolean, text: string): void {
	dot.classList.toggle("on", connected);
	stateEl.textContent = text;
}

function connect(): void {
	window.clearTimeout(reconnectTimer);
	setState(false, "Подключение к мосту…");
	const url = new URL(WS_URL);
	url.searchParams.set("client", CLIENT_ID);
	ws = new WebSocket(url.toString());
	ws.onmessage = (event) => {
		let msg: { type?: string; reqId?: string; tool?: string; args?: unknown };
		try {
			msg = JSON.parse(String(event.data));
		} catch {
			return;
		}
		if (msg.type === "ready") setState(true, "Мост подключён");
		if (msg.type === "mcp_call") {
			// Точка вспыхивает при каждом вызове агента.
			dot.classList.remove("pulse");
			void dot.offsetWidth;
			dot.classList.add("pulse");
			parent.postMessage(
				{ pluginMessage: { type: "mcp_call", reqId: msg.reqId, tool: msg.tool, args: msg.args } },
				"*",
			);
		}
	};
	ws.onclose = () => {
		ws = null;
		setState(false, "Нет связи с мостом");
		reconnectTimer = window.setTimeout(connect, 2500);
	};
	ws.onerror = () => ws?.close();
}

// Ответ main-кода на вызов MCP → мост.
window.onmessage = (event) => {
	const msg = event.data?.pluginMessage;
	if (msg?.type === "mcp_result" && ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
};

connect();
