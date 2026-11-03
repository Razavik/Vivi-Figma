import { test } from "node:test";
import assert from "node:assert/strict";
import { createRelay } from "../mcp-relay.mjs";
import { MCP_TOOL_NAMES, isMcpTool } from "../mcp-tools.mjs";

function fakePlugin(open = true) {
	const sent = [];
	return { sent, send: (m) => sent.push(m), isOpen: () => open };
}

test("белый список: только инструменты чтения", () => {
	assert.deepEqual(MCP_TOOL_NAMES.sort(), ["assets", "componentize", "create", "design_system", "edit", "export", "export_assets", "focus", "fonts", "guide", "icons", "node", "outline", "review", "schema", "screenshot", "search", "selection", "status", "styles", "tokens", "undo", "variants"]);
	assert.equal(isMcpTool("apply_edits"), false);
	assert.equal(isMcpTool("toString"), false);
});

test("relay: вызов уходит в свежий плагин, ответ по reqId резолвит промис", async () => {
	const relay = createRelay({ timeoutMs: 500 });
	const old = fakePlugin();
	const fresh = fakePlugin();
	old.lastSeen = 1;
	fresh.lastSeen = 2;
	relay.add(old);
	relay.add(fresh);
	const p = relay.call("node", { id: "1:2" });
	assert.equal(old.sent.length, 0);
	assert.equal(fresh.sent[0].type, "mcp_call");
	assert.deepEqual(fresh.sent[0].args, { id: "1:2" });
	assert.equal(relay.result({ reqId: fresh.sent[0].reqId, ok: true, data: { x: 1 }, images: [{ data: "AA", mimeType: "image/png" }] }), true);
	const res = await p;
	assert.deepEqual(res.data, { x: 1 });
	assert.equal(res.images.length, 1);
	assert.equal(relay.pendingCount(), 0);
});

test("relay: нет плагина, чужой инструмент, ошибка плагина и таймаут — отказ", async () => {
	const relay = createRelay({ timeoutMs: 30 });
	await assert.rejects(relay.call("status"), /не подключён/);
	const closed = fakePlugin(false);
	relay.add(closed);
	assert.equal(relay.available(), false);
	await assert.rejects(relay.call("status"), /не подключён/);
	const plugin = fakePlugin();
	relay.add(plugin);
	await assert.rejects(relay.call("apply_edits"), /неизвестный/);
	const p = relay.call("status");
	relay.result({ reqId: plugin.sent[0].reqId, ok: false, error: "нода не найдена" });
	await assert.rejects(p, /нода не найдена/);
	await assert.rejects(relay.call("outline"), /не ответил/);
	assert.equal(relay.result({ reqId: "nope", ok: true }), false);
	relay.remove(plugin);
	relay.remove(closed);
	assert.equal(relay.available(), false);
});
