/// <reference types="@figma/plugin-typings" />
// Точка входа плагина (MCP-версия): окно со статусом моста и мост вызовов —
// внешний агент через MCP читает дизайн и (по его запросам) создаёт и правит его.
import { runMcpTool } from "./mcp-tools";
import { restoreRuns } from "./undo";

// __html__ подставляет Figma — содержимое файла из поля "ui" манифеста.
declare const __html__: string;

figma.showUI(__html__, { width: 210, height: 44, title: "Vivi MCP", themeColors: true });

interface Msg {
	type?: string;
	reqId?: string;
	tool?: string;
	args?: unknown;
}

let queue: Promise<void> = Promise.resolve();

figma.ui.onmessage = async (msg: Msg) => {
	if (msg.type === "mcp_call" && typeof msg.reqId === "string") {
		const args = (msg.args && typeof msg.args === "object" ? msg.args : {}) as Record<string, unknown>;
		// Вызовы идут по очереди: они делят общее состояние сборки и сериализации.
		const reqId = msg.reqId;
		const run = queue.then(async () => {
			const res = await runMcpTool(msg.tool, args);
			figma.ui.postMessage({ type: "mcp_result", reqId, ...res });
		});
		queue = run.catch(() => {});
		await run.catch((err) => figma.ui.postMessage({ type: "mcp_result", reqId, ok: false, error: String(err) }));
	}
};

// Восстанавливаем список прогонов записи из копий на странице истории — откат
// переживает перезапуск плагина.
void restoreRuns().catch(() => {});
