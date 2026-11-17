// UI плагина (MCP-версия): держит WebSocket к мосту и передаёт вызовы MCP
// в main-код плагина и обратно. Показывает только состояние моста.
import type { BridgeMessage, HtmlImport } from "../../../shared/protocol";

const WS_URL = "ws://localhost:8787";
const CLIENT_ID = `vivi-${Math.random().toString(36).slice(2, 10)}`;

const dot = document.getElementById("dot") as HTMLElement;
const stateEl = document.getElementById("state") as HTMLElement;
const form = document.getElementById("import-form") as HTMLFormElement;
const fields = document.getElementById("import-fields") as HTMLFieldSetElement;
const button = document.getElementById("import-button") as HTMLButtonElement;
const result = document.getElementById("import-result") as HTMLElement;
const warningBox = document.getElementById("warnings") as HTMLDetailsElement;
const warningList = document.getElementById("warning-list") as HTMLElement;
const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const preset = document.getElementById("preset") as HTMLSelectElement;

let connected = false;
let supportsImport = false;
let activeImport: string | null = null;

function updateForm(): void {
	fields.disabled = activeImport !== null;
	button.disabled = !connected || !supportsImport || activeImport !== null;
	button.textContent = activeImport ? "Импортируем…" : "Перенести в Figma";
}

function showResult(text: string, state = ""): void {
	result.textContent = text;
	result.className = `result ${state}`;
}

preset.onchange = () => {
	const sizes: Record<string, [number, number]> = { desktop: [1440, 900], mobile: [390, 844], tablet: [768, 1024] };
	const size = sizes[preset.value];
	if (!size) return;
	input("width").value = String(size[0]);
	input("height").value = String(size[1]);
	input("mobile").checked = preset.value !== "desktop";
};
for (const id of ["width", "height", "mobile"]) input(id).oninput = () => { preset.value = "custom"; };

form.onsubmit = (event) => {
	event.preventDefault();
	if (!form.reportValidity() || button.disabled || !ws) return;
	const url = input("url").value.trim();
	if (!["http:", "https:"].includes(new URL(url).protocol)) {
		showResult("Укажите адрес http:// или https://", "error");
		return;
	}
	const reqId = `import-${Date.now()}`;
	const message: HtmlImport = {
		type: "html_import", reqId,
		args: { url, width: Number(input("width").value), height: Number(input("height").value), isMobile: input("mobile").checked, scroll: input("scroll").checked, waitMs: Number(input("wait-ms").value), ...(input("selector").value.trim() ? { selector: input("selector").value.trim() } : {}), ...(input("wait-for").value.trim() ? { waitFor: input("wait-for").value.trim() } : {}) },
	};
	activeImport = reqId;
	warningBox.hidden = true;
	warningList.replaceChildren();
	showResult("Подготавливаем импорт…");
	updateForm();
	ws.send(JSON.stringify(message));
};

let ws: WebSocket | null = null;
let reconnectTimer: number | undefined;

function setState(value: boolean, text: string): void {
	connected = value;
	dot.classList.toggle("on", value);
	stateEl.textContent = text;
	updateForm();
}

function connect(): void {
	window.clearTimeout(reconnectTimer);
	setState(false, "Подключение к мосту…");
	const url = new URL(WS_URL);
	url.searchParams.set("client", CLIENT_ID);
	ws = new WebSocket(url.toString());
	ws.onmessage = (event) => {
		let msg: BridgeMessage;
		try {
			msg = JSON.parse(String(event.data));
		} catch {
			return;
		}
		if (msg.type === "ready") {
			supportsImport = msg.htmlImport === true;
			setState(true, "Мост подключён");
			if (!supportsImport) showResult("Перезапустите локальный мост Vivi, чтобы включить импорт сайтов.", "error");
		}
		if (msg.type === "html_import_progress" && msg.reqId === activeImport)
			showResult(msg.stage === "render" ? "Загружаем сайт и рассчитываем макет…" : "Создаём слои в Figma…");
		if (msg.type === "html_import_result" && msg.reqId === activeImport) {
			activeImport = null;
			showResult(msg.ok ? `Готово! Макет создан${msg.count ? ` · ${msg.count} слоёв` : ""}.` : msg.error || "Не удалось импортировать страницу", msg.ok ? "success" : "error");
			for (const text of msg.warnings || []) {
				const li = document.createElement("li");
				li.textContent = text;
				warningList.append(li);
			}
			warningBox.hidden = !warningList.childElementCount;
			updateForm();
		}
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
		if (activeImport) showResult("Связь прервалась. Проверьте холст перед повторным импортом.", "error");
		activeImport = null;
		supportsImport = false;
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
