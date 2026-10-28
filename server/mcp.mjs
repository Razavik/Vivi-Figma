// MCP-сервер Vivi (stdio): внешние агенты (Claude Code, Devin, Cursor…) могут
// смотреть дизайн в открытом файле Figma. Только чтение. Данные берутся из
// плагина через мост: этот процесс подключается к ws://localhost:8787 как
// клиент role=mcp, мост пересылает вызов в плагин и возвращает ответ.
//
// Подключение (пример для Claude Code):
//   claude mcp add vivi-figma -- node D:/Work/Learning/FigmaAgent/server/mcp.mjs
// Мост (npm start) и плагин в Figma должны быть запущены.
import { spawn } from "node:child_process";
import { mkdirSync, openSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import WebSocket from "ws";
import { BATCH_LIMITS, MCP_TOOLS, timeoutFor } from "./mcp-tools.mjs";
import { guideText } from "./design-guide.mjs";
import { applyLayoutDefaults, prepareDesign, validateSpec } from "./design-pipeline.mjs";
import { variantEdits } from "./variants-macro.mjs";
import { searchIcons } from "./icons.mjs";
import { SCHEMA_NAMES, schemaText } from "./schemas.mjs";
import { exportRoots, exportTarget, projectRoot, resolveArgs, saveExported } from "./mcp-export.mjs";

// server/.env — тот же файл, что у моста (порт и токен).
try {
	const dir = dirname(fileURLToPath(import.meta.url));
	for (const line of readFileSync(join(dir, ".env"), "utf-8").split(/\r?\n/)) {
		const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
		if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
	}
} catch {
	/* .env необязателен */
}

const PORT = Number(process.env.PORT || 8787);
const CALL_TIMEOUT = 40_000;
const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
// Куда складываются экспортированные картинки (дальше этой папки писать нельзя).
const PROJECT = projectRoot(process.env, process.cwd(), homedir());
const EXPORT = exportRoots({
	project: PROJECT,
	extra: process.env.MCP_EXPORT_ROOTS,
	fallback: process.env.MCP_EXPORT_DIR || join(homedir(), ".vivi-figma", "exports"),
});

let socket = null;
let opening = null;
let seq = 0;
const waiting = new Map();

// Мост не запущен — поднимаем его в фоне (отдельный процесс, переживает этот):
// лог в ~/.vivi-figma/bridge.log. MCP_NO_AUTOSTART=1 отключает. Параллельные запуски
// безопасны: лишний мост упадёт на занятом порте, а клиенты подключатся к первому.
// Лог моста — в постоянной папке пользователя (кэш npx может очиститься).
const LOG_DIR = join(homedir(), ".vivi-figma");
const LOG_FILE = join(LOG_DIR, "bridge.log");
let starting = null;
function startBridge() {
	if (starting) return starting;
	let out = "ignore";
	try {
		mkdirSync(LOG_DIR, { recursive: true });
		out = openSync(LOG_FILE, "a");
	} catch {
		/* без лога тоже работаем */
	}
	const child = spawn(process.execPath, [join(SERVER_DIR, "index.mjs")], {
		cwd: SERVER_DIR,
		detached: true,
		stdio: ["ignore", out, out],
		windowsHide: true,
		env: process.env,
	});
	child.on("error", () => {});
	child.unref();
	console.error("vivi-figma MCP: мост не был запущен — стартую в фоне (лог ~/.vivi-figma/bridge.log)");
	starting = new Promise((r) => setTimeout(r, 800)).finally(() => setTimeout(() => (starting = null), 20_000));
	return starting;
}

async function open() {
	try {
		return await connectOnce();
	} catch (err) {
		if (process.env.MCP_NO_AUTOSTART === "1") throw err;
		await startBridge();
		let last = err;
		for (let i = 0; i < 30; i++) {
			await new Promise((r) => setTimeout(r, 500));
			try {
				return await connectOnce();
			} catch (e) {
				last = e;
			}
		}
		throw last;
	}
}

function connectOnce() {
	if (socket && socket.readyState === WebSocket.OPEN) return Promise.resolve(socket);
	if (opening) return opening;
	opening = new Promise((resolve, reject) => {
		const url = new URL(`ws://127.0.0.1:${PORT}/`);
		url.searchParams.set("role", "mcp");
		const ws = new WebSocket(url);
		ws.on("open", () => {
			socket = ws;
			opening = null;
			resolve(ws);
		});
		ws.on("message", (raw) => {
			let msg;
			try {
				msg = JSON.parse(raw.toString());
			} catch {
				return;
			}
			const item = waiting.get(msg.reqId);
			if (msg.type !== "mcp_result" || !item) return;
			waiting.delete(msg.reqId);
			clearTimeout(item.timer);
			if (msg.ok) item.resolve(msg);
			else item.reject(new Error(msg.error || "ошибка"));
		});
		ws.on("close", () => {
			if (socket === ws) socket = null;
			opening = null;
			for (const [id, item] of waiting) {
				clearTimeout(item.timer);
				item.reject(new Error("соединение с мостом закрыто"));
				waiting.delete(id);
			}
		});
		ws.on("error", () => {
			opening = null;
			reject(new Error(`мост не отвечает на ws://127.0.0.1:${PORT} и не запустился сам — проверьте ~/.vivi-figma/bridge.log или запустите вручную (cd server && npm start)`));
		});
	});
	return opening;
}

async function call(tool, args) {
	const limit = timeoutFor(tool, CALL_TIMEOUT - 10_000) + 10_000;
	const ws = await open();
	const reqId = `c${++seq}`;
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			waiting.delete(reqId);
			reject(new Error("мост не ответил вовремя"));
		}, limit);
		waiting.set(reqId, { resolve, reject, timer });
		ws.send(JSON.stringify({ type: "mcp_call", reqId, tool, args }));
	});
}

