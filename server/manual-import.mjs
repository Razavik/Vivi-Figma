// Ручной импорт из UI: ответы и запись привязаны к тому же соединению плагина,
// а не к последнему активному файлу в общем relay.
import { z } from "zod";
import { htmlToDesign } from "./html-to-design.mjs";
import { MCP_TOOLS } from "./mcp-tools.mjs";

const fields = MCP_TOOLS.html_to_design.input;
const input = z.object(Object.fromEntries(["url", "width", "isMobile", "autoLayout", "waitFor", "waitMs", "selector", "scroll"].map((key) => [key, fields[key]]))).required({ url: true });

export function createManualImporter({ send, isOpen, convert = htmlToDesign, readonly = process.env.MCP_READONLY === "1" }) {
	const pending = new Map();
	let seq = 0;
	let busy = false;
	const reply = (body) => { try { if (isOpen()) send(body); } catch { /* соединение закрылось */ } };
	function call(tool, args = {}) {
		if (!isOpen()) return Promise.reject(new Error("Плагин отключён"));
		const reqId = `manual-${++seq}`;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				pending.delete(reqId);
				reject(new Error("Figma не ответила вовремя"));
			}, tool === "create" ? 120_000 : 30_000);
			pending.set(reqId, { resolve, reject, timer });
			try { send({ type: "mcp_call", reqId, tool, args }); }
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
			else item.reject(new Error(msg.error || "Ошибка Figma"));
			return true;
		},
		dispose() {
			for (const item of pending.values()) {
				clearTimeout(item.timer);
				item.reject(new Error("Плагин отключён"));
			}
			pending.clear();
		},
		async start(reqId, args) {
			if (busy) return reply({ type: "html_import_result", reqId, ok: false, error: "Дождитесь завершения текущего импорта" });
			busy = true;
			try {
				if (readonly) throw new Error("Импорт отключён: мост запущен в режиме только чтения");
				const parsed = input.safeParse(args);
				if (!parsed.success) throw new Error("Проверьте URL и ширину экрана: 320–4096 px");
				if (!["http:", "https:"].includes(new URL(parsed.data.url).protocol)) throw new Error("Укажите адрес http:// или https://");
				const before = await call("status");
				reply({ type: "html_import_progress", reqId, stage: "render" });
				const imported = await convert(parsed.data);
				const after = await call("status");
				if (before.file !== after.file || before.fileKey !== after.fileKey || before.pageId !== after.pageId)
					throw new Error("Файл или страница Figma сменились во время импорта. Повторите импорт на нужной странице.");
				reply({ type: "html_import_progress", reqId, stage: "build" });
				const built = await call("create", { spec: imported.spec, expectedPageId: before.pageId, expectedFile: before.file, expectedFileKey: before.fileKey });
				const warnings = [...imported.warnings, ...(built.warnings || [])];
				if (built.rootId) {
					try { await call("focus", { ids: [built.rootId] }); }
					catch { warnings.push("Макет создан, но не удалось показать его на холсте."); }
				}
				reply({ type: "html_import_result", reqId, ok: true, rootId: built.rootId, count: built.count, warnings: warnings.slice(0, 40) });
			} catch (err) {
				reply({ type: "html_import_result", reqId, ok: false, error: String(err?.message || err) });
			} finally { busy = false; }
		},
	};
}
