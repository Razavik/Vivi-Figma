// Ручной импорт из UI: ответы и запись привязаны к тому же соединению плагина,
// а не к последнему активному файлу в общем relay.
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HTML_ASSET_TYPES, htmlToDesign, isAssetPath, isHtmlFile, withinImportRoot } from "./html-to-design.mjs";
import { confirmImportFolder } from "./local-import-consent.mjs";
import { MCP_TOOLS } from "./mcp-tools.mjs";

const fields = MCP_TOOLS.html_to_design.input;
const sourceString = z.string().trim().min(1).max(4096);
const input = z.object({
	...Object.fromEntries(["width", "isMobile", "autoLayout", "waitFor", "waitMs", "selector", "scroll", "allowNetwork"].map((key) => [key, fields[key]])),
	url: sourceString.optional(),
	path: sourceString.optional(),
	upload: z.object({
		entry: z.string().min(1).max(4096),
		files: z.array(z.object({ path: z.string().min(1).max(4096), data: z.string() })).min(1),
	}).optional(),
});

function importRoots(raw = process.env.VIVI_HTML_IMPORT_ROOTS || "") {
	return raw.split(";").map((path) => path.trim())
		.filter((path) => isAbsolute(path) && !/^[\\/]{2}/.test(path))
		.map((path) => resolve(path)).filter((path) => dirname(path) !== path);
}

function parseSource({ url, path, upload, ...options }) {
	if (Number(url !== undefined) + Number(path !== undefined) + Number(upload !== undefined) !== 1)
		throw new Error("Укажите только один источник: ссылку, путь или файл.");
	if (url) {
		let protocol;
		try { protocol = new URL(url).protocol; } catch { /* invalid URL */ }
		if (["http:", "https:"].includes(protocol)) return { ...options, url };
		if (protocol !== "file:") throw new Error("Укажите адрес http://, https:// или file://");
		path = url;
	}
	if (path) {
		path = path.replace(/^"(.*)"$/, "$1");
		if (/^file:/i.test(path)) {
			const parsed = new URL(path);
			if (parsed.hostname) throw new Error("Укажите ссылку на локальный HTML-файл.");
			path = fileURLToPath(parsed);
		}
		if (!isHtmlFile(path)) throw new Error("Укажите путь к файлу .html или .htm.");
		return { ...options, path };
	}
	const files = new Map();
	for (const { path, data } of upload.files) {
		if (!isAssetPath(path) || !HTML_ASSET_TYPES[extname(path).toLowerCase()] || files.has(path))
			throw new Error("В загрузке есть повторяющийся или неподдерживаемый файл.");
		const body = Buffer.from(data, "base64");
		if (body.toString("base64") !== data) throw new Error("Не удалось прочитать загруженный файл.");
		files.set(path, body);
	}
	if (!isHtmlFile(upload.entry) || !files.get(upload.entry)?.length) throw new Error("Выберите непустой HTML-файл.");
	return { ...options, upload: { entry: upload.entry, files } };
}

