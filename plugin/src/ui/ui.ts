// UI плагина (MCP-версия): держит WebSocket к мосту и передаёт вызовы MCP
// в main-код плагина и обратно. Показывает состояние связи.
const WS_URL = "ws://localhost:8787";
const CLIENT_ID = `vivi-${Math.random().toString(36).slice(2, 10)}`;

const dot = document.getElementById("dot") as HTMLElement;
const stateEl = document.getElementById("state") as HTMLElement;
const callsEl = document.getElementById("calls") as HTMLElement;
const lastEl = document.getElementById("last") as HTMLElement;
const tokenEl = document.getElementById("token") as HTMLInputElement;

let ws: WebSocket | null = null;
let reconnectTimer: number | undefined;
let calls = 0;
let token = "";

function setState(connected: boolean, text: string): void {
	dot.classList.toggle("on", connected);
	stateEl.textContent = text;
}

function post(message: Record<string, unknown>): void {
	parent.postMessage({ pluginMessage: message }, "*");
}

function connect(): void {
	window.clearTimeout(reconnectTimer);
	setState(false, "Подключение к мосту…");
	const url = new URL(WS_URL);
	url.searchParams.set("client", CLIENT_ID);
	if (token) url.searchParams.set("token", token);
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
			calls++;
			callsEl.textContent = `Вызовов: ${calls}`;
			lastEl.textContent = String(msg.tool || "");
			dot.classList.remove("pulse");
			void dot.offsetWidth;
			dot.classList.add("pulse");
			post({ type: "mcp_call", reqId: msg.reqId, tool: msg.tool, args: msg.args });
		}
	};
	ws.onclose = (event) => {
		ws = null;
		setState(false, event.code === 4401 ? "Мост отклонил токен" : "Нет связи с мостом — запустите его");
		reconnectTimer = window.setTimeout(connect, event.code === 4401 ? 10_000 : 2500);
	};
	ws.onerror = () => ws?.close();
}

// Ответ main-кода на вызов MCP → мост; настройки из хранилища.
window.onmessage = (event) => {
	const msg = event.data?.pluginMessage;
	if (!msg) return;
	if (msg.type === "mcp_result") {
		if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
	} else if (msg.type === "settings_restore") {
		const saved = msg.data as { bridgeToken?: unknown } | null;
		token = typeof saved?.bridgeToken === "string" ? saved.bridgeToken : "";
		tokenEl.value = token;
		ws?.close();
		connect();
	}
};

tokenEl.onchange = () => {
	token = tokenEl.value.trim().slice(0, 200);
	post({ type: "save_settings", data: { bridgeToken: token } });
	ws?.close();
};

connect();
