/// <reference types="@figma/plugin-typings" />
// Точка входа плагина (MCP-версия): окно со статусом моста и мост вызовов —
// внешний агент через MCP читает дизайн и (по его запросам) создаёт и правит его.
import { runMcpTool } from "./mcp-tools";
import { runManualCreate } from "./mcp-write";
import { restoreRuns } from "./undo";

// __html__ подставляет Figma — содержимое файла из поля "ui" манифеста.
declare const __html__: string;

const UI_WIDTH = 420;
figma.showUI(__html__, { width: UI_WIDTH, height: 540, title: "Vivi MCP", themeColors: true });

interface Msg {
	type?: string;
	reqId?: string;
	tool?: string;
	args?: unknown;
	collapsed?: boolean;
	importBuild?: boolean;
}

let queue: Promise<void> = Promise.resolve();
const importBuilds = new Map<string, { cancelled: boolean }>();

figma.ui.onmessage = async (msg: Msg) => {
	if (msg.type === "set_ui_collapsed" && typeof msg.collapsed === "boolean") {
		figma.ui.resize(msg.collapsed ? 240 : UI_WIDTH, msg.collapsed ? 40 : 540);
		return;
	}
	if (msg.type === "html_import_cancel_build" && typeof msg.reqId === "string") {
		const control = importBuilds.get(msg.reqId);
		if (control) control.cancelled = true;
		return;
	}
	if (msg.type === "mcp_call" && typeof msg.reqId === "string") { // BridgeCall из shared/protocol.d.ts
		const args = (msg.args && typeof msg.args === "object" ? msg.args : {}) as Record<string, unknown>;
		// Вызовы идут по очереди: они делят общее состояние сборки и сериализации.
		const reqId = msg.reqId;
		const control = msg.importBuild === true && msg.tool === "create" ? { cancelled: false } : undefined;
		if (control) importBuilds.set(reqId, control);
		const run = queue.then(async () => {
			if (control?.cancelled) {
				figma.ui.postMessage({ type: "mcp_result", reqId, ok: false, cancelled: true });
				return;
			}
			if (msg.tool === "create" && ((args.expectedPageId && args.expectedPageId !== figma.currentPage.id) || (args.expectedFile && args.expectedFile !== figma.root.name) || (args.expectedFileKey && args.expectedFileKey !== (figma as unknown as { fileKey?: string }).fileKey)))
				throw new Error("Страница или файл сменились — повторите импорт на нужной странице");
			const res = control ? await runManualCreate(args, control) : await runMcpTool(msg.tool, args);
			figma.ui.postMessage({ type: "mcp_result", reqId, ...res });
		});
		queue = run.catch(() => {});
		await run.catch((err) => figma.ui.postMessage({ type: "mcp_result", reqId, ok: false, error: String(err) }))
			.finally(() => importBuilds.delete(reqId));
	}
};

// Восстанавливаем список прогонов записи из копий на странице истории — откат
// переживает перезапуск плагина.
void restoreRuns().catch(() => {});
