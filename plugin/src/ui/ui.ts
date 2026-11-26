// UI плагина (MCP-версия): держит WebSocket к мосту и передаёт вызовы MCP
// в main-код плагина и обратно. Ручной импорт — отдельная форма.
import type { BridgeMessage, HtmlImport, HtmlImportSource } from "../../../shared/protocol";

const WS_URL = "ws://localhost:8787";
const BRIDGE_PROTOCOL = "vivi-bridge-v1";

const dot = document.getElementById("dot") as HTMLElement;
const stateEl = document.getElementById("state") as HTMLElement;
const form = document.getElementById("import-form") as HTMLFormElement;
const fields = document.getElementById("import-fields") as HTMLFieldSetElement;
const button = document.getElementById("import-button") as HTMLButtonElement;
const stopButton = document.getElementById("stop-import") as HTMLButtonElement;
const result = document.getElementById("import-result") as HTMLElement;
const warningBox = document.getElementById("warnings") as HTMLDetailsElement;
const warningList = document.getElementById("warning-list") as HTMLElement;
const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const preset = input("preset");
const urlInput = input("url");
const externalOption = document.getElementById("external-resources-option")!;
const pathInput = input("path");
const htmlFile = input("html-file");
const assetFolder = input("asset-folder");
const fileDrop = document.getElementById("file-drop")!;
const fileName = document.getElementById("file-name")!;
const fileMeta = document.getElementById("file-meta")!;
const pickFile = document.getElementById("pick-file") as HTMLButtonElement;
const pickFolder = document.getElementById("pick-folder") as HTMLButtonElement;
const clearFile = document.getElementById("clear-file") as HTMLButtonElement;
const entrySelect = document.getElementById("entry") as HTMLSelectElement;
const entryField = document.getElementById("entry-field") as HTMLElement;
const sourceModes = Array.from(document.querySelectorAll<HTMLInputElement>('#source-modes input'));
const htmlExtension = /\.html?$/i;
const assetExtension = /\.(html?|css|m?js|json|svg|png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf)$/i;
let sourceMode = "url";
type UploadFile = { path: string; file: File };
let selectedFiles: UploadFile[] = [];
let selectionRevision = 0;
let scanning = false;
const advanced = document.getElementById("advanced") as HTMLDetailsElement;
const dropdown = document.getElementById("preset-dropdown") as HTMLElement;
const trigger = document.getElementById("preset-trigger") as HTMLButtonElement;
const presetLabel = document.getElementById("preset-label") as HTMLElement;
const presetList = document.getElementById("preset-list") as HTMLElement;
const options = Array.from(presetList.querySelectorAll<HTMLButtonElement>("[role=option]"));
const pills = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-preset]"));
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
	for (const pill of pills) pill.classList.toggle("active", pill.dataset.preset === value);
	for (const option of options) {
		const selected = option.dataset.value === value;
		option.setAttribute("aria-selected", String(selected));
		if (selected) presetLabel.textContent = option.firstElementChild?.textContent || "";
	}
	const sizes: Record<string, number> = { wide: 1920, desktop: 1440, mobile: 390, tablet: 768 };
	if (sizes[value]) {
		input("width").value = String(sizes[value]);
		input("mobile").checked = value === "mobile";
	}
	closeDropdown();
}

for (const pill of pills) pill.onclick = () => selectPreset(pill.dataset.preset || "desktop");

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
let supportsFiles = false;
let supportsCancel = false;
let supportsExternalResources = false;
let activeImport: { id: string; controller: AbortController; sent: boolean; buildId?: string } | null = null;
let importSequence = 0;

function updateForm(): void {
	externalOption.hidden = !supportsExternalResources || (sourceMode === "url" && !/^file:/i.test(urlInput.value.trim()));
	for (const mode of sourceModes) mode.disabled = mode.value !== "url" && !supportsFiles;
	fields.disabled = activeImport !== null;
	if (activeImport) closeDropdown();
	button.disabled = !connected || !supportsImport || scanning || activeImport !== null;
	button.title = activeImport?.controller.signal.aborted ? "Останавливаем…" : activeImport ? "Импортируем…" : "Перенести в Figma";
	button.textContent = button.title;
	button.classList.toggle("busy", activeImport !== null);
	stopButton.hidden = !activeImport || !supportsCancel;
	stopButton.disabled = !activeImport || activeImport.controller.signal.aborted;
}

function showResult(text: string, state = ""): void {
	result.textContent = text;
	result.className = `result ${state}`;
	result.hidden = !text;
}

