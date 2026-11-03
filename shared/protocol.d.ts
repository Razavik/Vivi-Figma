// Протокол мост ↔ клиенты (плагин, MCP-сервер). Все сообщения — JSON по WebSocket.
// Плагин (ui.ts → code.ts) и сервер (index.mjs, mcp.mjs) импортируют типы отсюда.

// Мост → плагин UI: мост поднялся и принимает вызовы.
export interface BridgeReady {
	type: "ready";
}

// MCP-сервер → мост → плагин UI → main-код: вызов инструмента.
export interface BridgeCall {
	type: "mcp_call";
	reqId: string;
	tool: string;
	args?: Record<string, unknown>;
}

// Ответ в обратную сторону (main → UI → мост → MCP-сервер).
export interface BridgeResult {
	type: "mcp_result";
	reqId: string;
	ok: boolean;
	data?: unknown;
	error?: string;
	images?: { data: string; mimeType: string }[];
}

export type BridgeMessage = BridgeReady | BridgeCall | BridgeResult;
