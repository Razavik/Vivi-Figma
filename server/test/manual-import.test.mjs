import test from "node:test";
import assert from "node:assert/strict";
import { createManualImporter } from "../manual-import.mjs";

function session({ convert, readonly, changePage = false } = {}) {
	const messages = [];
	let statusCount = 0;
	let open = true;
	const importer = createManualImporter({
		isOpen: () => open,
		readonly,
		convert: convert || (async (args) => ({ spec: { type: "frame", w: args.width, children: [{ type: "text", text: "Привет 🚀" }] }, warnings: ["Пример замечания"] })),
		send(msg) {
			messages.push(msg);
			if (msg.type !== "mcp_call") return;
			let data;
			if (msg.tool === "status") data = { file: "Design", fileKey: "abc", pageId: changePage && ++statusCount > 1 ? "2:1" : "1:1" };
			else if (msg.tool === "create") data = { rootId: "1:2", count: 2, warnings: [] };
			else data = {};
			queueMicrotask(() => importer.result({ reqId: msg.reqId, ok: true, data }));
		},
	});
	return { importer, messages, close() { open = false; importer.dispose(); } };
}

test("ручной импорт: URL → своё соединение → create → focus", async () => {
	const { importer, messages } = session();
	await importer.start("ui-1", { url: "http://localhost:5173", width: 390, height: 844, isMobile: true });
	assert.deepEqual(messages.filter((m) => m.type === "mcp_call").map((m) => m.tool), ["status", "status", "create", "focus"]);
	const create = messages.find((m) => m.tool === "create");
	assert.equal(create.args.expectedPageId, "1:1");
	assert.equal(create.args.expectedFileKey, "abc");
	assert.equal(create.args.spec.w, 390);
	assert.equal(create.args.spec.children[0].text, "Привет 🚀");
	assert.equal(messages.at(-1).ok, true);
	assert.deepEqual(messages.at(-1).warnings, ["Пример замечания"]);
});

test("ручной импорт: при смене страницы запись отменяется", async () => {
	const { importer, messages } = session({ changePage: true });
	await importer.start("ui-1", { url: "https://example.com" });
	assert.ok(!messages.some((m) => m.tool === "create"));
	assert.match(messages.at(-1).error, /сменились/);
});

test("ручной импорт: readonly, неверные URL/размеры и лишние аргументы", async () => {
	const readonly = session({ readonly: true });
	await readonly.importer.start("r", { url: "https://example.com" });
	assert.match(readonly.messages.at(-1).error, /только чтения/);
	assert.ok(!readonly.messages.some((m) => m.type === "mcp_call"));
	const { importer, messages } = session();
	await importer.start("bad", { url: "file:///secret" });
	assert.equal(messages.at(-1).ok, false);
	await importer.start("bad-size", { url: "https://example.com", width: 0 });
	assert.equal(messages.at(-1).ok, false);
	assert.ok(!messages.some((m) => m.type === "mcp_call"));
	let received;
	const filtered = session({ convert: async (args) => { received = args; throw new Error("Остановлено"); } });
	await filtered.importer.start("extra", { url: "https://example.com", path: "secret.html", html: "ignored" });
	assert.deepEqual(received, { url: "https://example.com" });
});

test("ручной импорт: повторное нажатие и разрыв соединения", async () => {
	let finish;
	const gate = new Promise((r) => { finish = r; });
	const current = session({ convert: async () => { await gate; return { spec: { type: "frame", w: 390 }, warnings: [] }; } });
	const first = current.importer.start("first", { url: "https://example.com" });
	await current.importer.start("second", { url: "https://example.com" });
	assert.equal(current.messages.at(-1).reqId, "second");
	assert.match(current.messages.at(-1).error, /Дождитесь/);
	current.close();
	finish();
	await first;
	assert.ok(!current.messages.some((m) => m.tool === "create"));
});