const server = new McpServer({ name: "vivi-figma", version: "0.1.0" });

// Защита от записи не в тот файл: имя открытого файла запоминается; если оно
// сменилось с прошлого вызова (или не совпало с аргументом file) — отказ один раз.
let lastFile = null;

// Сборка плагина, которая едет с этим пакетом (plugin/dist/build-id.txt). Если плагин в Figma собран
// из другой, агент увидит pluginOutdated и подсказку переоткрыть плагин (иначе правки сервера «не работают»).
let EXPECTED_BUILD = null;
try {
	EXPECTED_BUILD = readFileSync(join(SERVER_DIR, "..", "plugin", "dist", "build-id.txt"), "utf-8").trim() || null;
} catch {
	/* плагин ставили вручную — сверять нечего */
}
let outdatedNote = null;
let outdatedShown = false;
function checkBuild(st) {
	if (!EXPECTED_BUILD || !st || typeof st !== "object") return;
	outdatedNote =
		st.build === EXPECTED_BUILD
			? null
			: "плагин в Figma собран из другой версии, чем сервер: закройте плагин Vivi и откройте его заново (Plugins → Development), иначе часть возможностей не заработает";
}

async function guardFile(expected) {
	const st = (await call("status", {})).data;
	checkBuild(st);
	const now = st?.file ?? null;
	const prev = lastFile;
	lastFile = now;
	if (expected && now && expected !== now) throw new Error(`открыт файл «${now}», а ожидался «${expected}» — запись не выполнена`);
	if (!expected && prev && now && prev !== now)
		throw new Error(`открытый файл сменился: был «${prev}», сейчас «${now}». Запись не выполнена — вызовите figma_status, убедитесь, что это нужный файл, и повторите (или передайте file).`);
}

const text = (value) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }] });
const READONLY = process.env.MCP_READONLY === "1";

// Инструменты, которые отвечают без плагина.
function localTool(name, args) {
	if (name === "schema") {
		if (!args.name) return text({ schemas: SCHEMA_NAMES });
		const body = schemaText(args.name);
		if (!body) throw new Error(`нет схемы «${args.name}». Доступны: ${SCHEMA_NAMES.join(", ")}`);
		return text(body);
	}
	if (name === "guide") {
		const body = guideText(args.topic);
		if (!body) throw new Error("topic: spec | craft | components | edits | all | process | taste | typography | layout | imagery | patterns | anatomy | shapes | genres | trends | composition");
		return text(body);
	}
	return text({ query: args.query, icons: searchIcons(args.query) });
}

