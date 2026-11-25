// Протокол мост ↔ клиенты (плагин, MCP-сервер). Все сообщения — JSON по WebSocket.
// Плагин (ui.ts → code.ts) и сервер (index.mjs, mcp.mjs) импортируют типы отсюда.

// Мост → плагин UI: мост поднялся и принимает вызовы.
export interface BridgeReady {
	type: "ready";
	htmlImport?: boolean;
	htmlFileImport?: boolean;
	htmlImportCancel?: boolean;
	htmlImportExternalResources?: boolean;
}

// MCP-сервер → мост → плагин UI → main-код: вызов инструмента.
export interface BridgeCall {
	type: "mcp_call";
	reqId: string;
	tool: string;
	args?: Record<string, unknown>;
	importBuild?: boolean;
}

// Ответ в обратную сторону (main → UI → мост → MCP-сервер).
export interface BridgeResult {
	type: "mcp_result";
	reqId: string;
	ok: boolean;
	cancelled?: boolean;
	data?: unknown;
	error?: string;
	images?: { data: string; mimeType: string }[];
}

export interface HtmlImport {
	type: "html_import";
	reqId: string;
	cancellable?: boolean;
	args: HtmlImportSource & { width: number; isMobile: boolean; autoLayout?: boolean; waitFor?: string; waitMs?: number; selector?: string; scroll?: boolean; allowNetwork?: boolean };
}

export interface HtmlImportCancel {
	type: "html_import_cancel" | "html_import_cancel_build";
	reqId: string;
}

export type HtmlImportSource =
	| { url: string }
	| { path: string }
	| { upload: { entry: string; files: { path: string; data: string }[] } };

export interface HtmlImportProgress {
	type: "html_import_progress";
	reqId: string;
	stage: "render" | "build";
}

export interface HtmlImportResult {
	type: "html_import_result";
	reqId: string;
	ok: boolean;
	cancelled?: boolean;
	rootId?: string;
	count?: number;
	warnings?: string[];
	error?: string;
}

export type BridgeMessage = BridgeReady | BridgeCall | BridgeResult | HtmlImport | HtmlImportCancel | HtmlImportProgress | HtmlImportResult;
