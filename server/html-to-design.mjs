// HTML → спека Vivi: Chromium считает CSS и выполняет приложение, Figma получает
// редактируемые слои с координатами зафиксированного состояния страницы.
import { readFile, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, isAbsolute, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { validateSpec } from "./design-pipeline.mjs";

const ORIGIN = "https://vivi-import.invalid";
const MIME = { ".html": "text/html", ".htm": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf" };

// realpath закрывает выход через ../ и симлинки; локальные ресурсы доступны
// только внутри явно разрешённых корней проекта, как у импорта картинок.
export async function localImportFile(path, roots) {
	if (!roots?.length) throw new Error("HTML: не определён корень проекта");
	const full = await realpath(isAbsolute(path) ? path : resolve(roots[0], path));
	const allowed = await Promise.all(roots.map((r) => realpath(r).catch(() => resolve(r))));
	if (!allowed.some((r) => full === r || full.startsWith(r.endsWith(sep) ? r : r + sep))) throw new Error("HTML: файл вне проекта");
	return full;
}

export function checkHtmlInput(args) {
	if ([args.html, args.path, args.url].filter((v) => typeof v === "string" && v.trim()).length !== 1)
		throw new Error("HTML: укажите ровно один источник — html, path или url");
	if (args.url && !["http:", "https:"].includes(new URL(args.url).protocol)) throw new Error("HTML: url должен быть http:// или https://");
}

export async function htmlToDesign(args, { roots = [], executablePath = process.env.VIVI_CHROMIUM_EXECUTABLE } = {}) {
	checkHtmlInput(args);
	const width = args.width ?? 1440;
	const height = args.height ?? 900;
	const maxNodes = args.maxNodes;
	if (!Number.isInteger(width) || width < 320 || width > 4096 || !Number.isInteger(height) || height < 200 || height > 4096)
		throw new Error("HTML: width 320–4096, height 200–4096");
	if (maxNodes !== undefined && (!Number.isInteger(maxNodes) || maxNodes < 1)) throw new Error("HTML: maxNodes должен быть положительным целым числом");
	if (!Number.isInteger(args.waitMs ?? 0) || (args.waitMs ?? 0) < 0 || (args.waitMs ?? 0) > 10_000) throw new Error("HTML: waitMs 0–10000");
	if (!Number.isFinite(args.deviceScaleFactor ?? 1) || (args.deviceScaleFactor ?? 1) < 1 || (args.deviceScaleFactor ?? 1) > 3) throw new Error("HTML: deviceScaleFactor 1–3");
	const sourcePath = args.path ? await localImportFile(args.path, roots) : null;
	const html = sourcePath ? await readFile(sourcePath, "utf8") : args.html;
	const baseDir = sourcePath ? dirname(sourcePath) : roots[0];
	const allowNetwork = args.allowNetwork ?? Boolean(args.url);
	const warnings = new Set();
	const imageResponses = new Map();
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
				if (allowNetwork && ["http:", "https:"].includes(url.protocol)) {
					const cached = await imageResponses.get(request.url());
					if (cached) return await route.fulfill(cached);
					return await route.continue();
				}
				if (url.protocol === "data:") return await route.continue();
				warnings.add("Внешние ресурсы отключены; для их загрузки передайте allowNetwork:true.");
			} catch (err) {
				warnings.add(`Не загружен ресурс ${url.pathname.slice(0, 120)}: ${err.message}`);
			}
			await route.abort().catch(() => {});
		});
		const page = await context.newPage();
		page.on("response", (response) => {
			if (response.ok() && response.request().resourceType() === "image") {
				imageResponses.set(response.url(), response.body().then((body) => ({ body, contentType: response.headers()["content-type"] || "application/octet-stream" })).catch(() => null));
			}
		});
		page.setDefaultTimeout(15_000);
		page.on("pageerror", (err) => warnings.add(`Ошибка JavaScript: ${err.message.slice(0, 160)}`));
		await page.goto(args.url || `${ORIGIN}/__vivi_entry__.html`, { waitUntil: "domcontentloaded", timeout: 30_000 });
		if (args.css) await page.evaluate((css) => {
			const style = document.createElement("style");
			style.textContent = css;
			document.documentElement.append(style);
		}, args.css);
		if (args.scroll) {
			// Cover the entire initial document, without chasing an infinite feed.
			const extent = await page.evaluate(() => document.documentElement.scrollHeight);
			for (let offset = 0; offset < extent; offset += height) {
				const done = await page.evaluate(() => {
					const before = scrollY;
					scrollBy(0, innerHeight);
					return scrollY === before;
				});
				await page.waitForTimeout(100);
				if (done) break;
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
		// Return JSON text: Playwright's object serializer has its own shallow
		// reference-chain limit, independent of the number of imported layers.
		const result = JSON.parse(await page.evaluate(snapshotDOM, { selector: args.selector, name: args.name, maxNodes, captureKey, autoLayout: args.autoLayout !== false }));
		for (const note of result.warnings) warnings.add(note);
		const assets = [];
		function collect(node) {
			if (node.captureIndex !== undefined) {
				assets.push({ index: node.captureIndex, background: node.captureBackground, image: node.captureImage, control: node.captureControl, size: node.captureSize, node });
				delete node.captureIndex;
				delete node.captureBackground;
				delete node.captureImage;
				delete node.captureControl;
				delete node.captureSize;
			}
			for (const child of node.children || []) collect(child);
		}
		collect(result.spec);
		let backgroundPage;
		for (const asset of assets) {
			try {
				let target;
				if (asset.background || asset.image || asset.control) {
					// Снимок исходного элемента содержит и перекрывающие его слои.
					// Рисуем только CSS-фон в отдельной пустой странице того же origin.
					if (!backgroundPage) {
						backgroundPage = await context.newPage();
						await backgroundPage.route("**/*", (route) => route.request().isNavigationRequest()
							? route.fulfill({ contentType: "text/html; charset=utf-8", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:transparent"><div id="background"></div><img id="image" style="display:none"><div id="control" style="display:none"></div></body></html>' })
							: route.fallback());
						await backgroundPage.goto(page.url(), { waitUntil: "domcontentloaded", timeout: 5000 });
					}
					await backgroundPage.evaluate(async ({ background, image, control, w, h }) => {
						async function decoded(img) {
							let timer;
							try { await Promise.race([img.decode(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Изображение не загрузилось за 30 секунд")), 30000); })]); }
							finally { clearTimeout(timer); }
						}
						const bg = document.getElementById("background");
						const img = document.getElementById("image");
						const host = document.getElementById("control");
						bg.style.display = "none";
						img.style.display = "none";
						host.style.display = "none";
						if (control) {
							host.replaceChildren(); host.style.display = "block";
							const select = document.createElement("select");
							for (const [key, value] of Object.entries(control.styles)) select.style.setProperty(key, value);
							Object.assign(select.style, { position: "static", margin: "0", transform: "none", opacity: "1", width: `${w}px`, height: `${h}px`, boxSizing: "border-box" });
							for (const option of control.options) { const el = new Option(option.text, option.value, false, option.selected); el.disabled = option.disabled; select.append(el); }
							select.multiple = control.multiple; select.disabled = control.disabled; select.size = control.size;
							host.append(select); host.style.width = `${w}px`; host.style.height = `${h}px`;
							return;
						}
						const box = image ? img : bg;
						box.removeAttribute("style");
						Object.assign(box.style, image ? image.styles : background, { display: "block", boxSizing: "border-box", width: `${w}px`, height: `${h}px` });
						if (image) { img.src = image.src; await decoded(img); }
						else {
							const urls = [...background.backgroundImage.matchAll(/url\(\s*(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|([^)]*))\s*\)/g)].map((m) => (m[1] ?? m[2] ?? m[3]).trim().replace(/\\(["'\\])/g, "$1"));
							await Promise.all(urls.map(async (url) => { const preload = new Image(); preload.src = url; await decoded(preload); }));
						}
					}, { background: asset.background, image: asset.image, control: asset.control, w: asset.size?.w ?? asset.node.w, h: asset.size?.h ?? asset.node.h });
					target = backgroundPage.locator(asset.control ? "#control" : asset.image ? "#image" : "#background");
				} else target = page.locator(`[${captureKey}="${asset.index}"]`);
				const png = await target.screenshot({ type: "png", timeout: 5000, animations: "disabled", omitBackground: true });
				let data = png.toString("base64"), mime = "image/png", size = png.length;
				if (size > 64 * 1024) {
					// Photo-like opaque captures compress far better as JPEG. Check
					// every alpha value: transparent gradients must remain PNG.
					const jpeg = await (backgroundPage || page).evaluate(async (base64) => {
						const img = new Image(); img.src = "data:image/png;base64," + base64; await img.decode();
						const canvas = document.createElement("canvas"); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
						const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0);
						const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
						for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 255) return null;
						return canvas.toDataURL("image/jpeg", .88).split(",")[1];
					}, data);
					if (jpeg && jpeg.length < data.length) { data = jpeg; mime = "image/jpeg"; size = Buffer.byteLength(jpeg, "base64"); }
				}
				asset.node.data = data;
				asset.node.mime = mime;
			} catch (err) {
				asset.node.type = "rect";
				asset.node.fill = "#E4E4E7";
				warnings.add(`Изображение «${asset.node.name}» заменено заглушкой: ${err.message.slice(0, 120)}`);
			}
		}
		const bad = validateSpec(result.spec, { limits: false });
		if (bad) throw new Error(bad);
		return { spec: result.spec, warnings: [...warnings].slice(0, 40), source: { url: args.url || null, viewport: { width, height }, isMobile: args.isMobile ?? false, deviceScaleFactor: args.deviceScaleFactor ?? 1, javascript: args.javascript !== false, nodes: result.count, layout: result.layout } };
	} finally {
		await browser.close();
	}
}

// Функция целиком исполняется в странице; зависимости с Node-стороны недоступны.
async function snapshotDOM({ selector, name, maxNodes, captureKey, autoLayout }) {
	const root = selector ? document.querySelector(selector) : document.body;
	if (!root) throw new Error(`HTML: не найден корневой элемент ${selector || "body"}`);
	const warnings = new Set();
	const assets = [];
	const cssLayers = new WeakMap();
	let count = 0;
	const skip = new Set(["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT", "TEMPLATE", "HEAD"]);
	const svgDocuments = new Map();
	const documentUrl = new URL(location.href); documentUrl.hash = "";
	svgDocuments.set(documentUrl.href, document);
	const useHref = (el) => el.getAttribute("href") || el.getAttributeNS("http://www.w3.org/1999/xlink", "href") || "";
	let pendingUses = [...root.querySelectorAll("svg use")].map((el) => ({ el, base: document.baseURI }));
	while (pendingUses.length) {
		const urls = new Set();
		for (const { el, base } of pendingUses) {
			try { const url = new URL(useHref(el), base); url.hash = ""; if (!svgDocuments.has(url.href)) urls.add(url.href); } catch {}
		}
		pendingUses = [];
		await Promise.all([...urls].map(async (url) => {
			svgDocuments.set(url, null);
			try {
				const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
				if (!response.ok) throw new Error(String(response.status));
				const text = await response.text();
				const doc = new DOMParser().parseFromString(text, "image/svg+xml");
				if (doc.querySelector("parsererror")) throw new Error("Некорректный SVG");
				svgDocuments.set(url, doc);
				pendingUses.push(...[...doc.querySelectorAll("use")].map((el) => ({ el, base: url })));
			} catch { warnings.add("Не удалось загрузить внешний SVG-спрайт: " + url); }
		}));
	}
	function inlineSvgUses(container, base, seen = new Set()) {
		for (const use of [...container.querySelectorAll("use")]) {
			let url;
			try { url = new URL(useHref(use), base); } catch { continue; }
			const id = decodeURIComponent(url.hash.slice(1)), key = url.href; url.hash = "";
			const target = svgDocuments.get(url.href)?.getElementById(id);
			if (!target || seen.has(key)) {
				warnings.add("SVG: не удалось встроить <use> " + key); continue;
			}
			const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
			for (const attr of use.attributes) if (!["href", "xlink:href", "x", "y", "width", "height"].includes(attr.name)) group.setAttribute(attr.name, attr.value);
			const offset = document.createElementNS("http://www.w3.org/2000/svg", "g");
			offset.setAttribute("transform", `translate(${parseFloat(use.getAttribute("x")) || 0} ${parseFloat(use.getAttribute("y")) || 0})`);
			let content;
			if (["symbol", "svg"].includes(target.localName)) {
				content = document.createElementNS("http://www.w3.org/2000/svg", "svg");
				for (const attr of target.attributes) if (!["id", "width", "height", "x", "y"].includes(attr.name)) content.setAttribute(attr.name, attr.value);
				content.setAttribute("width", use.getAttribute("width") || "100%");
				content.setAttribute("height", use.getAttribute("height") || "100%");
				for (const child of target.childNodes) content.appendChild(child.cloneNode(true));
			} else content = target.cloneNode(true);
			inlineSvgUses(content, url.href, new Set([...seen, key]));
			offset.appendChild(content); group.appendChild(offset); use.replaceWith(group);
		}
	}
	const round = (v) => Math.round(v * 100) / 100;
	const n = (v) => parseFloat(v) || 0;
	function take(node) {
		count++;
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
		if (["sans-serif", "system-ui"].includes(family)) family = "Inter";
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
			return take({ type: "text", name: content.slice(0, 60), text: content, ...style, noWrap: true, x: round(l.x - origin.x), y: round(l.y - origin.y - (style.lineHeight - l.height) / 2), w: round(l.right - l.x + 1), h: round(style.lineHeight) });
		});
	}
	function createsStack(c) {
		return c.opacity !== "1" || c.transform !== "none" || c.filter !== "none" || c.isolation === "isolate" || c.mixBlendMode !== "normal" || c.position === "fixed" || c.position === "sticky" || c.perspective !== "none" || /(?:paint|layout|strict|content)/.test(c.contain) || /(?:transform|opacity|filter)/.test(c.willChange);
	}
	function layerInfo(el, c) {
		const flexGrid = el.parentElement && /flex|grid/.test(getComputedStyle(el.parentElement).display);
		const positioned = c.position !== "static";
		const explicitZ = (positioned || flexGrid) && c.zIndex !== "auto";
		const z = explicitZ ? n(c.zIndex) : 0;
		const stack = Boolean(explicitZ || createsStack(c));
		return { z, stack, positioned, phase: z < 0 ? -1 : z > 0 ? 2 : positioned || stack ? 1 : 0 };
	}
	function trackLayer(node, el, c) {
		cssLayers.set(node, { ...layerInfo(el, c), element: el, style: c });
		return node;
	}
	function paintChildren(el, parentStyle) {
		const flexGrid = /flex|grid/.test(parentStyle.display);
		return [...el.childNodes].map((child, index) => {
			if (child.nodeType !== 1) return { child, index, phase: 0, z: 0, order: 0 };
			const c = getComputedStyle(child);
			const positioned = c.position !== "static";
			const z = (positioned || flexGrid) && c.zIndex !== "auto" ? n(c.zIndex) : 0;
			const phase = z < 0 ? -1 : z > 0 ? 2 : positioned || createsStack(c) || (flexGrid && c.zIndex !== "auto") ? 1 : 0;
			return { child, index, phase, z, order: flexGrid ? n(c.order) : 0 };
		}).sort((a, b) => a.phase - b.phase || a.z - b.z || a.order - b.order || a.index - b.index).map((entry) => entry.child);
	}
	function walk(el, origin, depth = 0, clip = null) {
		if (skip.has(el.tagName)) return [];
		const c = getComputedStyle(el);
		if (c.display === "none" || c.contentVisibility === "hidden" || n(c.opacity) === 0) return [];
		const b = el.getBoundingClientRect();
		const outsideClip = clip && (b.right <= clip.left || b.left >= clip.right || b.bottom <= clip.top || b.top >= clip.bottom);
		const clipsX = ["hidden", "clip", "scroll", "auto"].includes(c.overflowX), clipsY = ["hidden", "clip", "scroll", "auto"].includes(c.overflowY);
		const childClip = { left: Math.max(clip?.left ?? -Infinity, clipsX ? b.left : -Infinity), right: Math.min(clip?.right ?? Infinity, clipsX ? b.right : Infinity), top: Math.max(clip?.top ?? -Infinity, clipsY ? b.top : -Infinity), bottom: Math.min(clip?.bottom ?? Infinity, clipsY ? b.bottom : Infinity) };
		if (c.display === "contents" || (!b.width && !b.height)) {
			return [...el.childNodes].flatMap((ch) => ch.nodeType === 1 ? walk(ch, origin, depth + 1, clip) : ch.nodeType === 3 ? textNodes(ch, el, origin) : []);
		}
		const label = pseudoLabels.get(el) || el.getAttribute("aria-label") || el.id || el.tagName.toLowerCase() + (el.classList.length ? "." + [...el.classList].slice(0, 2).join(".") : "");
		const box = { name: label.slice(0, 100), x: round(b.x - origin.x), y: round(b.y - origin.y), w: round(Math.max(0.01, b.width)), h: round(Math.max(0.01, b.height)) };
		if (["IMG", "CANVAS", "VIDEO", "IFRAME", "SELECT"].includes(el.tagName)) {
			if (c.visibility !== "visible" || outsideClip || b.width <= 0 || b.height <= 0) return [];
			const index = assets.length;
			const node = take({ type: "image", ...box, fit: "fill", captureIndex: index, captureSize: { w: box.w, h: box.h } });
			if (el.tagName === "IMG") {
				const styles = {};
				for (const key of ["objectFit", "objectPosition", "borderRadius", "filter", "backgroundColor", "borderTop", "borderRight", "borderBottom", "borderLeft", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]) styles[key] = c[key];
				node.captureImage = { src: el.currentSrc || el.src, styles };
				node.opacity = n(c.opacity);
			}
			if (el.tagName === "SELECT") {
				node.captureControl = { styles: Object.fromEntries([...c].map((key) => [key, c.getPropertyValue(key)])), options: [...el.options].map((option) => ({ text: option.text, value: option.value, selected: option.selected, disabled: option.disabled })), multiple: el.multiple, disabled: el.disabled, size: el.size };
				node.opacity = n(c.opacity);
				warnings.add("Нативные select перенесены изображениями вместе с системной стрелкой.");
			}
			el.setAttribute(captureKey, String(index));
			assets.push({ index, node });
			if (el.tagName === "IFRAME") warnings.add("iframe, включая капчу, перенесены изображениями текущего состояния.");
			if (["CANVAS", "VIDEO"].includes(el.tagName)) warnings.add("Canvas и видео перенесены изображениями текущего состояния.");
			return [trackLayer(node, el, c)];
		}
		if (el.tagName.toLowerCase() === "svg") {
			if (c.visibility !== "visible" || outsideClip || b.width <= 0 || b.height <= 0) return [];
			const clone = el.cloneNode(true);
			const originals = [el, ...el.querySelectorAll("*")];
			const copies = [clone, ...clone.querySelectorAll("*")];
			originals.forEach((o, i) => {
				const s = getComputedStyle(o);
				for (const key of ["fill", "stroke", "stroke-width", "opacity", "fill-rule", "stroke-linecap", "stroke-linejoin", "color"])
					copies[i].style.setProperty(key, s.getPropertyValue(key));
			});
			clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
			// CSS dimensions are absent from outerHTML. Resolve them before Figma
			// imports viewBox; resizing its frame afterwards does not scale paths.
			clone.setAttribute("width", String(box.w));
			clone.setAttribute("height", String(box.h));
			clone.style.setProperty("width", `${box.w}px`);
			clone.style.setProperty("height", `${box.h}px`);
			inlineSvgUses(clone, document.baseURI);
			return [trackLayer(take({ type: "icon", ...box, svg: clone.outerHTML }), el, c)];
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
			if (c.backgroundImage !== "none" && !outsideClip && b.width > 0 && b.height > 0) {
				const index = assets.length;
				el.setAttribute(captureKey, String(index));
				const backgroundStyles = {};
				for (const key of ["backgroundImage", "backgroundColor", "backgroundSize", "backgroundPosition", "backgroundRepeat", "backgroundOrigin", "backgroundClip", "backgroundBlendMode", "backgroundAttachment", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "borderRadius", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"])
					backgroundStyles[key] = c[key];
				backgroundStyles.borderStyle = "solid";
				backgroundStyles.borderColor = "transparent";
				const background = take({ type: "image", name: "Background", x: 0, y: 0, w: box.w, h: box.h, fit: "fill", captureIndex: index, captureBackground: backgroundStyles, captureSize: { w: box.w, h: box.h } });
				cssLayers.set(background, { phase: -2, z: 0 });
				assets.push({ index });
				node.children.push(background);
				node.fill = "#00000000"; // цвет уже в изолированном фоне; альфу нельзя накладывать дважды
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
				if (p.content !== "none" && p.content !== "normal") warnings.add("Потоковые/сложные псевдоэлементы ::before/::after пока не перенесены; абсолютные перенесены отдельными слоями.");
			}
		}
		for (const ch of paintChildren(el, c)) {
			if (ch.nodeType === 1) node.children.push(...walk(ch, b, depth + 1, childClip));
			if (ch.nodeType === 3) node.children.push(...textNodes(ch, el, b));
		}
		if (el.shadowRoot) {
			for (const ch of el.shadowRoot.children) node.children.push(...walk(ch, b, depth + 1, childClip));
			warnings.add("Открытый Shadow DOM перенесён; slots и закрытые shadow roots могут отличаться.");
		}
		if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) {
			const value = el.tagName === "SELECT" ? el.selectedOptions[0]?.text : el.value || el.getAttribute("placeholder");
			if (value && el.type !== "password") node.children.push(take({ type: "text", name: "Value", text: value, ...font(c), x: n(c.borderLeftWidth) + n(c.paddingLeft), y: n(c.borderTopWidth) + n(c.paddingTop), w: Math.max(1, b.width - n(c.paddingLeft) - n(c.paddingRight)) }));
			warnings.add("Поля форм перенесены как слои; нативные checkbox/radio/select могут отличаться.");
		}
		return [trackLayer(node, el, c)];
	}
	function stackingTree(spec) {
		// DOM-контейнер без stacking context не удерживает z-index потомков.
		// В Figma любая группа атомарна: такие слои поднимаем в ближайший
		// настоящий контекст, пересчитывая только относительные координаты.
		const records = new Map();
		let sequence = 0;
		function collect(node, parent, context, x, y) {
			const info = cssLayers.get(node) || { phase: 0, z: 0 };
			const absoluteX = x + (node.x || 0);
			const absoluteY = y + (node.y || 0);
			const target = parent && (info.positioned || info.stack) ? context : parent;
			records.set(node, { parent, target, x: absoluteX, y: absoluteY, sequence: sequence++, info });
			// Сохраняем clipping, иначе поднятый слой вышел бы за CSS overflow.
			const nextContext = !parent || info.stack || node.clip ? node : context;
			if (node.clip && !info.stack && parent) warnings.add("Overflow-контейнер сохраняет обрезку; сложные перекрытия через его границы могут отличаться.");
			for (const child of node.children || []) collect(child, node, nextContext, absoluteX, absoluteY);
		}
		collect(spec, null, spec, 0, 0);
		for (const [node, record] of records) {
			if (!record.parent || record.target === record.parent) continue;
			record.parent.children = record.parent.children.filter((child) => child !== node);
			record.target.children.push(node);
			const origin = records.get(record.target);
			node.x = round(record.x - origin.x);
			node.y = round(record.y - origin.y);
		}
		for (const node of records.keys()) if (node.children) node.children.sort((a, b) => {
			const aa = records.get(a), bb = records.get(b);
			return aa.info.phase - bb.info.phase || aa.info.z - bb.info.z || aa.sequence - bb.sequence;
		});
		return spec;
	}
	function inferLayouts(spec) {
		const report = { flex: 0, grid: 0, text: 0, fallback: 0 };
		const authored = (el, key, fallback) => { try { return el.computedStyleMap().get(key)?.toString() || fallback; } catch { return fallback; } };
		const padding = (c) => [n(c.paddingTop) + n(c.borderTopWidth), n(c.paddingRight) + n(c.borderRightWidth), n(c.paddingBottom) + n(c.borderBottomWidth), n(c.paddingLeft) + n(c.borderLeftWidth)];
		const axisAlign = (value) => ({ "flex-start": "start", start: "start", left: "start", normal: "start", stretch: "start", "flex-end": "end", end: "end", right: "end", center: "center", "space-between": "space-between", baseline: "baseline" })[value];
		const gapPx = (value, size) => value.endsWith("%") ? n(value) * size / 100 : n(value);
		function fallback(node, reason) { report.fallback++; warnings.add(`Auto-layout: ${reason}; такие контейнеры сохранены с координатами.`); }
		function margins(child) {
			const info = cssLayers.get(child);
			if (!info?.style) return [0, 0, 0, 0];
			const c = info.style;
			return [n(c.marginTop), n(c.marginRight), n(c.marginBottom), n(c.marginLeft)];
		}
		function wrapMargin(child, margin) {
			if (!margin.some(Boolean)) return child;
			const c = cssLayers.get(child)?.element.getBoundingClientRect();
			const outer = take({ type: "frame", name: `${child.name} / margin`, layout: "vertical", fill: "#00000000", w: c.width + margin[1] + margin[3], h: child.h === "hug" ? "hug" : c.height + margin[0] + margin[2], padding: margin, children: [child] });
			delete child.x; delete child.y;
			return outer;
		}
		function absoluteChildren(node, flow) {
			for (const child of node.children) if (!flow.includes(child)) {
				child.position = "absolute";
				if (child.name === "Background") child.constraints = { horizontal: "STRETCH", vertical: "STRETCH" };
			}
		}
		function trackTokens(value) {
			const out = []; let token = "", depth = 0;
			for (const ch of value.replace(/\[[^\]]*\]/g, " ")) {
				if (ch === "(") depth++; if (ch === ")") depth--;
				if (/\s/.test(ch) && !depth) { if (token) out.push(token); token = ""; } else token += ch;
			}
			if (token) out.push(token);
			return out;
		}
		function expandTracks(value, count) {
			return trackTokens(value).flatMap((token) => {
				const repeat = token.match(/^repeat\(([^,]+),\s*(.*)\)$/);
				if (!repeat) return [token];
				const group = trackTokens(repeat[2]);
				const times = /^\d+$/.test(repeat[1].trim()) ? Number(repeat[1]) : Math.ceil(count / group.length);
				return Array.from({ length: Math.min(100, times) }, () => group).flat();
			});
		}
		function tracks(used, raw, available, gap, autoRows = false) {
			const pixels = trackTokens(used).map((v) => /^[-\d.]+px$/.test(v) ? n(v) : NaN);
			if (!pixels.length || pixels.length > 100 || pixels.some((v) => !Number.isFinite(v) || v <= 0)) return null;
			const tokens = raw === "none" ? [] : expandTracks(raw, pixels.length);
			const weights = pixels.map((_, i) => n(tokens[i]?.match(/([\d.]+)fr\s*\)?$/)?.[1] || "0"));
			const fixed = pixels.reduce((sum, value, i) => sum + (weights[i] ? 0 : value), 0);
			const total = weights.reduce((a, b) => a + b, 0);
			const flexible = available - gap * (pixels.length - 1) - fixed;
			const exact = !total || weights.every((weight, i) => !weight || Math.abs(flexible * weight / total - pixels[i]) <= 1);
			return { pixels, specs: pixels.map((value, i) => weights[i] && exact ? { type: "flex", value: weights[i] } : autoRows && (!tokens[i] || tokens[i] === "auto" || tokens[i] === "max-content") ? { type: "hug" } : { type: "fixed", value }) };
		}
		function lineIndex(value, count) { return /^-?\d+$/.test(value) ? Number(value) > 0 ? Number(value) - 1 : count + 1 + Number(value) : null; }
		function areaMap(value) {
			const map = new Map();
			[...value.matchAll(/"([^"]*)"/g)].forEach((match, row) => match[1].trim().split(/\s+/).forEach((name, column) => {
				if (/^\.+$/.test(name)) return;
				const area = map.get(name) || { row, column, rowSpan: 1, columnSpan: 1 };
				area.rowSpan = row - area.row + 1; area.columnSpan = column - area.column + 1; map.set(name, area);
			}));
			return map;
		}
		function gridAxis(start, end, sizes, gap, origin, actual, length, align, before, after, stretch, areaStart, areaSpan) {
			const explicit = areaStart ?? lineIndex(start, sizes.length);
			const endIndex = lineIndex(end, sizes.length);
			const span = areaSpan ?? (n((start + " " + end).match(/span\s+(\d+)/)?.[1]) || (explicit !== null && explicit !== undefined && endIndex !== null ? endIndex - explicit : 1));
			if (span < 1 || span > sizes.length) return null;
			let cursor = origin, best = null;
			for (let index = 0; index + span <= sizes.length; index++) {
				const size = sizes.slice(index, index + span).reduce((a, b) => a + b, 0) + gap * (span - 1);
				if (explicit === null || explicit === undefined || explicit === index) {
					const expected = align === "center" ? cursor + before + (size - before - after - length) / 2 : align === "end" ? cursor + size - after - length : cursor + before;
					const error = Math.abs(expected - actual) + (stretch ? Math.abs(size - before - after - length) : 0);
					if (!best || error < best.error) best = { index, span, error };
				}
				cursor += sizes[index] + gap;
			}
			return best && best.error <= 2 ? best : null;
		}
		function visit(node) {
			for (const child of node.children || []) visit(child);
			const info = cssLayers.get(node);
			if (node.type !== "frame" || !info?.element) return;
			const { element: el, style: c } = info;
			const box = el.getBoundingClientRect(), p = padding(c);
			const heightAuto = authored(el, "height", c.height) === "auto";
			const texts = node.children.filter((child) => child.type === "text");
			const hasRenderedChildren = [...el.children].some((child) => getComputedStyle(child).display !== "none");
			if (!hasRenderedChildren && texts.length && !c.whiteSpace.startsWith("pre") && !/flex|grid/.test(c.display) && !c.display.startsWith("inline") && c.transform === "none") {
				const first = texts[0];
				const lineYs = [...new Set(texts.map((text) => Math.round(text.y)))];
				const textWidth = Math.max(...texts.map((text) => text.x + text.w)) - Math.min(...texts.map((text) => text.x));
				let content = el.innerText.replace(/\s+/g, " ").trim();
				if (c.textTransform === "uppercase") content = content.toUpperCase();
				if (c.textTransform === "lowercase") content = content.toLowerCase();
				first.text = content; first.h = "hug"; first.align = ["center", "right"].includes(c.textAlign) ? c.textAlign : "left";
				delete first.noWrap; // merged paragraphs must reflow within their full container
				node.children = node.children.filter((child) => child.type !== "text" || child === first);
				if (!/flex|grid/.test(c.display) && !c.display.startsWith("inline") && c.transform === "none") {
					node.layout = "vertical"; node.padding = p; node.gap = 0;
					if (heightAuto && Math.abs(box.height - (lineYs.length * first.lineHeight + p[0] + p[2])) <= 3) node.h = "hug";
					// Intrinsic single-line labels must not wrap because Chromium and
					// Figma round glyph advances differently. Keep wider paragraph
					// boxes flexible so their text still reflows on resize.
					const intrinsicLine = lineYs.length === 1 && (c.whiteSpace === "nowrap" || Math.abs(box.width - p[1] - p[3] - textWidth) <= 2);
					first.w = intrinsicLine ? "hug" : "fill";
					if (intrinsicLine) node.cross = first.align === "right" ? "end" : first.align === "center" ? "center" : "start";
					delete first.x; delete first.y;
					absoluteChildren(node, [first]); report.text++; return;
				}
			}
			if (!/flex|grid/.test(c.display)) return;
			if (c.writingMode !== "horizontal-tb" || c.direction !== "ltr" || c.transform !== "none") return fallback(node, "writing-mode/RTL/transform");
			const flow = node.children.filter((child) => {
				const childInfo = cssLayers.get(child);
				return childInfo?.element && childInfo.style ? childInfo.element.parentElement === el && !["absolute", "fixed"].includes(childInfo.style.position) : child.type === "text";
			});
			const expected = [...el.children].filter((child) => !skip.has(child.tagName) && !["absolute", "fixed"].includes(getComputedStyle(child).position) && getComputedStyle(child).display !== "none");
			if (!flow.length || expected.some((child) => !flow.some((item) => cssLayers.get(item)?.element === child))) return fallback(node, "поток изменён CSS stacking context или display:contents");
			if (flow.filter((child) => child.type === "text").length > 1) return fallback(node, "анонимный текстовый блок с переносами сохранён по строкам");
			if (flow.some((child) => margins(child).some((v) => v < 0))) return fallback(node, "отрицательные margin");
			if (flow.some((child) => { const e = cssLayers.get(child)?.element; return e && ["top", "right", "bottom", "left"].some((side) => authored(e, `margin-${side}`, "0") === "auto"); })) return fallback(node, "автоматические margin");
			const innerW = box.width - p[1] - p[3], innerH = box.height - p[0] - p[2];
			if (c.display.includes("flex")) {
				const horizontal = c.flexDirection.startsWith("row"), reversed = c.flexDirection.endsWith("reverse");
				let align = axisAlign(c.justifyContent), cross = axisAlign(c.alignItems);
				if (!align || !cross || c.flexWrap === "wrap-reverse" || (!horizontal && c.flexWrap !== "nowrap")) return fallback(node, "направление/выравнивание Flex не представимо точно");
				const selfs = flow.map((child) => cssLayers.get(child)?.style.alignSelf || "auto");
				if (selfs.every((value) => value !== "auto" && value === selfs[0])) cross = axisAlign(selfs[0]);
				else if (selfs.some((value) => value !== "auto" && value !== "stretch" && axisAlign(value) !== cross)) return fallback(node, "различающийся align-self Flex-элементов");
				if (!cross) return fallback(node, "align-self Flex");
				if (reversed && (align === "start" || align === "end")) align = align === "start" ? "end" : "start";
				const ordered = flow.slice().sort((a, b) => n(cssLayers.get(a)?.style.order || "0") - n(cssLayers.get(b)?.style.order || "0"));
				if (reversed) ordered.reverse();
				const sizes = ordered.map((child) => cssLayers.get(child)?.element.getBoundingClientRect());
				if (sizes.some((r, i) => i && r && sizes[i - 1] && (horizontal ? r.x < sizes[i - 1].right - 1 && Math.abs(r.y - sizes[i - 1].y) < 1 : r.y < sizes[i - 1].bottom - 1))) return fallback(node, "перекрывающиеся Flex-элементы");
				node.layout = horizontal ? "horizontal" : "vertical"; node.padding = p; node.align = align; node.cross = cross;
				node.gap = gapPx(horizontal ? c.columnGap : c.rowGap, horizontal ? innerW : innerH);
				if (horizontal && c.flexWrap === "wrap") { node.wrap = true; node.rowGap = gapPx(c.rowGap, innerH); }
				if (reversed && node.children.length === flow.length) node.reverseZIndex = true;
				if (heightAuto) node.h = "hug";
				const grows = ordered.map((child) => n(cssLayers.get(child)?.style.flexGrow || "0")).filter(Boolean);
				const equalGrow = grows.every((v) => Math.abs(v - grows[0]) < .001);
				if (!equalGrow) warnings.add("Flex: неодинаковые flex-grow сохранены фиксированными размерами детей.");
				const replacements = new Map();
				for (const child of ordered) {
					const childInfo = cssLayers.get(child), s = childInfo?.style;
					const outer = wrapMargin(child, margins(child));
					const main = horizontal ? "w" : "h", counter = horizontal ? "h" : "w";
					if (s && n(s.flexGrow) > 0 && equalGrow && !(main === "h" && node.h === "hug")) { outer[main] = "fill"; if (outer !== child) child[main] = "fill"; }
					const self = s?.alignSelf && s.alignSelf !== "auto" ? s.alignSelf : c.alignItems;
					// Replaced content keeps its intrinsic viewport/aspect ratio. A
					// Figma FILL frame would stretch the box without scaling SVG paths.
					const replaced = child.type === "icon" || child.type === "image";
					if (["normal", "stretch"].includes(self) && counter === "h" && node.h === "hug" && childInfo) outer.h = childInfo.element.getBoundingClientRect().height;
					if (!replaced && ["normal", "stretch"].includes(self) && (counter !== "h" || node.h !== "hug") && (!s || authored(childInfo.element, counter === "w" ? "width" : "height", "auto") === "auto")) { outer[counter] = "fill"; if (outer !== child) child[counter] = "fill"; }
					delete outer.x; delete outer.y; replacements.set(child, outer);
				}
				absoluteChildren(node, flow);
				let index = 0;
				node.children = node.children.map((child) => flow.includes(child) ? replacements.get(ordered[index++]) : child);
				report.flex++; return;
			}
			const colGap = gapPx(c.columnGap, innerW), rowGap = gapPx(c.rowGap, innerH);
			const cols = tracks(c.gridTemplateColumns, authored(el, "grid-template-columns", c.gridTemplateColumns), innerW, colGap);
			const rows = tracks(c.gridTemplateRows, authored(el, "grid-template-rows", c.gridTemplateRows), innerH, rowGap, true);
			if (!cols || !rows || !["normal", "stretch", "start", "flex-start"].includes(c.justifyContent) || !["normal", "stretch", "start", "flex-start"].includes(c.alignContent)) return fallback(node, "сложные треки/выравнивание Grid");
			const areas = areaMap(c.gridTemplateAreas), cells = [], occupied = new Set();
			for (const child of flow) {
				const childInfo = cssLayers.get(child);
				if (!childInfo || margins(child).some(Boolean)) return fallback(node, "анонимный Grid-элемент или margin");
				const s = childInfo.style, r = childInfo.element.getBoundingClientRect();
				const area = areas.get(s.gridRowStart) || areas.get(s.gridColumnStart);
				const ha = s.justifySelf === "auto" ? c.justifyItems : s.justifySelf, va = s.alignSelf === "auto" ? c.alignItems : s.alignSelf;
				const hAlign = axisAlign(ha), vAlign = axisAlign(va);
				if (!["start", "center", "end"].includes(hAlign) || !["start", "center", "end"].includes(vAlign)) return fallback(node, "выравнивание Grid-ячейки");
				const stretchW = ["normal", "stretch"].includes(ha) && authored(childInfo.element, "width", s.width) === "auto";
				const stretchH = ["normal", "stretch"].includes(va) && authored(childInfo.element, "height", s.height) === "auto";
				const col = gridAxis(s.gridColumnStart, s.gridColumnEnd, cols.pixels, colGap, box.x + p[3], r.x, r.width, hAlign, 0, 0, stretchW, area?.column, area?.columnSpan);
				const row = gridAxis(s.gridRowStart, s.gridRowEnd, rows.pixels, rowGap, box.y + p[0], r.y, r.height, vAlign, 0, 0, stretchH, area?.row, area?.rowSpan);
				if (!col || !row) return fallback(node, "расположение Grid-ячейки не совпало с треками");
				for (let rr = row.index; rr < row.index + row.span; rr++) for (let cc = col.index; cc < col.index + col.span; cc++) {
					const key = `${rr}:${cc}`; if (occupied.has(key)) return fallback(node, "перекрывающиеся Grid-ячейки"); occupied.add(key);
				}
				cells.push({ child, row, col, hAlign, vAlign, stretchW, stretchH });
			}
			node.layout = "grid"; node.padding = p; node.grid = { columns: cols.specs, rows: rows.specs, columnGap: colGap, rowGap };
			if (heightAuto && rows.specs.every((track) => track.type === "hug")) node.h = "hug";
			absoluteChildren(node, flow);
			for (const { child, row, col, hAlign, vAlign, stretchW, stretchH } of cells) {
				child.gridCell = { row: row.index, column: col.index, rowSpan: row.span, columnSpan: col.span, horizontalAlign: hAlign, verticalAlign: vAlign };
				if (stretchW) child.w = "fill";
				if (stretchH && rows.specs.slice(row.index, row.index + row.span).every((track) => track.type !== "hug")) child.h = "fill";
				delete child.x; delete child.y;
			}
			report.grid++;
		}
		visit(spec);
		return report;
	}
	// Replace out-of-flow generated boxes with styled elements in this isolated
	// page. Chromium resolves their containing block, percentages and transforms;
	// the regular importer then preserves their paint order and background alpha.
	const pseudoLabels = new WeakMap();
	const generated = [], suppress = [];
	for (const el of [root, ...root.querySelectorAll("*")]) {
		if (skip.has(el.tagName) || el.namespaceURI !== "http://www.w3.org/1999/xhtml") continue;
		for (const kind of ["before", "after"]) {
			const c = getComputedStyle(el, `::${kind}`);
			if (["none", "normal"].includes(c.content) || c.display === "none" || !["absolute", "fixed"].includes(c.position)) continue;
			if (!/^("[^"\\\\]*"|'[^'\\\\]*')$/.test(c.content)) continue;
			const child = document.createElement("vivi-pseudo");
			for (const key of c) child.style.setProperty(key, c.getPropertyValue(key), "important");
			child.textContent = c.content.slice(1, -1);
			child.style.setProperty("content", "normal", "important");
			pseudoLabels.set(child, `::${kind}`);
			const marker = `${captureKey}-pseudo-${generated.length}`;
			el.setAttribute(marker, "");
			suppress.push(`[${marker}]::${kind}{content:none!important}`);
			generated.push({ el, child, kind });
		}
	}
	if (generated.length) {
		const style = document.createElement("style");
		style.textContent = suppress.join("\n") + "\nvivi-pseudo::before,vivi-pseudo::after{content:none!important}";
		document.head.appendChild(style);
		for (const { el, child, kind } of generated) {
			if (kind === "before") el.prepend(child); else el.append(child);
		}
	}
	const rootBox = root.getBoundingClientRect();
	const nodes = walk(root, { x: rootBox.x, y: rootBox.y });
	let spec;
	if (nodes.length === 1 && nodes[0].type === "frame") spec = nodes[0];
	else spec = take({ type: "frame", layout: "none", x: 0, y: 0, w: Math.max(1, rootBox.width), h: Math.max(1, rootBox.height), fill: "#00000000", children: nodes });
	stackingTree(spec);
	const layout = autoLayout ? inferLayouts(spec) : { flex: 0, grid: 0, text: 0, fallback: 0 };
	if (!selector) {
		// A plain body is only a DOM wrapper: put its children directly in the
		// page frame, retaining the document offset (including default margins).
		const doc = document.documentElement;
		const bg = getComputedStyle(doc).backgroundColor;
		const dx = round(rootBox.x + scrollX), dy = round(rootBox.y + scrollY);
		const htmlFill = color(bg), bodyFill = spec.fill;
		const plainBody = spec.layout === "none" && !spec.clip && (spec.opacity ?? 1) === 1 && !spec.shadow && !spec.stroke && !spec.rotation && !(spec.radius || []).some(Boolean) && getComputedStyle(root).transform === "none" && !createsStack(getComputedStyle(root));
		let children;
		let fill = htmlFill === "#00000000" ? "#FFFFFFFF" : htmlFill;
		if (plainBody) {
			children = (spec.children || []).map((child) => ({ ...child, x: round((child.x || 0) + dx), y: round((child.y || 0) + dy) }));
			if (htmlFill === "#00000000" && bodyFill !== "#00000000") fill = bodyFill;
			else if (bodyFill !== "#00000000") children.unshift({ ...spec, name: "Page background", x: dx, y: dy, children: [] });
		} else {
			// Keep layout/effect boundaries that cannot be flattened faithfully.
			children = [{ ...spec, x: dx, y: dy }];
		}
		spec = take({ type: "frame", layout: "none", w: innerWidth, h: Math.max(innerHeight, doc.scrollHeight), fill, clip: true, children });
	}
	spec.name = name || (selector ? selector : document.title || "HTML import");
	delete spec.x;
	delete spec.y;
	count = 0;
	(function recount(node) { count++; for (const child of node.children || []) recount(child); })(spec);
	if (maxNodes !== undefined && count > maxNodes) throw new Error(`HTML: больше ${maxNodes} слоёв — задан maxNodes (итог ${count})`);
	return JSON.stringify({ spec, count, layout, warnings: [...warnings] });
}
