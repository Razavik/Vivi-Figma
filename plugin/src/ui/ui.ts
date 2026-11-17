// UI плагина (MCP-версия): держит WebSocket к мосту и передаёт вызовы MCP
// в main-код плагина и обратно. Ручной импорт — отдельная форма.
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
const preset = input("preset");
const urlInput = input("url");
const advanced = document.getElementById("advanced") as HTMLDetailsElement;
const dropdown = document.getElementById("preset-dropdown") as HTMLElement;
const trigger = document.getElementById("preset-trigger") as HTMLButtonElement;
const presetLabel = document.getElementById("preset-label") as HTMLElement;
const presetList = document.getElementById("preset-list") as HTMLElement;
const options = Array.from(presetList.querySelectorAll<HTMLButtonElement>("[role=option]"));
let activeOption = 0;

const windowToggle = document.getElementById("toggle-window") as HTMLButtonElement;
const importPanel = document.getElementById("import-panel") as HTMLElement;
windowToggle.onclick = () => {
	const collapsed = !importPanel.hidden;
	closeDropdown();
	importPanel.hidden = collapsed;
	document.body.classList.toggle("collapsed", collapsed);
	windowToggle.setAttribute("aria-expanded", String(!collapsed));
	const label = collapsed ? "Развернуть плагин" : "Свернуть плагин";
	windowToggle.setAttribute("aria-label", label);
	windowToggle.title = label;
	parent.postMessage({ pluginMessage: { type: "set_ui_collapsed", collapsed } }, "*");
};

function highlightOption(index: number): void {
	activeOption = index;
	for (const [i, option] of options.entries()) option.classList.toggle("active", i === index);
	trigger.setAttribute("aria-activedescendant", options[index].id);
}

function closeDropdown(): void {
	presetList.hidden = true;
	trigger.setAttribute("aria-expanded", "false");
	trigger.removeAttribute("aria-activedescendant");
}

function openDropdown(): void {
	if (trigger.disabled) return;
	presetList.hidden = false;
	trigger.setAttribute("aria-expanded", "true");
	highlightOption(Math.max(0, options.findIndex((option) => option.dataset.value === preset.value)));
}

function selectPreset(value: string): void {
	preset.value = value;
	for (const option of options) {
		const selected = option.dataset.value === value;
		option.setAttribute("aria-selected", String(selected));
		if (selected) presetLabel.textContent = option.firstElementChild?.textContent || "";
	}
	const sizes: Record<string, number> = { desktop: 1440, mobile: 390, tablet: 768 };
	if (sizes[value]) {
		input("width").value = String(sizes[value]);
		input("mobile").checked = value !== "desktop";
	}
	closeDropdown();
}

trigger.onclick = () => { if (presetList.hidden) openDropdown(); else closeDropdown(); };
trigger.onkeydown = (event) => {
	const open = !presetList.hidden;
	if (event.key === "Escape") { closeDropdown(); event.preventDefault(); }
	else if (event.key === "Tab") closeDropdown();
	else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
		event.preventDefault();
		if (!open) openDropdown();
		if (event.key === "Home") highlightOption(0);
		else if (event.key === "End") highlightOption(options.length - 1);
		else if (open) highlightOption((activeOption + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
	} else if (event.key === "Enter" || event.key === " ") {
		event.preventDefault();
		if (open) selectPreset(options[activeOption].dataset.value || "custom"); else openDropdown();
	}
};
for (const [index, option] of options.entries()) {
	option.onclick = () => { selectPreset(option.dataset.value || "custom"); trigger.focus(); };
	option.onpointermove = () => highlightOption(index);
}
document.addEventListener("pointerdown", (event) => { if (!dropdown.contains(event.target as Node)) closeDropdown(); });
dropdown.addEventListener("focusout", (event) => { if (!dropdown.contains(event.relatedTarget as Node | null)) closeDropdown(); });

let connected = false;
let supportsImport = false;
let activeImport: string | null = null;

function updateForm(): void {
	fields.disabled = activeImport !== null;
	if (activeImport) closeDropdown();
	button.disabled = !connected || !supportsImport || activeImport !== null;
	button.title = activeImport ? "Импортируем…" : "Перенести в Figma";
	button.textContent = button.title;
	button.classList.toggle("busy", activeImport !== null);
}

function showResult(text: string, state = ""): void {
	result.textContent = text;
	result.className = `result ${state}`;
	result.hidden = !text;
}

for (const id of ["width", "mobile"]) input(id).oninput = () => selectPreset("custom");

form.onsubmit = (event) => {
	event.preventDefault();
	if (button.disabled || !ws) return;
	if (advanced.querySelector(":invalid")) advanced.open = true;
	if (!form.reportValidity()) return;
	const url = urlInput.value.trim();
	let parsed: URL;
	try { parsed = new URL(url); }
	catch { showResult("Укажите полный адрес сайта, например https://example.com", "error"); urlInput.focus(); return; }
	if (!["http:", "https:"].includes(parsed.protocol)) {
		showResult("Укажите адрес http:// или https://", "error");
		return;
	}
	const reqId = `import-${Date.now()}`;
	const message: HtmlImport = {
		type: "html_import", reqId,
		args: { url, width: Number(input("width").value), isMobile: input("mobile").checked, autoLayout: input("auto-layout").checked, scroll: input("scroll").checked, waitMs: Number(input("wait-ms").value), ...(input("selector").value.trim() ? { selector: input("selector").value.trim() } : {}), ...(input("wait-for").value.trim() ? { waitFor: input("wait-for").value.trim() } : {}) },
	};
	activeImport = reqId;
	warningBox.hidden = true;
	warningBox.open = false;
	warningList.replaceChildren();
	showResult("");
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
		if (msg.type === "html_import_result" && msg.reqId === activeImport) {
			activeImport = null;
			showResult(msg.ok ? "" : msg.error || "Не удалось импортировать страницу", "error");
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