export function createManualImporter({ send, isOpen, convert = htmlToDesign, roots = importRoots(), confirmFolder = null, readonly = process.env.MCP_READONLY === "1" }) {
	const pending = new Map();
	const approvedFolders = new Set();
	let seq = 0;
	const sessionId = randomUUID();
	let active = null;
	const reply = (body) => { try { if (isOpen()) send(body); } catch { /* соединение закрылось */ } };
	async function authorizePath(source, signal) {
		const supplied = source.path;
		if (/^[\\/]{2}/.test(supplied) || /[\x00-\x1f]/.test(supplied))
			throw new Error("Укажите путь к HTML-файлу на локальном диске.");
		if (!isAbsolute(supplied) && !roots.length) throw new Error("Укажите абсолютный путь к HTML-файлу.");
		const path = resolve(roots[0] || process.cwd(), supplied);
		if (roots.some((root) => withinImportRoot(root, path))) return roots;
		const folder = await realpath(dirname(path));
		signal.throwIfAborted();
		if (dirname(folder) === folder || /^[\\/]{2}/.test(folder))
			throw new Error("Для корня диска или сетевой папки выберите файл в режиме «Файл».");
		if (confirmFolder && !approvedFolders.has(folder)) {
			const allowed = await confirmFolder(folder, signal);
			signal.throwIfAborted();
			if (!allowed) throw new Error("Доступ к папке не разрешён.");
			approvedFolders.add(folder);
		}
		source.path = resolve(folder, basename(path));
		return [folder];
	}
	function call(job, tool, args = {}) {
		if (!isOpen()) return Promise.reject(new Error("Плагин отключён"));
		const reqId = `manual-${sessionId}-${++seq}`;
		const importBuild = tool === "create" && job.cancellable;
		if (importBuild) job.buildId = reqId;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				pending.delete(reqId);
				if (importBuild) reply({ type: "html_import_cancel_build", reqId });
				reject(new Error("Figma не ответила вовремя"));
			}, tool === "create" ? 120_000 : 30_000);
			pending.set(reqId, { resolve, reject, timer });
			if (!importBuild) job.readId = reqId;
			try { send({ type: "mcp_call", reqId, tool, args, ...(importBuild ? { importBuild: true } : {}) }); }
			catch (err) { clearTimeout(timer); pending.delete(reqId); reject(err); }
		});
	}
	return {
		result(msg) {
			const item = pending.get(msg.reqId);
			if (!item) return false;
			clearTimeout(item.timer);
			pending.delete(msg.reqId);
			if (msg.ok) item.resolve(msg.data);
			else item.reject(Object.assign(new Error(msg.error || "Ошибка Figma"), { cancelled: msg.cancelled === true }));
			return true;
		},
		cancel(reqId) {
			const job = active;
			if (job?.reqId !== reqId || !job.cancellable || job.controller.signal.aborted) return;
			job.controller.abort();
			if (job.buildId) {
				reply({ type: "html_import_cancel_build", reqId: job.buildId });
			} else {
				const item = pending.get(job.readId);
				if (item) {
					clearTimeout(item.timer);
					pending.delete(job.readId);
					item.reject(job.controller.signal.reason);
				}
			}
		},
		dispose() {
			active?.controller.abort();
			for (const item of pending.values()) {
				clearTimeout(item.timer);
				item.reject(new Error("Плагин отключён"));
			}
			pending.clear();
		},
		async start(reqId, args, cancellable = false) {
			if (active) return reply({ type: "html_import_result", reqId, ok: false, error: "Дождитесь завершения текущего импорта" });
			const job = active = { reqId, controller: new AbortController(), cancellable };
			const { signal } = job.controller;
			try {
				if (readonly) throw new Error("Импорт отключён: мост запущен в режиме только чтения");
				const parsed = input.safeParse(args);
				if (!parsed.success) throw new Error("Проверьте источник и настройки. Ширина: 320–4096 px.");
				const source = parseSource(parsed.data);
				const allowedRoots = source.path ? await authorizePath(source, signal) : roots;
				signal.throwIfAborted();
				const before = await call(job, "status");
				signal.throwIfAborted();
				reply({ type: "html_import_progress", reqId, stage: "render" });
				const imported = await convert(source, { roots: allowedRoots, signal });
				signal.throwIfAborted();
				const after = await call(job, "status");
				signal.throwIfAborted();
				if (before.file !== after.file || before.fileKey !== after.fileKey || before.pageId !== after.pageId)
					throw new Error("Файл или страница Figma сменились во время импорта. Повторите импорт на нужной странице.");
				reply({ type: "html_import_progress", reqId, stage: "build" });
				signal.throwIfAborted();
				const built = await call(job, "create", { spec: imported.spec, expectedPageId: before.pageId, expectedFile: before.file, expectedFileKey: before.fileKey });
				const warnings = [...new Set([...imported.warnings, ...(built.warnings || [])])];
				if (built.rootId && !cancellable) {
					try { await call(job, "focus", { ids: [built.rootId] }); }
					catch { warnings.push("Макет создан, но не удалось показать его на холсте."); }
				}
				reply({ type: "html_import_result", reqId, ok: true, rootId: built.rootId, count: built.count, warnings: warnings.slice(0, 40) });
			} catch (err) {
				if (err?.cancelled || (signal.aborted && !job.buildId))
					return reply({ type: "html_import_result", reqId, ok: false, cancelled: true });
				const error = err?.code === "ENOENT" && typeof args?.path === "string" ? "HTML-файл не найден. Проверьте путь." : String(err?.message || err);
				reply({ type: "html_import_result", reqId, ok: false, error });
			} finally { active = null; }
		},
	};
}
