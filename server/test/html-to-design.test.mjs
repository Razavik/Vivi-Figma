import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkHtmlInput, htmlToDesign, localImportFile } from "../html-to-design.mjs";
import { MCP_TOOLS, isPluginTool } from "../mcp-tools.mjs";
import { WebSocketServer } from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const flatten = (n) => [n, ...(n.children || []).flatMap(flatten)];

test("HTML: источник, протокол, границы проекта и серверный macro", async () => {
	assert.throws(() => checkHtmlInput({}), /ровно один/);
	assert.throws(() => checkHtmlInput({ html: "x", url: "https://example.com" }), /ровно один/);
	assert.throws(() => checkHtmlInput({ url: "file:///secret" }), /http/);
	assert.equal(isPluginTool("html_to_design"), false);
	assert.equal(MCP_TOOLS.html_to_design.write, true);
	const dir = await mkdtemp(join(tmpdir(), "vivi-html-"));
	try {
		await mkdir(join(dir, "project"));
		await writeFile(join(dir, "secret.html"), "секрет", "utf8");
		await assert.rejects(localImportFile("../secret.html", [join(dir, "project")]), /вне проекта/);
		await assert.rejects(htmlToDesign({ html: "x", width: 0 }), /width/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("HTML: CSS media queries, текст, SVG и скрытые слои", async () => {
	const html = `<style>body{margin:0} main{display:flex;gap:24px;padding:20px;background:#123456} h1{margin:0;font:700 24px/30px Arial;color:white} .gone{display:none} @media(max-width:600px){main{flex-direction:column;gap:10px}}</style><main><h1>Привет, мир</h1><svg width="20" height="20" viewBox="0 0 20 20"><path d="M0 0H20V20Z" fill="red"/></svg><p class="gone">Скрыт</p></main>`;
	const desktop = await htmlToDesign({ html, width: 1200, selector: "main" });
	const mobile = await htmlToDesign({ html, width: 390, selector: "main" });
	const d = flatten(desktop.spec), m = flatten(mobile.spec);
	assert.equal(desktop.spec.w, 1200);
	assert.equal(mobile.spec.w, 390);
	assert.equal(mobile.spec.fill, "#123456ff");
	assert.equal(m.find((n) => n.type === "text").text, "Привет, мир");
	assert.equal(m.find((n) => n.type === "text").fontWeight, "bold");
	assert.ok(!m.some((n) => n.text === "Скрыт"));
	assert.ok(m.find((n) => n.type === "icon").y > d.find((n) => n.type === "icon").y);
	await assert.rejects(htmlToDesign({ html, maxNodes: 2 }), /больше 2 слоёв/);
});

test("HTML: динамический URL, API, ожидание рендера и мобильный JS", async () => {
	const server = createServer((req, res) => {
		if (req.url === "/data") {
			res.setHeader("content-type", "application/json");
			return res.end(JSON.stringify({ text: "Данные загружены" }));
		}
		res.setHeader("content-type", "text/html; charset=utf-8");
		res.end(`<meta name="viewport" content="width=device-width, initial-scale=1"><script>fetch('/data').then(r=>r.json()).then(data=>setTimeout(()=>{const el=document.createElement('main');el.id='ready';el.textContent=data.text+' '+innerWidth+' '+matchMedia('(pointer:coarse)').matches;document.body.append(el)},30))</script>`);
	});
	await new Promise((r) => server.listen(0, "127.0.0.1", r));
	try {
		const result = await htmlToDesign({ url: `http://127.0.0.1:${server.address().port}`, width: 390, height: 844, isMobile: true, waitFor: "#ready", selector: "main" });
		assert.ok(flatten(result.spec).some((n) => n.text === "Данные загружены 390 true"));
		assert.equal(result.source.isMobile, true);
	} finally {
		await new Promise((r) => server.close(r));
	}
});

test("HTML: локальные CSS/JS, отключение скриптов и захват canvas", async () => {
	const dir = await mkdtemp(join(tmpdir(), "vivi-html-"));
	try {
		await writeFile(join(dir, "page.html"), `<link rel="stylesheet" href="./style.css"><main>Кириллица<canvas width="12" height="12"></canvas></main><script src="./app.js"></script>`, "utf8");
		await writeFile(join(dir, "style.css"), "main{background:rgb(10,20,30)}", "utf8");
		await writeFile(join(dir, "app.js"), "document.querySelector('main').id='ready';const c=document.querySelector('canvas').getContext('2d');c.fillStyle='red';c.fillRect(0,0,12,12)", "utf8");
		const result = await htmlToDesign({ path: "page.html", selector: "main", waitFor: "#ready" }, { roots: [dir] });
		assert.equal(result.spec.fill, "#0a141eff");
		const image = flatten(result.spec).find((n) => n.type === "image");
		assert.equal(Buffer.from(image.data, "base64").subarray(1, 4).toString(), "PNG");
		assert.ok(result.warnings.some((n) => n.includes("Canvas")));
		const disabled = await htmlToDesign({ html: "<main>До</main><script>document.querySelector('main').textContent='После'</script>", javascript: false });
		assert.ok(flatten(disabled.spec).some((n) => n.text === "До"));
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("HTML: фон отдельным PNG, тень, lazy-load и обход CSP", async () => {
	const result = await htmlToDesign({ html: `<meta http-equiv="Content-Security-Policy" content="style-src 'none'"><main id="capture">Фон</main><div style="height:1500px"></div><script>addEventListener('scroll',()=>document.querySelector('main').dataset.ready='yes')</script>`, css: "main{background:linear-gradient(45deg,red,blue);box-shadow:0 4px 8px rgba(0,0,0,.2)}", height: 300, selector: "main", scroll: true, waitFor: "[data-ready]" });
	assert.equal(result.spec.children[0].type, "image");
	assert.ok(result.spec.children[0].data);
	assert.equal(result.spec.shadow.blur, 8);
	assert.ok(flatten(result.spec).some((n) => n.text === "Фон"));
});

test("HTML: MCP dry без плагина, запись через create и readonly", async () => {
	const bridge = new WebSocketServer({ port: 0, host: "127.0.0.1" });
	await new Promise((r) => bridge.once("listening", r));
	const calls = [];
	bridge.on("connection", (ws) => ws.on("message", (raw) => {
		const call = JSON.parse(raw);
		calls.push(call);
		ws.send(JSON.stringify({ type: "mcp_result", reqId: call.reqId, ok: true, data: call.tool === "status" ? { file: "Import test" } : { rootId: "1:1" } }));
	}));
	const makeClient = async (readonly = false) => {
		const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../mcp.mjs", import.meta.url))], env: { ...process.env, PORT: String(bridge.address().port), MCP_NO_AUTOSTART: "1", MCP_READONLY: readonly ? "1" : "0", MCP_PROJECT_DIR: process.cwd() }, stderr: "pipe" });
		const client = new Client({ name: "html-test", version: "1" });
		await client.connect(transport);
		return client;
	};
	const client = await makeClient();
	let readonly;
	try {
		const dry = await client.callTool({ name: "figma_html_to_design", arguments: { html: "<main>Проверка</main>", width: 390, dry: true } });
		assert.ok(!dry.isError, JSON.stringify(dry));
		assert.equal(calls.length, 0);
		assert.equal(JSON.parse(dry.content[0].text).spec.w, 390);
		const write = await client.callTool({ name: "figma_html_to_design", arguments: { html: "<main>Текст 🚀</main>", width: 390, file: "Import test", quiet: true } });
		assert.ok(!write.isError, JSON.stringify(write));
		const create = calls.find((c) => c.tool === "create");
		assert.ok(create);
		assert.ok(flatten(create.args.spec).some((n) => n.text?.includes("🚀")));
		readonly = await makeClient(true);
		assert.ok(!(await readonly.listTools()).tools.some((t) => t.name === "figma_html_to_design"));
	} finally {
		await client.close();
		await readonly?.close();
		for (const ws of bridge.clients) ws.terminate();
		await new Promise((r) => bridge.close(r));
	}
});