function selectSource(mode: string): void {
	selectionRevision++;
	scanning = false;
	sourceMode = mode;
	for (const radio of sourceModes) {
		radio.checked = radio.value === mode;
		document.getElementById(`source-${radio.value}`)!.hidden = !radio.checked;
	}
	urlInput.disabled = mode !== "url";
	pathInput.disabled = mode !== "path";
	showResult("");
	updateForm();
}

for (const radio of sourceModes) radio.onchange = () => selectSource(radio.value);
urlInput.addEventListener("input", updateForm);

const ignoredPart = (part: string) => part.startsWith(".") || part === "node_modules";

function setUpload(files: UploadFile[], name: string, isFolder: boolean): void {
	const entries = files.map(({ path }) => path).filter((path) => htmlExtension.test(path)).sort();
	const bytes = files.reduce((size, item) => size + item.file.size, 0);
	if (name && !entries.length) throw new Error("В выбранном источнике нет HTML-файла.");
	selectedFiles = files;
	entrySelect.replaceChildren(...entries.map((path) => new Option(path, path)));
	entrySelect.value = entries.find((path) => /^index\.html?$/i.test(path)) ?? entries[0] ?? "";
	entryField.hidden = entries.length < 2;
	fileName.textContent = name || "HTML-файл или папка";
	fileName.title = name;
	const size = bytes < 1024 ? `${bytes} Б` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} КБ` : `${(bytes / (1024 * 1024)).toLocaleString("ru", { maximumFractionDigits: 1 })} МБ`;
	fileMeta.textContent = name ? (isFolder ? `Файлов: ${files.length} · ${size}` : size) : "Перетащите сюда";
	fileDrop.classList.toggle("has-file", Boolean(name));
	clearFile.hidden = !name;
	showResult("");
}

function selectUpload(load: (isCurrent: () => boolean) => Promise<{ files: UploadFile[]; name: string; isFolder: boolean }>): void {
	const id = ++selectionRevision;
	const isCurrent = () => selectionRevision === id;
	scanning = true;
	updateForm();
	void load(isCurrent).then(({ files, name, isFolder }) => {
		if (isCurrent()) setUpload(files, name, isFolder);
	}).catch((error) => {
		if (isCurrent()) showResult(error instanceof Error ? error.message : "Не удалось прочитать источник.", "error");
	}).finally(() => {
		if (!isCurrent()) return;
		scanning = false;
		updateForm();
	});
}

pickFile.onclick = () => htmlFile.click();
pickFolder.onclick = () => assetFolder.click();
clearFile.onclick = () => {
	selectionRevision++;
	scanning = false;
	setUpload([], "", false);
	pickFile.focus();
	updateForm();
};
htmlFile.onchange = () => {
	const file = htmlFile.files?.[0];
	htmlFile.value = "";
	if (file) selectUpload(async () => ({ files: [{ path: file.name, file }], name: file.name, isFolder: false }));
};
assetFolder.onchange = () => {
	const source = Array.from(assetFolder.files || []);
	assetFolder.value = "";
	if (!source.length) return;
	const [name] = source[0].webkitRelativePath.split("/");
	selectUpload(async () => {
		const files = source.map((file) => ({ file, path: file.webkitRelativePath.split("/").slice(1).join("/") }))
			.filter(({ path }) => assetExtension.test(path) && !path.split("/").some(ignoredPart));
		return { files, name, isFolder: true };
	});
};

async function readDirectory(folder: FileSystemDirectoryEntry, isCurrent: () => boolean): Promise<UploadFile[]> {
	const files: UploadFile[] = [];
	async function visit(dir: FileSystemDirectoryEntry, prefix: string): Promise<void> {
		const reader = dir.createReader();
		while (isCurrent()) {
			const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
			if (!batch.length) break;
			for (const entry of batch) {
				if (!isCurrent()) return;
				if (ignoredPart(entry.name)) continue;
				const path = prefix + entry.name;
				if (entry.isDirectory) await visit(entry as FileSystemDirectoryEntry, path + "/");
				if (entry.isFile && assetExtension.test(path)) {
					const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
					files.push({ path, file });
				}
			}
		}
	}
	await visit(folder, "");
	return files;
}

const isFileDrag = (event: DragEvent) => event.dataTransfer?.types.includes("Files");
document.addEventListener("dragover", (event) => { if (isFileDrag(event)) event.preventDefault(); });
document.addEventListener("drop", (event) => { if (isFileDrag(event)) event.preventDefault(); });
fileDrop.ondragover = (event) => {
	if (!isFileDrag(event) || !event.dataTransfer) return;
	event.preventDefault();
	event.dataTransfer.dropEffect = activeImport ? "none" : "copy";
	fileDrop.classList.toggle("is-dragging", !activeImport);
};
fileDrop.ondragleave = (event) => {
	if (!fileDrop.contains(event.relatedTarget as Node | null)) fileDrop.classList.remove("is-dragging");
};
fileDrop.ondrop = (event) => {
	fileDrop.classList.remove("is-dragging");
	if (!isFileDrag(event) || !event.dataTransfer) return;
	event.preventDefault();
	if (activeImport || sourceMode !== "file") return;
	const items = Array.from(event.dataTransfer.items).filter((item) => item.kind === "file");
	const files = Array.from(event.dataTransfer.files);
	if ((items.length || files.length) !== 1) {
		showResult("Перетащите один HTML-файл или одну папку.", "error");
		return;
	}
	const entry = items[0]?.webkitGetAsEntry?.();
	if (entry?.isDirectory) {
		selectUpload(async (isCurrent) => ({ files: await readDirectory(entry as FileSystemDirectoryEntry, isCurrent), name: entry.name, isFolder: true }));
	} else if (files[0]) {
		const file = files[0];
		selectUpload(async () => ({ files: [{ path: file.name, file }], name: file.name, isFolder: false }));
	}
};

function readBase64(file: File, signal: AbortSignal): Promise<string> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) return reject(signal.reason);
		const reader = new FileReader();
		const abort = () => reader.abort();
		signal.addEventListener("abort", abort, { once: true });
		reader.onloadend = () => signal.removeEventListener("abort", abort);
		reader.onload = () => resolve(String(reader.result).split(",", 2)[1]);
		reader.onerror = reader.onabort = () => reject(new Error(`Не удалось прочитать ${file.name}.`));
		reader.readAsDataURL(file);
	});
}

async function importSource(signal: AbortSignal): Promise<HtmlImportSource> {
	if (sourceMode === "url") {
		const url = urlInput.value.trim();
		const protocol = new URL(url).protocol;
		if (protocol === "file:" && !supportsFiles) throw new Error("Перезапустите мост Vivi для импорта локальных файлов.");
		if (!["http:", "https:", "file:"].includes(protocol)) throw new Error("Укажите адрес http://, https:// или file://.");
		return { url };
	}
	if (sourceMode === "path") return { path: pathInput.value.trim() };
	const entry = entrySelect.value;
	if (!htmlExtension.test(entry)) throw new Error("Выберите HTML-файл или папку, в которой он находится.");
	const files = [];
	for (const { path, file } of selectedFiles) files.push({ path, data: await readBase64(file, signal) });
	return { upload: { entry, files } };
}

for (const id of ["width", "mobile"]) input(id).oninput = () => selectPreset("custom");

form.onsubmit = async (event) => {
	event.preventDefault();
	if (button.disabled || !ws) return;
	if (advanced.querySelector(":invalid")) advanced.open = true;
	if (!form.reportValidity()) return;
	const socket = ws;
	const job = { id: `import-${++importSequence}`, controller: new AbortController(), sent: false };
	const args = { width: Number(input("width").value), isMobile: input("mobile").checked, autoLayout: input("auto-layout").checked, scroll: input("scroll").checked, waitMs: Number(input("wait-ms").value), ...(input("selector").value.trim() ? { selector: input("selector").value.trim() } : {}), ...(input("wait-for").value.trim() ? { waitFor: input("wait-for").value.trim() } : {}) };
	activeImport = job;
	warningBox.hidden = true;
	warningBox.open = false;
	warningList.replaceChildren();
	showResult("");
	updateForm();
	try {
		const source = await importSource(job.controller.signal);
		if (activeImport !== job) return;
		if (socket.readyState !== WebSocket.OPEN) throw new Error("Нет связи с мостом.");
		const allowNetwork = !externalOption.hidden && input("external-resources").checked;
		const message: HtmlImport = { type: "html_import", reqId: job.id, cancellable: supportsCancel, args: { ...source, ...args, ...(allowNetwork ? { allowNetwork: true } : {}) } };
		socket.send(JSON.stringify(message));
		job.sent = true;
	} catch (error) {
		if (activeImport !== job) return;
		activeImport = null;
		showResult(error instanceof Error ? error.message : "Не удалось отправить источник.", "error");
		updateForm();
	}
};

function stopBuild(reqId: string): void {
	parent.postMessage({ pluginMessage: { type: "html_import_cancel_build", reqId } }, "*");
}

stopButton.onclick = () => {
	const job = activeImport;
	if (!job || job.controller.signal.aborted) return;
	job.controller.abort();
	if (job.buildId) stopBuild(job.buildId);
	if (job.sent && ws?.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify({ type: "html_import_cancel", reqId: job.id }));
	} else {
		activeImport = null;
		showResult("Импорт остановлен.");
	}
	updateForm();
};

let ws: WebSocket | null = null;
let reconnectTimer: number | undefined;
const pairingForm = document.getElementById("bridge-pairing") as HTMLFormElement;
const pairingInput = document.getElementById("bridge-code") as HTMLInputElement;
let pairingCode = "";

function setState(value: boolean, text: string): void {
	connected = value;
	dot.classList.toggle("on", value);
	stateEl.textContent = text;
	updateForm();
}

function connect(): void {
	window.clearTimeout(reconnectTimer);
	if (!pairingCode) {
		setState(false, "Введите код подключения");
		return;
	}
	setState(false, "Подключение к мосту…");
	const previous = ws;
	const socket = new WebSocket(WS_URL, [pairingCode, BRIDGE_PROTOCOL]);
	ws = socket;
	previous?.close();
	socket.onopen = () => {
		if (socket.protocol !== BRIDGE_PROTOCOL) socket.close();
	};
	socket.onmessage = (event) => {
		if (ws !== socket || socket.protocol !== BRIDGE_PROTOCOL) return;
		let msg: BridgeMessage;
		try {
			msg = JSON.parse(String(event.data));
		} catch {
			return;
		}
		if (msg.type === "ready") {
			pairingForm.hidden = true;
			supportsImport = msg.htmlImport === true;
			supportsFiles = msg.htmlFileImport === true;
			supportsCancel = msg.htmlImportCancel === true;
			supportsExternalResources = msg.htmlImportExternalResources === true;
			if (!supportsFiles && sourceMode !== "url") selectSource("url");
			setState(true, "Мост подключён");
			if (!supportsImport) showResult("Перезапустите локальный мост Vivi, чтобы включить импорт сайтов.", "error");
		}
		if (msg.type === "html_import_result" && msg.reqId === activeImport?.id) {
			activeImport = null;
			if (msg.cancelled) showResult("Импорт остановлен.");
			else if (msg.ok) showResult("");
			else showResult(msg.error || "Не удалось импортировать страницу", "error");
			for (const text of msg.warnings || []) {
				const li = document.createElement("li");
				li.textContent = text;
				warningList.append(li);
			}
			warningBox.hidden = !warningList.childElementCount;
			updateForm();
		}
		if (msg.type === "html_import_cancel_build") stopBuild(msg.reqId);
		if (msg.type === "mcp_call" && connected) {
			// Точка вспыхивает при каждом вызове агента.
			dot.classList.remove("pulse");
			void dot.offsetWidth;
			dot.classList.add("pulse");
			parent.postMessage({ pluginMessage: msg }, "*");
			if (msg.importBuild && activeImport) {
				activeImport.buildId = msg.reqId;
				if (activeImport.controller.signal.aborted) stopBuild(msg.reqId);
			}
		}
	};
	socket.onclose = () => {
		if (ws !== socket) return;
		ws = null;
		if (activeImport) {
			activeImport.controller.abort();
			if (activeImport.buildId) stopBuild(activeImport.buildId);
			showResult("Связь прервалась. Проверьте холст перед повторным импортом.", "error");
		}
		activeImport = null;
		supportsImport = false;
		supportsFiles = false;
		supportsCancel = false;
		supportsExternalResources = false;
		pairingForm.hidden = false;
		setState(false, "Проверьте запуск моста и код подключения");
		reconnectTimer = window.setTimeout(connect, 2500);
	};
}

pairingForm.addEventListener("submit", (event) => {
	event.preventDefault();
	pairingCode = pairingInput.value;
	if (!/^[a-f0-9]{64}$/.test(pairingCode)) return;
	pairingInput.value = "";
	connect();
});

// Ответ main-кода на вызов MCP → мост.
window.onmessage = (event) => {
	if (event.source !== parent) return;
	const msg = event.data?.pluginMessage;
	if (msg?.type === "mcp_result" && ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
};

connect();
