// HTML → спека Vivi: Chromium считает CSS и выполняет приложение, Figma получает
// редактируемые слои с координатами зафиксированного состояния страницы.
import { readFile, realpath, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, isAbsolute, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { MAX_NODES, MAX_SPEC_BYTES, validateSpec } from "./design-pipeline.mjs";

const ORIGIN = "https://vivi-import.invalid";
const MAX_SOURCE = 2 * 1024 * 1024;
const MIME = { ".html": "text/html", ".htm": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf" };

// realpath закрывает выход через ../ и симлинки; локальные ресурсы доступны
// только внутри явно разрешённых корней проекта, как у импорта картинок.
export async function localImportFile(path, roots) {
	if (!roots?.length) throw new Error("HTML: не определён корень проекта");
	const full = await realpath(isAbsolute(path) ? path : resolve(roots[0], path));
	const allowed = await Promise.all(roots.map((r) => realpath(r).catch(() => resolve(r))));
	if (!allowed.some((r) => full === r || full.startsWith(r.endsWith(sep) ? r : r + sep))) throw new Error("HTML: файл вне проекта");
	if ((await stat(full)).size > MAX_SOURCE) throw new Error("HTML: ресурс больше 2 МБ");
	return full;
}

export function checkHtmlInput(args) {
	if ([args.html, args.path, args.url].filter((v) => typeof v === "string" && v.trim()).length !== 1)
		throw new Error("HTML: укажите ровно один источник — html, path или url");
	if (args.html && Buffer.byteLength(args.html) > MAX_SOURCE) throw new Error("HTML: исходник больше 2 МБ");
	if (args.css && Buffer.byteLength(args.css) > MAX_SOURCE) throw new Error("HTML: CSS больше 2 МБ");
	if (args.url && !["http:", "https:"].includes(new URL(args.url).protocol)) throw new Error("HTML: url должен быть http:// или https://");
}

export async function htmlToDesign(args, { roots = [], executablePath = process.env.VIVI_CHROMIUM_EXECUTABLE } = {}) {
	checkHtmlInput(args);
	const width = args.width ?? 1440;
	const height = args.height ?? 900;
	const maxNodes = args.maxNodes ?? MAX_NODES;
	if (!Number.isInteger(width) || width < 320 || width > 4096 || !Number.isInteger(height) || height < 200 || height > 4096)
		throw new Error("HTML: width 320–4096, height 200–4096");
	if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > MAX_NODES) throw new Error(`HTML: maxNodes 1–${MAX_NODES}`);
	if (!Number.isInteger(args.waitMs ?? 0) || (args.waitMs ?? 0) < 0 || (args.waitMs ?? 0) > 10_000) throw new Error("HTML: waitMs 0–10000");
	if (!Number.isFinite(args.deviceScaleFactor ?? 1) || (args.deviceScaleFactor ?? 1) < 1 || (args.deviceScaleFactor ?? 1) > 3) throw new Error("HTML: deviceScaleFactor 1–3");
	const sourcePath = args.path ? await localImportFile(args.path, roots) : null;
	const html = sourcePath ? await readFile(sourcePath, "utf8") : args.html;
	const baseDir = sourcePath ? dirname(sourcePath) : roots[0];
	const allowNetwork = args.allowNetwork ?? Boolean(args.url);
	const warnings = new Set();
	let browser;
	try {
		// На Windows можно работать сразу с установленным Edge/Chrome, даже если
		// отдельный Chromium ещё не скачан. Пользовательский профиль не используется.
		if (!executablePath && !existsSync(chromium.executablePath()) && process.platform === "win32") {
			const candidates = [resolve(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"), resolve(process.env.ProgramFiles || "C:/Program Files", "Google/Chrome/Application/chrome.exe")];
			executablePath = candidates.find((p) => existsSync(p));
		}
		browser = await chromium.launch({ headless: true, executablePath, timeout: 30_000 });
	} catch (err) {
		throw new Error(`HTML: не удалось запустить Chromium. Выполните npx playwright install chromium (или задайте VIVI_CHROMIUM_EXECUTABLE). ${err.message}`);
	}
	// Закрытие браузера также прерывает зависший JS/evaluate; у evaluate нет timeout.
	let expired = false;
	const watchdog = setTimeout(() => {
		expired = true;
		void browser.close().catch(() => {});
	}, 60_000);
	try {
		const userAgent = args.userAgent || (args.isMobile ? `Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Mobile Safari/537.36` : undefined);
		const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: args.deviceScaleFactor ?? 1, isMobile: args.isMobile ?? false, hasTouch: args.isMobile ?? false, userAgent, javaScriptEnabled: args.javascript !== false, bypassCSP: true, serviceWorkers: "block", acceptDownloads: false, reducedMotion: "reduce", colorScheme: args.colorScheme ?? "light" });
		if (!allowNetwork) await context.routeWebSocket("**/*", (ws) => ws.close());
		await context.route("**/*", async (route) => {
			const request = route.request();
			const url = new URL(request.url());
			try {
				if (url.origin === ORIGIN) {
					if (url.pathname === "/__vivi_entry__.html") {
						await route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
						return;
					}
					if (!baseDir) throw new Error("нет корня для локальных ресурсов");
					const file = await localImportFile(resolve(baseDir, "." + decodeURIComponent(url.pathname)), roots);
					const contentType = MIME[extname(file).toLowerCase()];
					if (!contentType) throw new Error("неподдерживаемый тип ресурса");
					await route.fulfill({ contentType, body: await readFile(file) });
					return;
				}
				if (allowNetwork && ["http:", "https:"].includes(url.protocol)) return await route.continue();
				if (url.protocol === "data:") return await route.continue();
				warnings.add("Внешние ресурсы отключены; для их загрузки передайте allowNetwork:true.");
			} catch (err) {
				warnings.add(`Не загружен ресурс ${url.pathname.slice(0, 120)}: ${err.message}`);
			}
			await route.abort().catch(() => {});
		});
		const page = await context.newPage();
		page.setDefaultTimeout(15_000);
		page.on("pageerror", (err) => warnings.add(`Ошибка JavaScript: ${err.message.slice(0, 160)}`));
		await page.goto(args.url || `${ORIGIN}/__vivi_entry__.html`, { waitUntil: "domcontentloaded", timeout: 30_000 });
		if (args.css) await page.evaluate((css) => {
			const style = document.createElement("style");
			style.textContent = css;
			document.documentElement.append(style);
		}, args.css);
		if (args.scroll) {
			// Прогреваем lazy-load без бесконечного обхода infinite scroll.
			for (let step = 0; step < 20; step++) {
				const done = await page.evaluate(() => {
					const before = scrollY;
					scrollBy(0, innerHeight);
					return scrollY === before;
				});
				await page.waitForTimeout(100);
				if (done) break;
				if (step === 19) warnings.add("Lazy-load: прокрутка ограничена 20 экранами; бесконечный список импортирован частично.");
			}
			await page.evaluate(() => scrollTo(0, 0));
		}
		if (args.waitFor) await page.locator(args.waitFor).first().waitFor({ state: "visible", timeout: 20_000 });
		if (args.waitMs) await page.waitForTimeout(args.waitMs);
		await page.evaluate(() => Promise.race([Promise.all([...document.images].filter((img) => img.loading !== "lazy" || img.getBoundingClientRect().top < innerHeight).map((img) => img.decode().catch(() => {}))), new Promise((r) => setTimeout(r, 3000))]));
		await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]));
		await page.evaluate(() => {
			const style = document.createElement("style");
			style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
			document.documentElement.append(style);
		});
		const captureKey = `data-vivi-${Math.random().toString(36).slice(2)}`;
		const result = await page.evaluate(snapshotDOM, { selector: args.selector, name: args.name, maxNodes, captureKey });
		for (const note of result.warnings) warnings.add(note);
		const assets = [];
		function collect(node) {
			if (node.captureIndex !== undefined) {
				assets.push({ index: node.captureIndex, background: node.captureBackground, node });
				delete node.captureIndex;
				delete node.captureBackground;
			}
			for (const child of node.children || []) collect(child);
		}
		collect(result.spec);
		let bytes = 0;
		for (const asset of assets) {
			try {
				const target = page.locator(`[${captureKey}="${asset.index}"]`);
				const png = await target.screenshot({ type: "png", timeout: 5000, animations: "disabled", ...(asset.background ? { style: `[${captureKey}="${asset.index}"]{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}[${captureKey}="${asset.index}"] *{visibility:hidden!important}[${captureKey}="${asset.index}"]::before,[${captureKey}="${asset.index}"]::after{visibility:hidden!important}` } : {}) });
				bytes += png.length;
				if (bytes > MAX_SPEC_BYTES / 2) throw new Error("изображения превысили бюджет 3 МБ");
				asset.node.data = png.toString("base64");
				asset.node.mime = "image/png";
			} catch (err) {
				asset.node.type = "rect";
				asset.node.fill = "#E4E4E7";
				warnings.add(`Изображение «${asset.node.name}» заменено заглушкой: ${err.message.slice(0, 120)}`);
			}
		}
		const bad = validateSpec(result.spec);
		if (bad) throw new Error(bad);
		return { spec: result.spec, warnings: [...warnings].slice(0, 40), source: { url: args.url || null, viewport: { width, height }, isMobile: args.isMobile ?? false, deviceScaleFactor: args.deviceScaleFactor ?? 1, javascript: args.javascript !== false, nodes: result.count } };
	} catch (err) {
		if (expired) throw new Error("HTML: импорт превысил 60 секунд. Выберите меньший блок через selector или сократите ожидание.");
		throw err;
	} finally {
		clearTimeout(watchdog);
		await browser.close();
	}
}

