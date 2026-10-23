/// <reference types="@figma/plugin-typings" />
// Точка входа плагина (MCP-версия): окно со статусом моста и мост вызовов —
// внешний агент через MCP читает дизайн, плагин только отвечает (чтение).
import { runMcpTool } from "./mcp-tools";

// __html__ подставляет Figma — содержимое файла из поля "ui" манифеста.
declare const __html__: string;

figma.showUI(__html__, { width: 210, height: 44, title: "Vivi MCP", themeColors: true });

interface Msg {
	type?: string;
	reqId?: string;
	tool?: string;
	args?: unknown;
}

figma.ui.onmessage = async (msg: Msg) => {
	if (msg.type === "mcp_call" && typeof msg.reqId === "string") {
		const args = (msg.args && typeof msg.args === "object" ? msg.args : {}) as Record<string, unknown>;
		const res = await runMcpTool(msg.tool, args);
		figma.ui.postMessage({ type: "mcp_result", reqId: msg.reqId, ...res });
	}
};
