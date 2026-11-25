import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { createManualImporter } from "../manual-import.mjs";

function session({ convert, readonly, roots, confirmFolder, onCreate, changePage = false } = {}) {
	const messages = [];
	let statusCount = 0;
	let open = true;
	const importer = createManualImporter({
		isOpen: () => open,
		readonly,
		roots,
		confirmFolder,
		convert: convert || (async (args) => ({ spec: { type: "frame", w: args.width, children: [{ type: "text", text: "Привет 🚀" }] }, warnings: ["Пример замечания"] })),
		send(msg) {
			messages.push(msg);
			if (msg.type !== "mcp_call") return;
			if (msg.tool === "create" && onCreate) return onCreate(msg);
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

test("ручной импорт: readonly, неверные URL/размеры и конфликт источников", async () => {
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
	await filtered.importer.start("conflict", { url: "https://example.com", path: "page.html" });
	assert.equal(received, undefined);
	assert.match(filtered.messages.at(-1).error, /один источник/);
	await filtered.importer.start("extra", { url: "https://example.com", html: "ignored" });
	assert.deepEqual(received, { url: "https://example.com" });
});

test("manual import: local path and file URL use only configured roots", async () => {
	const roots = [join(tmpdir(), "vivi-project")];
	const path = join(roots[0], "example page.html");
	const sources = [];
	const { importer, messages } = session({ roots, convert: async (source, { roots: allowedRoots, signal }) => {
		assert.ok(signal instanceof AbortSignal);
		sources.push({ source, roots: allowedRoots });
		return { spec: {}, warnings: [] };
	} });
	await importer.start("path", { path });
	await importer.start("file-url", { url: pathToFileURL(path).href });
	assert.deepEqual(sources, Array(2).fill({ source: { path }, roots }));
	assert.equal(messages.at(-1).ok, true);
});

test("manual import: Windows consent grants only the selected folder for this connection", async () => {
	const dir = await mkdtemp(join(tmpdir(), "vivi-consent-"));
	try {
		const realDir = await realpath(dir);
		const path = join(dir, "index.html");
		const otherPage = join(dir, "other.htm");
		const calls = [];
		const imported = [];
		const convert = async (source, { roots }) => {
			assert.deepEqual(roots, [realDir]);
			imported.push(source.path);
			return { spec: {}, warnings: [] };
		};
		const confirmFolder = async (folder, signal) => {
			assert.equal(folder, realDir);
			assert.equal(signal.aborted, false);
			calls.push(folder);
			return true;
		};
		const first = session({ roots: [], convert, confirmFolder });
		await first.importer.start("first", { path });
		await first.importer.start("second", { url: pathToFileURL(otherPage).href });
		assert.equal(first.messages.at(-1).ok, true);
		assert.deepEqual(calls, [realDir]);
		assert.deepEqual(imported, [join(realDir, "index.html"), join(realDir, "other.htm")]);
		const another = session({ roots: [], convert, confirmFolder });
		await another.importer.start("new-connection", { path });
		assert.equal(another.messages.at(-1).ok, true);
		assert.deepEqual(calls, [realDir, realDir]);
		const denied = session({ roots: [], confirmFolder: async () => false });
		await denied.importer.start("denied", { path });
		assert.match(denied.messages.at(-1).error, /Доступ к папке не разрешён/);
		assert.ok(!denied.messages.some((msg) => msg.type === "mcp_call"));
		await denied.importer.start("relative", { path: "index.html" });
		assert.match(denied.messages.at(-1).error, /абсолютный путь/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("manual import: external resources are passed only when explicitly requested", async () => {
	const requests = [];
	const { importer } = session({ roots: [tmpdir()], convert: async (source) => {
		requests.push(source);
		return { spec: {}, warnings: [] };
	} });
	await importer.start("offline", { path: "index.html" });
	await importer.start("online", { path: "index.html", allowNetwork: true });
	assert.deepEqual(requests, [{ path: "index.html" }, { path: "index.html", allowNetwork: true }]);
});

test("manual import: upload accepts binary assets and rejects invalid paths and payloads", async () => {
	const paths = ["pages/index.html", "static/main.css", "static/image.png"];
	const bodies = [Buffer.from("<main>Page</main>"), Buffer.from("main{color:red}"), Buffer.from([0x89, 0x50, 0x4e, 0x47])];
	const files = paths.map((path, i) => ({ path, data: bodies[i].toString("base64") }));
	let received;
	const { importer, messages } = session({ convert: async (source) => {
		received = source;
		return { spec: {}, warnings: [] };
	} });
	const upload = { entry: paths[0], files };
	await importer.start("upload", { upload });
	assert.deepEqual(received.upload.files, new Map(paths.map((path, i) => [path, bodies[i]])));
	assert.equal(messages.at(-1).ok, true);
	for (const bad of [{ path: "../x.css", data: "" }, { path: "a\\x.css", data: "" }, { path: paths[1], data: "" }, { path: "x.css", data: "invalid?" }]) {
		await importer.start("bad", { upload: { ...upload, files: [...files, bad] } });
		assert.equal(messages.at(-1).ok, false);
	}
	await importer.start("missing", { upload: { ...upload, entry: "unknown.html" } });
	assert.equal(messages.at(-1).ok, false);
	assert.equal(messages.filter((msg) => msg.tool === "create").length, 1);
});

test("manual import: upload exceeds former asset count and byte limits", async () => {
	const files = [{ path: "index.html", data: Buffer.from("<main>Page</main>").toString("base64") }];
	for (let i = 0; i < 512; i++) files.push({ path: `photos/${i}.jpg`, data: "" });
	files[1].data = Buffer.alloc(17 * 1024 * 1024, 0xff).toString("base64");
	const { importer, messages } = session({ convert: async ({ upload }) => {
		assert.equal(upload.files.size, 513);
		assert.equal(upload.files.get("photos/0.jpg").length, 17 * 1024 * 1024);
		return { spec: {}, warnings: [] };
	} });
	await importer.start("large", { upload: { entry: files[0].path, files } });
	assert.equal(messages.at(-1).ok, true, messages.at(-1).error);
});

test("manual import: stop aborts rendering and leaves the connection ready for another import", async () => {
	let rendered;
	const rendering = new Promise((resolve) => { rendered = resolve; });
	const { importer, messages } = session({ convert: async ({ url }, { signal }) => {
		if (url.endsWith("/first")) {
			rendered();
			await new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
		}
		return { spec: {}, warnings: [] };
	} });
	const first = importer.start("first", { url: "https://example.com/first" }, true);
	await rendering;
	importer.cancel("different");
	assert.notEqual(messages.at(-1).type, "html_import_result");
	importer.cancel("first");
	await first;
	assert.deepEqual(messages.at(-1), { type: "html_import_result", reqId: "first", ok: false, cancelled: true });
	assert.ok(!messages.some((msg) => msg.tool === "create"));
	await importer.start("second", { url: "https://example.com" }, true);
	assert.equal(messages.at(-1).ok, true);
});

test("manual import: stop during build waits for rollback, and a completed build still reports success", async () => {
	for (const committed of [false, true]) {
		let building;
		const build = new Promise((resolve) => { building = resolve; });
		const { importer, messages } = session({ onCreate: building });
		const work = importer.start("test", { url: "https://example.com" }, true);
		const create = await build;
		assert.equal(create.importBuild, true);
		importer.cancel("test");
		assert.deepEqual(messages.at(-1), { type: "html_import_cancel_build", reqId: create.reqId });
		importer.result({ reqId: create.reqId, ok: committed, cancelled: !committed, data: { rootId: "1:2" } });
		await work;
		assert.equal(messages.at(-1).ok, committed);
		assert.equal(Boolean(messages.at(-1).cancelled), !committed);
	}
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
