/// <reference types="@figma/plugin-typings" />
// Точка входа плагина (MCP-версия): окно с состоянием связи и мост вызовов —
// внешний агент через MCP читает дизайн, плагин только отвечает (чтение).
import { runMcpTool } from "./mcp-tools";

// __html__ подставляет Figma — содержимое файла из поля "ui" манифеста.
declare const __html__: string;

const SETTINGS_KEY = "vivi-mcp-settings";

figma.showUI(__html__, { width: 280, height: 150, title: "Vivi MCP", themeColors: true });

interface Msg {
	type?: string;
	reqId?: string;
	tool?: string;
	args?: unknown;
	data?: unknown;
}

figma.ui.onmessage = async (msg: Msg) => {
	if (msg.type === "mcp_call" && typeof msg.reqId === "string") {
		const args = (msg.args && typeof msg.args === "object" ? msg.args : {}) as Record<string, unknown>;
		const res = await runMcpTool(msg.tool, args);
		figma.ui.postMessage({ type: "mcp_result", reqId: msg.reqId, ...res });
		return;
	}
	if (msg.type === "save_settings") {
		try {
			await figma.clientStorage.setAsync(SETTINGS_KEY, msg.data);
		} catch {
			/* настройки необязательны */
		}
		return;
	}
	if (msg.type === "close") figma.closePlugin();
};

void figma.clientStorage.getAsync(SETTINGS_KEY).then((data) => {
	figma.ui.postMessage({ type: "settings_restore", data: data ?? null });
});