const handlers = {};
for (const [name, def] of Object.entries(MCP_TOOLS)) {
	if (READONLY && def.write) continue;
	server.registerTool(
		`figma_${name}`,
		{
			description: def.description,
			inputSchema: def.input,
			annotations: def.write
				? { readOnlyHint: false, destructiveHint: name !== "create", idempotentHint: false, openWorldHint: name === "create" }
				: { readOnlyHint: true, openWorldHint: false },
		},
		(handlers[name] = async (args) => {
			try {
				// макро-инструмент (figma_variants) раскрывается в операции figma_edit
				if (def.macro) {
					const { file, ...rest } = args || {};
					return await handlers.edit({ edits: variantEdits(rest), ...(file ? { file } : {}) });
				}
				if (def.local) return localTool(name, args || {});
				// Ссылки Figma и id вида 12-345 → "12:345"; ссылка на другой файл — отказ.
				const resolved = resolveArgs(args || {});
				if (resolved.error) throw new Error(resolved.error);
				if (resolved.fileKey) {
					const st = (await call("status", {})).data;
					if (st?.fileKey && st.fileKey !== resolved.fileKey)
						throw new Error(`ссылка на другой файл (${resolved.fileKey}), а в Figma открыт ${st.fileKey}: откройте нужный файл с плагином`);
				}
				// Куда писать картинки — проверяем до вызова плагина.
				const isExport = name === "export" || name === "export_assets";
				const target = isExport ? exportTarget(EXPORT.roots, resolved.args.dir, resolved.args.folder, EXPORT.defaultDir) : null;
				if (target?.error) throw new Error(target.error);
				// Запись: проверка спеки и подготовка (иконки, фото) до вызова плагина.
				let prepared = null;
				if (def.write) {
					const { file, ...rest } = resolved.args;
					resolved.args = rest;
					await guardFile(file);
				}
				if (name === "create" || name === "edit") {
					const payload = name === "create" ? resolved.args.spec : resolved.args.edits;
					const bad = validateSpec(payload);
					if (bad) throw new Error(bad);
					applyLayoutDefaults(payload);
					prepared = await prepareDesign(payload, { roots: EXPORT.roots });
				}
				const limit = BATCH_LIMITS[name];
				const batch = limit && Array.isArray(resolved.args.ids) ? resolved.args.ids : null;
				if (batch) {
					if (batch.length > limit) throw new Error(`ids: не больше ${limit} за вызов`);
					const { ids: _ids, ...rest } = resolved.args;
					const results = await Promise.all(
						batch.map((id) =>
							call(name, { ...rest, id }).then(
								(r) => ({ id, ok: true, r }),
								(e) => ({ id, ok: false, error: String(e?.message || e) }),
							),
						),
					);
					const content = [{ type: "text", text: JSON.stringify(results.map((x) => (x.ok ? (x.r.data ?? null) : { id: x.id, error: x.error }))) }];
					for (const x of results)
						if (x.ok)
							for (const img of x.r.images || [])
								if (img && typeof img.data === "string") content.push({ type: "image", data: img.data, mimeType: img.mimeType || "image/png" });
					return { content };
				}
				if (limit && !resolved.args.id) throw new Error("нужен id или ids");
				const res = await call(name, resolved.args);
				if (name === "status" && res.data?.file) lastFile = res.data.file;
				if (isExport && target) {
					const saved = saveExported(target.root, target.folder, res.data?.files);
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({ dir: saved.dir, files: saved.files, skipped: res.data?.skipped ?? [], ...(res.data?.assets ? { assets: res.data.assets } : {}) }),
							},
						],
					};
				}
				if (name === "status") checkBuild(res.data);
				let data = prepared && res.data && typeof res.data === "object" ? { ...res.data, prepared } : res.data;
				// статус сообщает о старом плагине всегда, запись — один раз за сессию
				if (outdatedNote && data && typeof data === "object" && (name === "status" || (def.write && !outdatedShown))) {
					data = { ...data, pluginOutdated: true, pluginHint: outdatedNote };
					if (def.write) outdatedShown = true;
				}
				const content = [{ type: "text", text: JSON.stringify(data ?? null) }];
				for (const img of res.images || [])
					if (img && typeof img.data === "string")
						content.push({ type: "image", data: img.data, mimeType: img.mimeType || "image/png" });
				return { content };
			} catch (err) {
				return { isError: true, content: [{ type: "text", text: String(err?.message || err) }] };
			}
		}),
	);
}

await server.connect(new StdioServerTransport());
console.error("vivi-figma MCP: готов (stdio), мост ws://127.0.0.1:" + PORT + "; картинки только в " + EXPORT.roots.join("; "));
