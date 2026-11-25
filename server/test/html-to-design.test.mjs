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
import { PNG } from "pngjs";
import { validateSpec } from "../design-pipeline.mjs";

const flatten = (n) => [n, ...(n.children || []).flatMap(flatten)];

test("HTML: iframe pixels and native select arrow are captured", async () => {
	const server = createServer((req, res) => {
		res.setHeader("Content-Type", "text/html; charset=utf-8");
		res.end(req.url === "/frame" ? '<style>body{margin:0;background:red;color:white}</style>Widget' : `<style>body{margin:0}select{display:block;width:250px;height:50px;background:white;color:black;border:1px solid #ddd;padding:10px}iframe{display:block;border:0;width:300px;height:80px}</style><main><select id="client"><option>Supplier</option><option selected>Client</option></select><iframe id="captcha" src="http://localhost:${server.address().port}/frame"></iframe></main>`);
	});
	await new Promise((resolve) => server.listen(0, resolve));
	try {
		const result = await htmlToDesign({ url: `http://127.0.0.1:${server.address().port}`, selector: "main", width: 400, waitMs: 100 });
		const nodes = flatten(result.spec);
		const select = nodes.find((node) => node.name === "client");
		assert.equal(select.type, "image");
		const png = PNG.sync.read(Buffer.from(select.data, "base64"));
		let arrowPixels = 0;
		for (let y = 15; y < 35; y++) for (let x = 230; x < 248; x++) if (png.data[(y * png.width + x) * 4] < 80) arrowPixels++;
		assert.ok(arrowPixels > 0);
		const frame = nodes.find((node) => node.name === "captcha");
		assert.equal(frame.type, "image");
		const framePng = PNG.sync.read(Buffer.from(frame.data, "base64"));
		assert.equal(framePng.width, 300);
		assert.equal(framePng.height, 80);
		assert.deepEqual([...framePng.data.subarray((40 * 300 + 150) * 4, (40 * 300 + 150) * 4 + 4)], [255, 0, 0, 255]);
	} finally { await new Promise((resolve) => server.close(resolve)); }
});

