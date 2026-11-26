import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ensureBridge, inspectBridge } from "../bridge-start.mjs";
import { BRIDGE_PROTOCOL, bridgeTokenPath } from "../bridge-auth.mjs";
import WebSocket from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const cli = fileURLToPath(new URL("../cli.mjs", import.meta.url));
async function freePort() {
	const server = createServer();
	await new Promise((r) => server.listen(0, "127.0.0.1", r));
	const port = server.address().port;
	await new Promise((r) => server.close(r));
	return port;
}

test("фоновой мост: CLI завершается, процесс остаётся, повторный запуск без дубля", async () => {
	const port = await freePort();
	const env = { ...process.env, PORT: String(port), IDLE_EXIT_MIN: "0" };
	let pid;
	try {
		const first = spawnSync(process.execPath, [cli, "bridge"], { env, encoding: "utf8", timeout: 25_000, windowsHide: true });
		assert.equal(first.status, 0, first.stderr);
		assert.match(first.stdout, /запущен в фоне/);
		const ready = await inspectBridge(port);
		assert.equal(ready.state, "ready");
		pid = ready.pid;
		assert.ok(Number.isInteger(pid));
		const again = spawnSync(process.execPath, [cli, "bridge"], { env, encoding: "utf8", timeout: 5000, windowsHide: true });
		assert.equal(again.status, 0, again.stderr);
		assert.match(again.stdout, /уже работает/);
		assert.equal((await inspectBridge(port)).pid, pid);
		const pair = spawnSync(process.execPath, [cli, "bridge", "--pair-code"], { env, encoding: "utf8", timeout: 5000, windowsHide: true });
		assert.equal(pair.status, 0, pair.stderr);
		const code = pair.stdout.trim();
		assert.match(code, /^[a-f0-9]{64}$/);
		const url = `ws://127.0.0.1:${port}/`;
		const rejected = (role, protocols, headers) => new Promise((resolve, reject) => {
			const socket = new WebSocket(`${url}?role=${role}`, protocols, { headers, handshakeTimeout: 2000 });
			socket.once("open", () => { socket.terminate(); reject(new Error("Unexpected upgrade")); });
			socket.once("error", (err) => resolve(err.message));
		});
		assert.match(await rejected("plugin", [], { Origin: "null" }), /403/);
		assert.match(await rejected("mcp", ["0".repeat(64), BRIDGE_PROTOCOL]), /403/);
		assert.match(await rejected("mcp", [code, BRIDGE_PROTOCOL], { Origin: "null" }), /403/);
		assert.match(await rejected("mcp", [code, BRIDGE_PROTOCOL], { Origin: "https://example.test" }), /403/);
		assert.match(await rejected("plugin", [code, BRIDGE_PROTOCOL], { Host: "example.test" }), /403/);
		const plugin = new WebSocket(url, [code, BRIDGE_PROTOCOL], { origin: "null", handshakeTimeout: 2000 });
		try {
			const ready = await new Promise((resolve, reject) => {
				plugin.once("message", (msg) => resolve(JSON.parse(msg.toString())));
				plugin.once("error", reject);
			});
			assert.equal(plugin.protocol, BRIDGE_PROTOCOL);
			assert.equal(ready.type, "ready");
		} finally { plugin.terminate(); }
	} finally {
		// pid получен от моста на выделенном этим тестом порту.
		if (pid) process.kill(pid);
		await rm(bridgeTokenPath(port), { force: true });
	}
});

test("фоновой мост: чужой сервер не считается успешным запуском", async () => {
	const server = createServer((_req, res) => res.end("Другой сервис"));
	await new Promise((r) => server.listen(0, "127.0.0.1", r));
	try {
		const port = server.address().port;
		await assert.rejects(ensureBridge({ env: { PORT: String(port) } }), /другой программой/);
	} finally { await new Promise((r) => server.close(r)); }
});

test("MCP запускает тот же фоновый мост и сообщает об отсутствии плагина", async () => {
	const port = await freePort();
	const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../mcp.mjs", import.meta.url))], env: { ...process.env, PORT: String(port), IDLE_EXIT_MIN: "0", MCP_NO_AUTOSTART: "0" }, stderr: "pipe" });
	const client = new Client({ name: "bridge-test", version: "1" });
	let pid;
	try {
		await client.connect(transport);
		const result = await client.callTool({ name: "figma_status", arguments: {} });
		const health = await inspectBridge(port);
		pid = health.pid;
		assert.equal(health.state, "ready");
		assert.equal(result.isError, true);
		assert.match(result.content[0].text, /плагин Vivi не подключён/);
	} finally {
		await client.close();
		if (pid) process.kill(pid);
		await rm(bridgeTokenPath(port), { force: true });
	}
});

test("фоновой мост: старый Vivi распознаётся, неверный порт и сбой старта понятны", async () => {
	const server = createServer((_req, res) => { res.writeHead(426); res.end("Vivi MCP bridge: используйте WebSocket\n"); });
	await new Promise((r) => server.listen(0, "127.0.0.1", r));
	try {
		await assert.rejects(ensureBridge({ env: { PORT: String(server.address().port) } }), /старый мост Vivi/);
	} finally { await new Promise((r) => server.close(r)); }
	await assert.rejects(ensureBridge({ env: { PORT: "oops" } }), /PORT/);
	const dir = await mkdtemp(join(tmpdir(), "vivi-bridge-"));
	try {
		await assert.rejects(ensureBridge({ env: { PORT: String(await freePort()) }, serverDir: dir, logDir: dir, startupTimeout: 2000 }), /Не удалось запустить мост.*Лог:/);
	} finally {
		assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + "/") || resolve(dir).startsWith(resolve(tmpdir()) + "\\"));
		await rm(dir, { recursive: true, force: true });
	}
});