// Функция целиком исполняется в странице; зависимости с Node-стороны недоступны.
function snapshotDOM({ selector, name, maxNodes, captureKey }) {
	const root = selector ? document.querySelector(selector) : document.body;
	if (!root) throw new Error(`HTML: не найден корневой элемент ${selector || "body"}`);
	const warnings = new Set();
	const assets = [];
	let count = 0;
	let characters = 0;
	const skip = new Set(["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT", "TEMPLATE", "HEAD"]);
	const round = (v) => Math.round(v * 100) / 100;
	const n = (v) => parseFloat(v) || 0;
	function take(node) {
		if (++count > maxNodes) throw new Error(`HTML: больше ${maxNodes} слоёв — выберите меньший блок через selector`);
		return node;
	}
	function color(value) {
		if (!value || value === "transparent") return "#00000000";
		const p = value.match(/[\d.]+/g)?.map(Number);
		if (!p || p.length < 3 || !value.startsWith("rgb")) {
			warnings.add(`Цвет ${value} не перенесён; используйте sRGB.`);
			return "#00000000";
		}
		return "#" + p.slice(0, 3).concat(Math.round((p[3] ?? 1) * 255)).map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
	}
	function font(c) {
		const weights = ["thin", "light", "light", "regular", "medium", "semibold", "bold", "extrabold", "black"];
		let family = c.fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
		if (["sans-serif", "system-ui", "Arial"].includes(family)) family = "Inter";
		if (family === "serif") family = "Times New Roman";
		if (family === "monospace") family = "Courier New";
		return { fontFamily: family, fontSize: n(c.fontSize), fontWeight: weights[Math.max(0, Math.min(8, Math.round(n(c.fontWeight) / 100) - 1))], color: color(c.color), lineHeight: c.lineHeight === "normal" ? round(n(c.fontSize) * 1.2) : n(c.lineHeight), letterSpacing: n(c.letterSpacing), ...(c.textDecorationLine.includes("underline") ? { textDecoration: "underline" } : c.textDecorationLine.includes("line-through") ? { textDecoration: "strike" } : {}) };
	}
	function textNodes(text, element, origin) {
		const c = getComputedStyle(element);
		if (c.visibility !== "visible") return [];
		const style = font(c);
		const lines = [];
		const range = document.createRange();
		for (let i = 0; i < text.length; i++) {
			if (++characters > 100_000) throw new Error("HTML: слишком много текста — выберите блок через selector");
			range.setStart(text, i);
			range.setEnd(text, i + 1);
			const b = range.getBoundingClientRect();
			if (!b.width || !b.height) continue; // схлопнутые пробелы и переносы
			let line = lines.at(-1);
			if (!line || Math.abs(line.y - b.y) > 1) {
				line = { x: b.x, y: b.y, right: b.right, height: b.height, text: "" };
				lines.push(line);
			}
			line.text += text.data[i];
			line.x = Math.min(line.x, b.x);
			line.right = Math.max(line.right, b.right);
		}
		return lines.filter((l) => l.text.trim()).map((l) => {
			let content = l.text;
			if (!c.whiteSpace.startsWith("pre") && c.whiteSpace !== "break-spaces") content = content.replace(/\s+/g, " ");
			if (c.textTransform === "uppercase") content = content.toUpperCase();
			if (c.textTransform === "lowercase") content = content.toLowerCase();
			return take({ type: "text", name: content.slice(0, 60), text: content, ...style, x: round(l.x - origin.x), y: round(l.y - origin.y - (style.lineHeight - l.height) / 2), w: round(l.right - l.x + 1), h: round(style.lineHeight) });
		});
	}
	function walk(el, origin, depth = 0) {
		if (depth > 60) throw new Error("HTML: дерево глубже 60 уровней — выберите блок через selector");
		if (skip.has(el.tagName)) return [];
		const c = getComputedStyle(el);
		if (c.display === "none" || c.contentVisibility === "hidden") return [];
		const b = el.getBoundingClientRect();
		if (c.display === "contents" || (!b.width && !b.height)) {
			return [...el.childNodes].flatMap((ch) => ch.nodeType === 1 ? walk(ch, origin, depth + 1) : ch.nodeType === 3 ? textNodes(ch, el, origin) : []);
		}
		if (el.tagName === "IFRAME") {
			warnings.add("iframe пропущены: импортируйте их URL отдельно.");
			return [];
		}
		const label = el.getAttribute("aria-label") || el.id || el.tagName.toLowerCase() + (el.classList.length ? "." + [...el.classList].slice(0, 2).join(".") : "");
		const box = { name: label.slice(0, 100), x: round(b.x - origin.x), y: round(b.y - origin.y), w: round(Math.max(0.01, b.width)), h: round(Math.max(0.01, b.height)) };
		if (["IMG", "CANVAS", "VIDEO"].includes(el.tagName)) {
			if (c.visibility !== "visible") return [];
			if (assets.length >= 40) throw new Error("HTML: больше 40 изображений — импортируйте по секциям");
			const index = assets.length;
			const node = take({ type: "image", ...box, fit: "fill", captureIndex: index });
			el.setAttribute(captureKey, String(index));
			assets.push({ index, node });
			if (el.tagName !== "IMG") warnings.add("Canvas и видео перенесены изображениями текущего состояния.");
			return [node];
		}
		if (el.tagName.toLowerCase() === "svg") {
			if (c.visibility !== "visible") return [];
			const clone = el.cloneNode(true);
			const originals = [el, ...el.querySelectorAll("*")];
			const copies = [clone, ...clone.querySelectorAll("*")];
			originals.forEach((o, i) => {
				const s = getComputedStyle(o);
				for (const key of ["fill", "stroke", "stroke-width", "opacity", "fill-rule", "stroke-linecap", "stroke-linejoin", "color"])
					copies[i].style.setProperty(key, s.getPropertyValue(key));
			});
			clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
			return [take({ type: "icon", ...box, svg: clone.outerHTML })];
		}
		const node = take({ type: "frame", ...box, layout: "none", fill: c.visibility === "visible" ? color(c.backgroundColor) : "#00000000", clip: ["hidden", "clip", "scroll", "auto"].includes(c.overflowX) || ["hidden", "clip", "scroll", "auto"].includes(c.overflowY), opacity: n(c.opacity), children: [] });
		if (c.visibility === "visible") {
			node.radius = [c.borderTopLeftRadius, c.borderTopRightRadius, c.borderBottomRightRadius, c.borderBottomLeftRadius].map((v) => v.endsWith("%") ? n(v) / 100 * Math.min(b.width, b.height) : n(v));
			const sides = ["Top", "Right", "Bottom", "Left"].filter((s) => n(c[`border${s}Width`]) && c[`border${s}Style`] !== "none");
			if (sides.length) {
				node.stroke = color(c[`border${sides[0]}Color`]);
				node.strokeWidth = n(c[`border${sides[0]}Width`]);
				node.strokeSides = sides.map((s) => s.toLowerCase());
				if (sides.some((s) => c[`border${s}Color`] !== c[`border${sides[0]}Color`] || n(c[`border${s}Width`]) !== node.strokeWidth)) warnings.add("Разные цвета/толщины сторон рамки упрощены до первой стороны.");
			}
			if (c.backgroundImage !== "none") {
				if (assets.length >= 40) throw new Error("HTML: больше 40 изображений — импортируйте по секциям");
				const index = assets.length;
				el.setAttribute(captureKey, String(index));
				const background = take({ type: "image", name: "Background", x: 0, y: 0, w: box.w, h: box.h, fit: "fill", captureIndex: index, captureBackground: true });
				assets.push({ index });
				node.children.push(background);
				warnings.add("CSS background-image/градиенты перенесены отдельными растровыми слоями.");
			}
			if (c.boxShadow !== "none") {
				const colors = c.boxShadow.match(/rgba?\([^)]*\)/g) || [];
				const values = c.boxShadow.replace(/rgba?\([^)]*\)/g, "").match(/-?[\d.]+px/g)?.map(n) || [];
				if (colors.length === 1 && !c.boxShadow.includes("inset") && values.length >= 3 && !values[3]) node.shadow = { x: values[0], y: values[1], blur: values[2], color: color(colors[0]) };
				else warnings.add("Составные/inset-тени и spread пока не перенесены.");
			}
			if (c.transform !== "none") warnings.add("CSS transform перенесён как ограничивающий прямоугольник; поворот и наклон могут отличаться.");
			for (const pseudo of ["::before", "::after"]) {
				const p = getComputedStyle(el, pseudo);
				if (p.content !== "none" && p.content !== "normal") warnings.add("Псевдоэлементы ::before/::after пока не перенесены.");
			}
		}
		for (const ch of el.childNodes) {
			if (ch.nodeType === 1) node.children.push(...walk(ch, b, depth + 1));
			if (ch.nodeType === 3) node.children.push(...textNodes(ch, el, b));
		}
		if (el.shadowRoot) {
			for (const ch of el.shadowRoot.children) node.children.push(...walk(ch, b, depth + 1));
			warnings.add("Открытый Shadow DOM перенесён; slots и закрытые shadow roots могут отличаться.");
		}
		if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) {
			const value = el.tagName === "SELECT" ? el.selectedOptions[0]?.text : el.value || el.getAttribute("placeholder");
			if (value && el.type !== "password") node.children.push(take({ type: "text", name: "Value", text: value, ...font(c), x: n(c.borderLeftWidth) + n(c.paddingLeft), y: n(c.borderTopWidth) + n(c.paddingTop), w: Math.max(1, b.width - n(c.paddingLeft) - n(c.paddingRight)) }));
			warnings.add("Поля форм перенесены как слои; нативные checkbox/radio/select могут отличаться.");
		}
		return [node];
	}
	const rootBox = root.getBoundingClientRect();
	const nodes = walk(root, { x: rootBox.x, y: rootBox.y });
	let spec;
	if (nodes.length === 1 && nodes[0].type === "frame") spec = nodes[0];
	else spec = take({ type: "frame", layout: "none", x: 0, y: 0, w: Math.max(1, rootBox.width), h: Math.max(1, rootBox.height), fill: "#00000000", children: nodes });
	if (!selector) {
		// Body margin сохраняется внутри корневого viewport, фон html не теряется.
		const doc = document.documentElement;
		const bg = getComputedStyle(doc).backgroundColor;
		spec = take({ type: "frame", layout: "none", w: innerWidth, h: Math.max(innerHeight, doc.scrollHeight), fill: color(bg) === "#00000000" ? "#FFFFFFFF" : color(bg), clip: true, children: [{ ...spec, x: round(rootBox.x + scrollX), y: round(rootBox.y + scrollY) }] });
	}
	spec.name = name || (selector ? selector : document.title || "HTML import");
	delete spec.x;
	delete spec.y;
	return { spec, count, warnings: [...warnings] };
}