test("HTML: slow image is reused from the source page instead of downloaded twice", async () => {
	const pixel = new PNG({ width: 2, height: 2 }); pixel.data.fill(255);
	const bytes = PNG.sync.write(pixel);
	let requests = 0;
	const server = createServer((req, res) => {
		if (req.url === "/slow.png") {
			requests++; res.writeHead(200, { "Content-Type": "image/png", "Content-Length": bytes.length }); res.flushHeaders();
			return setTimeout(() => res.end(bytes), 6200);
		}
		res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end('<main><img src="/slow.png" width="32" height="32"></main>');
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const result = await htmlToDesign({ url: `http://127.0.0.1:${server.address().port}`, selector: "main", width: 320 });
		assert.equal(requests, 1);
		assert.ok(flatten(result.spec).find((node) => node.type === "image")?.data);
		assert.ok(!result.warnings.some((warning) => warning.includes("заглушкой")), result.warnings.join("\n"));
	} finally { await new Promise((resolve) => server.close(resolve)); }
});

test("HTML: no default node/image/depth/spec-size limits", async () => {
	const pixel = new PNG({ width: 1, height: 1 }); pixel.data.set([255, 0, 0, 255]);
	const src = "data:image/png;base64," + PNG.sync.write(pixel).toString("base64");
	const html = '<style>body{margin:0}div{height:1px}img{width:8px;height:8px}</style><main>' + '<div></div>'.repeat(610) + '<section>'.repeat(70) + 'Deep' + '</section>'.repeat(70) + `<img src="${src}">`.repeat(42) + '</main>';
	const result = await htmlToDesign({ html, width: 320 });
	assert.ok(result.source.nodes > 600);
	assert.equal(flatten(result.spec).filter((node) => node.type === "image").length, 42);
	assert.ok(!result.warnings.some((warning) => warning.includes("заглушкой")), result.warnings.join("\n"));
	assert.ok(MCP_TOOLS.html_to_design.input.maxNodes.safeParse(10000).success);
	const large = { type: "frame", children: [{ type: "text", text: "x".repeat(7 * 1024 * 1024) }] };
	assert.equal(validateSpec(large, { limits: false }), null);
	assert.ok(validateSpec(large));
	await assert.rejects(htmlToDesign({ html: "<main><div>A</div><div>B</div></main>", selector: "main", maxNodes: 1 }), /maxNodes/);
});

test("HTML images: opaque photos compress, alpha stays PNG, clipped/zero-size assets are skipped", async () => {
	const noisy = new PNG({ width: 256, height: 256 });
	let seed = 123;
	for (let i = 0; i < noisy.data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; noisy.data[i] = i % 4 === 3 ? 255 : seed >>> 24; }
	const opaque = PNG.sync.write(noisy);
	for (let i = 3; i < noisy.data.length; i += 4) noisy.data[i] = 128;
	const transparent = PNG.sync.write(noisy);
	const server = createServer((req, res) => {
		if (req.url.endsWith(".png")) { res.setHeader("Content-Type", "image/png"); return res.end(req.url === "/alpha.png" ? transparent : opaque); }
		res.setHeader("Content-Type", "text/html; charset=utf-8");
		res.end('<style>body{margin:0}main{position:relative;width:520px;height:256px;overflow:hidden}img{width:256px;height:256px;position:absolute;top:0}#alpha{left:260px}#clipped{left:800px}#hidden{opacity:0}main::before{content:"";position:absolute;width:256px;height:0;background:linear-gradient(red,blue)}</style><main><img id="photo" src="/photo.png"><img id="alpha" src="/alpha.png"><img id="clipped" src="/photo.png"><div id="hidden"><img src="/photo.png"></div></main>');
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const result = await htmlToDesign({ url: `http://127.0.0.1:${server.address().port}`, selector: "main", width: 600 });
		const images = flatten(result.spec).filter((node) => node.type === "image");
		assert.equal(images.length, 2);
		assert.equal(images.find((node) => node.name === "photo").mime, "image/jpeg");
		const alpha = images.find((node) => node.name === "alpha");
		assert.equal(alpha.mime, "image/png");
		assert.equal(PNG.sync.read(Buffer.from(alpha.data, "base64")).data[3], 128);
		assert.ok(!result.warnings.some((warning) => warning.includes("заглушкой")), result.warnings.join("\n"));
	} finally { await new Promise((resolve) => server.close(resolve)); }
});

test("HTML SVG: CSS viewport and local/external sprite uses are self-contained", async () => {
	const server = createServer((req, res) => {
		res.setHeader("Content-Type", req.url === "/sprite.svg" ? "image/svg+xml" : "text/html; charset=utf-8");
		res.end(req.url === "/sprite.svg" ? '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="external" viewBox="0 0 40 20"><path d="M0 0H40V20H0Z"/></symbol></svg>' : '<style>body{margin:0}main{display:flex;height:80px;align-items:center}main>svg{width:28px;height:20px;fill:red}</style><svg style="display:none"><symbol id="local" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5"/></symbol></svg><main><svg id="direct" viewBox="0 0 100 100"><path d="M0 0H100V100H0Z"/></svg><svg id="local-icon"><use href="#local"/></svg><svg id="external-icon"><use href="/sprite.svg#external"/></svg></main>');
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const result = await htmlToDesign({ url: `http://127.0.0.1:${server.address().port}`, selector: "main", width: 320 });
		const icons = flatten(result.spec).filter((node) => node.type === "icon");
		assert.equal(icons.length, 3);
		for (const icon of icons) {
			assert.equal(icon.w, 28);
			assert.equal(icon.h, 20);
			assert.match(icon.svg, /width="28"/);
			assert.match(icon.svg, /height="20"/);
			assert.doesNotMatch(icon.svg, /<use\b/);
		}
		assert.match(icons[1].svg, /<circle/);
		assert.match(icons[2].svg, /viewBox="0 0 40 20"/);
		assert.match(icons[2].svg, /<path/);
		assert.ok(!result.warnings.some((warning) => warning.includes("SVG")), result.warnings.join("\n"));
	} finally { await new Promise((resolve) => server.close(resolve)); }
});

test("HTML: plain body is flattened with offsets, background and stacking intact", async () => {
	const result = await htmlToDesign({ html: '<style>body{margin:12px 20px;background:#123456}main{height:100px}footer{position:relative;z-index:2;height:30px}</style><main id="main">Content</main><footer id="footer">Footer</footer>', width: 320 });
	assert.deepEqual(result.spec.children.map((node) => node.name), ["main", "footer"]);
	assert.equal(result.spec.fill, "#123456ff");
	assert.equal(result.spec.children[0].x, 20);
	assert.equal(result.spec.children[0].y, 12);
	assert.equal(result.spec.children[1].y, 112);
	assert.ok(!flatten(result.spec).some((node) => node.name === "body"));
	const effects = await htmlToDesign({ html: '<style>body{opacity:.5}</style><main>Grouped opacity</main>', width: 320 });
	assert.equal(effects.spec.children[0].name, "body");
	assert.equal(effects.spec.children[0].opacity, .5);
});

test("HTML: body overflow wrapper is flattened into the page frame", async () => {
	const result = await htmlToDesign({ html: '<style>body{margin:0;overflow-x:hidden;overflow-y:auto;background:#090820}section{height:120px}</style><section>Content</section>' });
	assert.equal(result.spec.children.some((node) => node.name === "body"), false);
	assert.equal(result.spec.fill, "#090820ff");
	assert.ok(flatten(result.spec).some((node) => node.type === "text" && node.text === "Content"));
});

test("HTML: relative section wrappers keep normal-flow children nested", async () => {
	const result = await htmlToDesign({ html: '<section id="section" style="position:relative"><h2>Title</h2><p>Body</p></section>' });
	const section = flatten(result.spec).find((node) => node.name === "section.section");
	assert.ok(section);
	assert.ok(section.children.some((node) => node.name === "h2"));
	assert.ok(section.children.some((node) => node.name === "p"));
});

test("HTML: абсолютные before/after сохраняют геометрию, градиент и порядок", async () => {
	const html = `<style>body{margin:0}main{position:relative;width:320px;height:200px;background:blue}main::before{content:"";position:absolute;inset:0;background:linear-gradient(rgba(255,255,255,.95) 85%,transparent)}main::after{content:"OK";position:absolute;right:10px;top:10px;width:30px;height:20px;background:red;color:white}</style><main></main>`;
	const result = await htmlToDesign({ html, selector: "main", width: 320 });
	const before = flatten(result.spec).find((node) => node.name === "::before");
	const after = flatten(result.spec).find((node) => node.name === "::after");
	assert.ok(before);
	assert.ok(after);
	assert.equal(before.w, 320);
	assert.equal(before.h, 200);
	assert.equal(after.x, 280);
	assert.equal(after.y, 10);
	assert.ok(flatten(after).some((node) => node.text === "OK"));
	const image = flatten(before).find((node) => node.type === "image");
	const png = PNG.sync.read(Buffer.from(image.data, "base64"));
	assert.ok(png.data[(10 * png.width + 10) * 4 + 3] > 235);
	assert.ok(png.data[((png.height - 1) * png.width + 10) * 4 + 3] < 20);
	assert.ok(result.spec.children.indexOf(before) < result.spec.children.indexOf(after));
	assert.ok(!result.warnings.some((warning) => warning.includes("псевдоэлементы")));
});

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
	assert.equal(m.find((n) => n.type === "text").fontFamily, "Arial");
	assert.ok(!m.some((n) => n.text === "Скрыт"));
	assert.equal(desktop.spec.layout, "horizontal");
	assert.equal(mobile.spec.layout, "vertical");
	assert.equal(desktop.spec.gap, 24);
	assert.equal(mobile.spec.gap, 10);
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

test("HTML: страница целиком без высоты и без обрезки по viewport", async () => {
	const html = '<style>body{margin:0}main{height:5000px;display:flex;align-items:flex-end}</style><main><p>Конец страницы</p></main>';
	for (const height of [undefined, 400]) {
		const result = await htmlToDesign({ html, width: 390, ...(height ? { height } : {}) });
		assert.equal(result.spec.w, 390);
		assert.equal(result.spec.h, 5000);
		assert.equal(result.source.viewport.height, height || 900);
		assert.ok(flatten(result.spec).some((node) => node.text === "Конец страницы"));
	}
});

test("HTML: nested path and uploaded folder preserve CSS imports and image assets", async () => {
	const dir = await mkdtemp(join(tmpdir(), "vivi-html-assets-"));
	try {
		await mkdir(join(dir, "pages"));
		await mkdir(join(dir, "assets"));
		const entry = "pages/design #1.html";
		const files = new Map([
			[entry, Buffer.from('<link rel="stylesheet" href="../assets/main.css"><main><img src="/assets/mark.svg" width="16" height="16">Styled</main>')],
			["assets/main.css", Buffer.from('@import "./colors.css"; main{padding:10px}')],
			["assets/colors.css", Buffer.from("main{background:#284660}")],
			["assets/mark.svg", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>')],
		]);
		for (const [path, data] of files) await writeFile(join(dir, path), data);
		for (const source of [{ path: entry }, { upload: { entry, files } }]) {
			const result = await htmlToDesign({ ...source, selector: "main" }, { roots: [dir] });
			assert.equal(result.spec.fill, "#284660ff");
			assert.ok(flatten(result.spec).some((n) => n.type === "image" && n.data));
			assert.deepEqual(result.warnings, []);
		}
		const standalone = await htmlToDesign({ upload: { entry, files: new Map([[entry, files.get(entry)]]) }, selector: "main" }, { roots: [dir] });
		assert.notEqual(standalone.spec.fill, "#284660ff");
		assert.ok(standalone.warnings.some((warning) => warning.includes("main.css")));
	} finally {
		await rm(dir, { recursive: true, force: true });
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

test("HTML: scroll reveals sections on smooth-scrolling pages without showing intentionally hidden content", async () => {
	const html = `<style>
	html{scroll-behavior:smooth}body{margin:0}header{height:520px}
	section{height:400px}.reveal,#hidden{opacity:0}.shown{opacity:1}
	</style><header>Top content</header><section class="reveal">First revealed section</section>
	<section class="reveal">Last revealed section</section><div id="hidden">Hidden by design</div>
	<script>
	const observer = new IntersectionObserver(entries => {
		for (const entry of entries) if (entry.isIntersecting) entry.target.classList.add('shown');
	}, { threshold: .15, rootMargin: '0px 0px -100px 0px' });
	document.querySelectorAll('.reveal').forEach(section => observer.observe(section));
	</script>`;
	const captured = await htmlToDesign({ html, height: 300, scroll: true });
	const text = flatten(captured.spec).filter((node) => node.type === "text").map((node) => node.text);
	assert.deepEqual(text, ["Top content", "First revealed section", "Last revealed section"]);
});

test("HTML: missing optional CDN globals do not abort the first-screen reveal", async () => {
	const result = await htmlToDesign({
		html: `<style>#hero{opacity:0}#hero.is-loaded{opacity:1}</style>
			<main id="hero">Первый экран</main>
			<script>addEventListener("DOMContentLoaded",()=>{IMask(document.body,{});document.querySelector("#hero").classList.add("is-loaded")})</script>`,
		selector: "#hero",
	});
	assert.ok(flatten(result.spec).some((node) => node.text === "Первый экран"));
	assert.ok(!result.warnings.some((warning) => warning.includes("IMask")));
});

test("HTML: CSS rotate and elliptical radii stay in the editable spec", async () => {
	const result = await htmlToDesign({
		html: '<style>#badge{width:300px;height:100px;background:#9333b8;border-radius:100%;rotate:-8.3deg}</style><main><button id="badge">ХОЧУ КП</button></main>',
		selector: "#badge",
	});
	assert.equal(result.spec.rotation, -8.3);
	assert.equal(result.spec.ellipse, true);
	assert.equal(result.spec.fill, "#9333b8ff");
	assert.equal(Math.round(result.spec.w), 300);
	assert.equal(Math.round(result.spec.h), 100);
	assert.deepEqual(result.spec.children.filter((node) => node.type === "text").map((node) => node.text), ["ХОЧУ КП"]);
});

test("HTML: line breaks do not become visible Figma frames", async () => {
	const result = await htmlToDesign({ html: '<h2>ПЕРВАЯ<br>ВТОРАЯ</h2>', selector: "h2" });
	const text = flatten(result.spec).find((node) => node.type === "text");
	assert.equal(text.text.split("\n").length, 2);
	assert.ok(!flatten(result.spec).some((node) => node.name === "br"));
});

test("HTML: inline styled text becomes one Figma text node with spans", async () => {
	const result = await htmlToDesign({ html: '<h2>Получите <span style="color:#9333b8">клиента</span><br>а вы</h2>', selector: "h2" });
	const texts = flatten(result.spec).filter((node) => node.type === "text");
	assert.ok(texts.some((node) => node.text.includes("Получите")));
	assert.ok(texts.some((node) => node.text.includes("клиента")));
});

test("HTML: layer and backdrop blur remain editable Figma effects", async () => {
	const html = `<style>
	#glow{width:80px;height:80px;background:radial-gradient(blue,transparent);filter:blur(50px)}
	#glass{width:60px;height:60px;background:#ffffff20;backdrop-filter:blur(3px) saturate(110%)}
	img{display:block;width:40px;height:40px;filter:blur(4px)}
	</style><main><div id="glow"></div><div id="glass"></div>
	<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='1' height='1' fill='red'/%3E%3C/svg%3E"></main>`;
	const result = await htmlToDesign({ html, selector: "main" });
	const nodes = flatten(result.spec);
	const glow = nodes.find((node) => node.name === "glow");
	assert.equal(glow.layerBlur, 50);
	assert.ok(glow.children.some((node) => node.type === "image" && node.data));
	assert.equal(nodes.find((node) => node.name === "glass").backgroundBlur, 3);
	const img = nodes.find((node) => node.name === "img");
	assert.equal(img.layerBlur, 4);
	assert.equal(PNG.sync.read(Buffer.from(img.data, "base64")).data[3], 255);
	assert.ok(result.warnings.some((warning) => warning.includes("backdrop-filter")));
});

test("HTML: PNG фона не содержит перекрывающих слоёв и сохраняет прозрачность", async () => {
	const result = await htmlToDesign({
		html: '<style>body{margin:0}#scene{position:relative;width:320px;height:200px}#bg{position:absolute;inset:0;background:linear-gradient(rgba(0,0,255,.5),rgba(0,0,255,.5));opacity:.4}#cover{position:absolute;inset:0;background:red;z-index:2}</style><main id="scene"><div id="bg"></div><div id="cover">Отдельный текст поверх фона</div></main>',
		width: 320, height: 200, selector: "#scene",
	});
	const nodes = flatten(result.spec);
	const background = nodes.find((n) => n.name === "Background");
	assert.equal(background.type, "image");
	const png = PNG.sync.read(Buffer.from(background.data, "base64"));
	const center = (Math.floor(png.height / 2) * png.width + Math.floor(png.width / 2)) * 4;
	assert.deepEqual([...png.data.subarray(center, center + 4)], [0, 0, 255, 128]);
	assert.equal(nodes.find((n) => n.name === "bg").opacity, .4);
	assert.equal(nodes.find((n) => n.name === "bg").fill, "#00000000");
	assert.ok(nodes.some((n) => n.type === "text" && n.text.includes("Отдельный текст")));
	assert.equal(nodes.find((n) => n.name === "cover").fill, "#ff0000ff");
});

test("HTML: фон по URL и img захватываются без перекрывающего баннера", async () => {
	const pixel = new PNG({ width: 1, height: 1 });
	pixel.data.set([0, 0, 255, 128]);
	const bytes = PNG.sync.write(pixel);
	const server = createServer((req, res) => {
		if (req.url === "/pixel.png") { res.setHeader("content-type", "image/png"); return res.end(bytes); }
		if (req.url === "/slow.png") { res.setHeader("content-type", "image/png"); return setTimeout(() => res.end(bytes), 250); }
		res.setHeader("content-type", "text/html; charset=utf-8");
		res.end('<style>body{margin:0}#scene{position:relative;width:320px;height:200px}#bg{position:absolute;inset:0;background:url(/pixel.png)}img{position:absolute;width:24px;height:24px;opacity:.5}#slow{position:absolute;left:40px;top:0;width:24px;height:24px;background:url(/slow.png)}#cover{position:absolute;inset:0;background:red;z-index:3}</style><main id="scene"><div id="bg"></div><img id="photo" src="/pixel.png"><div id="slow"></div><div id="cover">Баннер</div></main>');
	});
	await new Promise((r) => server.listen(0, "127.0.0.1", r));
	try {
		const result = await htmlToDesign({ url: `http://127.0.0.1:${server.address().port}`, width: 320, selector: "#scene" });
		const images = flatten(result.spec).filter((n) => n.type === "image");
		assert.equal(images.length, 3);
		for (const image of images) {
			const png = PNG.sync.read(Buffer.from(image.data, "base64"));
			const center = (Math.floor(png.height / 2) * png.width + Math.floor(png.width / 2)) * 4;
			assert.deepEqual([...png.data.subarray(center, center + 4)], [0, 0, 255, 128]);
		}
		assert.equal(images.find((n) => n.name === "photo").opacity, .5);
	} finally { await new Promise((r) => server.close(r)); }
});

test("HTML: порядок отрисовки учитывает z-index, а обычные блоки сохраняют DOM-порядок", async () => {
	const result = await htmlToDesign({ width: 320, selector: "#scene", html: '<style>#scene{isolation:isolate}#front{position:relative;z-index:10}#back{position:relative;z-index:1}#negative{position:relative;z-index:-2}#positioned{position:relative}#flow{z-index:999}</style><main id="scene"><header id="front">Верхний</header><div id="flow">Обычный</div><footer id="back">Нижний</footer><div id="negative">Фон</div><div id="positioned">Позиционированный</div></main>' });
	assert.deepEqual(result.spec.children.map((n) => n.name), ["negative", "flow", "positioned", "back", "front"]);
	const normal = await htmlToDesign({ width: 320, selector: "main", html: '<main><header id="header">Шапка</header><section id="content">Контент</section><footer id="footer">Подвал</footer></main>' });
	assert.deepEqual(normal.spec.children.map((n) => n.name), ["header", "section.content", "footer"]);
	assert.ok(normal.spec.children[0].y < normal.spec.children[2].y);
});

test("HTML: flex/grid order меняет порядок слоёв при одинаковом z-index", async () => {
	const result = await htmlToDesign({ width: 320, selector: "main", html: '<main><div id="flex" style="display:flex"><div id="flex-last" style="order:2">Последний</div><div id="flex-first" style="order:-1">Первый</div></div><div id="grid" style="display:grid"><div id="grid-last" style="order:2">Последний</div><div id="grid-first" style="order:-1">Первый</div></div></main>' });
	assert.deepEqual(result.spec.children[0].children.map((n) => n.name), ["flex-first", "flex-last"]);
	assert.deepEqual(result.spec.children[1].children.map((n) => n.name), ["grid-first", "grid-last"]);
});

test("HTML: фон футера не перекрывает z-index потомков main из другого DOM-контейнера", async () => {
	const result = await htmlToDesign({ width: 320, selector: "#scene", html: '<style>body{margin:0}#scene{width:320px}#header{position:relative;z-index:15;height:30px}#content{position:relative;z-index:2;height:100px;background:lime}#footer{position:relative;height:40px}#backdrop{position:absolute;top:-130px;width:320px;height:200px;background:blue}#footer-bottom{position:relative;z-index:2;height:40px}</style><section id="scene"><div id="main"><header id="header">Шапка</header><div id="content">Контент</div></div><footer id="footer"><div id="backdrop"></div><div id="footer-bottom">Подвал</div></footer></section>' });
	const names = result.spec.children.map((n) => n.name);
	const footer = result.spec.children.find((n) => n.name === "footer");
	assert.ok(footer);
	assert.ok(footer.children.some((n) => n.name === "backdrop"));
	assert.ok(footer.children.some((n) => n.name === "footer-bottom"));
});

test("HTML: настоящий stacking context остаётся отдельной группой", async () => {
	const result = await htmlToDesign({ width: 320, selector: "#scene", html: '<section id="scene"><div id="group" style="position:relative;z-index:1"><div id="inside" style="position:relative;z-index:999">Внутри</div></div><div id="front" style="position:relative;z-index:2">Снаружи</div></section>' });
	assert.deepEqual(result.spec.children.map((n) => n.name), ["group", "front"]);
	assert.equal(result.spec.children[0].children[0].name, "inside");
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
		const write = await client.callTool({ name: "figma_html_to_design", arguments: { html: "<main>Текст 🚀" + "<div></div>".repeat(610) + "</main>", width: 390, file: "Import test", quiet: true } });
		assert.ok(!write.isError, JSON.stringify(write));
		const create = calls.find((c) => c.tool === "create");
		assert.ok(create);
		assert.ok(flatten(create.args.spec).some((n) => n.text?.includes("🚀")));
		assert.ok(flatten(create.args.spec).length > 600);
		readonly = await makeClient(true);
		assert.ok(!(await readonly.listTools()).tools.some((t) => t.name === "figma_html_to_design"));
	} finally {
		await client.close();
		await readonly?.close();
		for (const ws of bridge.clients) ws.terminate();
		await new Promise((r) => bridge.close(r));
	}
});
