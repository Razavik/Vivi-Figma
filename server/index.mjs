// Мост Vivi MCP: WebSocket-сервер (ws://localhost:8787) между плагином Figma и
// MCP-серверами (mcp.mjs). Плагин держит соединение, MCP-клиент подключается
// как role=mcp; вызов пересылается в самое свежее открытое соединение плагина,
// ответ возвращается обратно. Моделей и записи в Figma здесь нет — только чтение.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { MAX_PAYLOAD } from "./limits.mjs";
import { createRelay } from "./mcp-relay.mjs";

// server/.env (KEY=VALUE): PORT и др. Уже заданные env не трогаем.
const serverDir = dirname(fileURLToPath(import.meta.url));
try {
	for (const line of readFileSync(join(serverDir, ".env"), "utf-8").split(/\r?\n/)) {
		const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
		if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
	}
} catch {
	/* .env необязателен */
}

const PORT = Number(process.env.PORT || 8787);

const relay = createRelay();
const httpServer = createServer((_req, res) => {
	res.writeHead(426, { "content-type": "text/plain; charset=utf-8" });
	res.end("Vivi MCP bridge: используйте WebSocket\n");
});
const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_PAYLOAD });

// MCP-клиент: пересылаем его вызовы в плагин.
function serveMcpClient(socket) {
	socket.on("message", (raw) => {
		let msg;
		try {
			msg = JSON.parse(raw.toString());
		} catch {
			return;
		}
		if (msg?.type !== "mcp_call" || typeof msg.reqId !== "string") return;
		const reply = (body) => {
			if (socket.readyState === socket.OPEN)
				socket.send(JSON.stringify({ type: "mcp_result", reqId: msg.reqId, ...body }));
		};
		relay
			.call(msg.tool, msg.args)
			.then((res) => reply({ ok: true, data: res.data, images: res.images }))
			.catch((err) => reply({ ok: false, error: String(err?.message || err) }));
	});
}

// Плагин: регистрируем в relay, ответы mcp_result идут в ожидающие вызовы.
function servePlugin(socket) {
	const plugin = {
		send: (message) => socket.send(JSON.stringify(message)),
		isOpen: () => socket.readyState === socket.OPEN,
	};
	relay.add(plugin);
	socket.on("message", (raw) => {
		let msg;
		try {
			msg = JSON.parse(raw.toString());
		} catch {
			return;
		}
		relay.touch(plugin);
		if (msg?.type === "mcp_result") relay.result(msg);
	});
	socket.on("close", () => relay.remove(plugin));
	socket.on("error", () => relay.remove(plugin));
	socket.send(JSON.stringify({ type: "ready" }));
}

wss.on("connection", (socket, request) => {
	const role = new URL(request.url || "/", "ws://localhost").searchParams.get("role");
	if (role === "mcp") serveMcpClient(socket);
	else servePlugin(socket);
});

// Порт занят — скорее всего мост уже работает (его запускает MCP-сервер сам).
httpServer.on("error", (err) => {
	if (err.code === "EADDRINUSE") {
		console.log(`vivi-mcp bridge: порт ${PORT} занят — мост, видимо, уже запущен (ws://localhost:${PORT}), второй не нужен.`);
		process.exit(0);
	}
	throw err;
});
wss.on("error", () => {});

httpServer.listen(PORT, "127.0.0.1", () => {
	console.log(`vivi-mcp bridge: ws://localhost:${PORT}`);
});
