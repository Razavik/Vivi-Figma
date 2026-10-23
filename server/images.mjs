// Фото для image-нод. Плагин Figma в сеть не ходит, поэтому сервер ищет
// стоковое фото по "query" и отдаёт байты — плагин кладёт их в заливку.
// Провайдер по приоритету: Pexels (PEXELS_API_KEY) → Unsplash
// (UNSPLASH_ACCESS_KEY) → Pixabay (PIXABAY_API_KEY) → Openverse
// (CC-агрегатор, без ключа) → LoremFlickr (без ключа, фото с Flickr по
// ключевым словам) → Picsum (случайное фото — предмет не совпадёт, но
// блок не останется серым). Если ничего не нашлось — плейсхолдер.

const MAX_BYTES = 4 * 1024 * 1024;
const UA = { "User-Agent": "figma-agent/1.0" };

async function download(url, headers) {
	const res = await fetch(url, {
		headers: { ...UA, ...headers },
		signal: AbortSignal.timeout(15000),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const buf = Buffer.from(await res.arrayBuffer());
	if (!buf.length || buf.length > MAX_BYTES) throw new Error("bad size");
	let mime = (res.headers.get("content-type") || "").split(";")[0].trim();
	if (!mime.startsWith("image/")) mime = "image/jpeg";
	return { data: buf.toString("base64"), mime };
}

async function pexels(query, seed) {
	const key = process.env.PEXELS_API_KEY;
	if (!key) return null;
	const res = await fetch(
		`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15`,
		{ headers: { Authorization: key }, signal: AbortSignal.timeout(10000) },
	);
	if (!res.ok) return null;
	const photos = (await res.json().catch(() => null))?.photos;
	if (!Array.isArray(photos) || !photos.length) return null;
	const p = photos[seed % photos.length];
	return download(p.src?.large2x || p.src?.large || p.src?.original);
}

// Unsplash: ключ — Access Key приложения с unsplash.com/developers
// (демо-доступ ~50 запросов/час, выдаётся сразу после регистрации).
async function unsplash(query, seed) {
	const key = process.env.UNSPLASH_ACCESS_KEY;
	if (!key) return null;
	const res = await fetch(
		`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=15&content_filter=high`,
		{
			headers: { Authorization: `Client-ID ${key}` },
			signal: AbortSignal.timeout(10000),
		},
	);
	if (!res.ok) return null;
	const results = (await res.json().catch(() => null))?.results;
	if (!Array.isArray(results) || !results.length) return null;
	const r = results[seed % results.length];
	return download(r.urls?.regular || r.urls?.small || r.urls?.full);
}

async function pixabay(query, seed) {
	const key = process.env.PIXABAY_API_KEY;
	if (!key) return null;
	const res = await fetch(
		`https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&image_type=photo&safesearch=true&per_page=15`,
		{ signal: AbortSignal.timeout(10000) },
	);
	if (!res.ok) return null;
	const hits = (await res.json().catch(() => null))?.hits;
	if (!Array.isArray(hits) || !hits.length) return null;
	const h = hits[seed % hits.length];
	return download(h.largeImageURL || h.webformatURL);
}

// Openverse — агрегатор открытых фото (Flickr, Wikimedia и др.),
// анонимно и без ключа. Оригинал может не отдаваться с домена хостера —
// тогда берём проксированный thumbnail (~600px).
async function openverse(query, seed) {
	const res = await fetch(
		`https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=15&license_type=all`,
		{ headers: UA, signal: AbortSignal.timeout(10000) },
	);
	if (!res.ok) return null;
	const results = (await res.json().catch(() => null))?.results;
	if (!Array.isArray(results) || !results.length) return null;
	const r = results[seed % results.length];
	if (r.url) {
		try {
			return await download(r.url, { Referer: r.foreign_landing_url });
		} catch {
			/* хостер не отдал — пробуем thumbnail */
		}
	}
	return r.thumbnail ? download(r.thumbnail) : null;
}

// Без ключа: loremflickr отдаёт фото с Flickr по ключевым словам,
// "?lock=N" фиксирует выбор, чтобы одинаковые запросы не повторялись.
async function loremflickr(query, w, h, seed) {
	const kw =
		String(query)
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, " ")
			.trim()
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 3)
			.join(",") || "abstract";
	const width = Math.min(Math.max(Math.round(w) || 800, 200), 1200);
	const height = Math.min(Math.max(Math.round(h) || 600, 200), 1200);
	return download(
		`https://loremflickr.com/${width}/${height}/${kw}?lock=${seed + 1}`,
	);
}

// Последний резерв: стабильное случайное фото, сид — от запроса.
function picsum(query, w, h, seed) {
	const width = Math.min(Math.max(Math.round(w) || 800, 200), 1200);
	const height = Math.min(Math.max(Math.round(h) || 600, 200), 1200);
	let hash = seed + 1;
	for (const ch of String(query)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
	return download(`https://picsum.photos/seed/${hash}/${width}/${height}`);
}

// Списки кандидатов для инструмента "photos": каждая функция отдаёт
// [{thumb, full}] — url превью для показа модели и полный вариант.
async function pexelsList(query) {
	const key = process.env.PEXELS_API_KEY;
	if (!key) return null;
	const res = await fetch(
		`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15`,
		{ headers: { Authorization: key }, signal: AbortSignal.timeout(10000) },
	);
	if (!res.ok) return null;
	const photos = (await res.json().catch(() => null))?.photos;
	if (!Array.isArray(photos) || !photos.length) return null;
	return photos.map((p) => ({
		thumb: p.src?.medium || p.src?.small,
		full: p.src?.large2x || p.src?.large || p.src?.original,
	}));
}

async function unsplashList(query) {
	const key = process.env.UNSPLASH_ACCESS_KEY;
	if (!key) return null;
	const res = await fetch(
		`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=15&content_filter=high`,
		{
			headers: { Authorization: `Client-ID ${key}` },
			signal: AbortSignal.timeout(10000),
		},
	);
	if (!res.ok) return null;
	const results = (await res.json().catch(() => null))?.results;
	if (!Array.isArray(results) || !results.length) return null;
	return results.map((r) => ({
		thumb: r.urls?.small || r.urls?.thumb,
		full: r.urls?.regular || r.urls?.full,
	}));
}

async function pixabayList(query) {
	const key = process.env.PIXABAY_API_KEY;
	if (!key) return null;
	const res = await fetch(
		`https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&image_type=photo&safesearch=true&per_page=15`,
		{ signal: AbortSignal.timeout(10000) },
	);
	if (!res.ok) return null;
	const hits = (await res.json().catch(() => null))?.hits;
	if (!Array.isArray(hits) || !hits.length) return null;
	return hits.map((h) => ({
		thumb: h.webformatURL,
		full: h.largeImageURL || h.webformatURL,
	}));
}

async function openverseList(query) {
	const res = await fetch(
		`https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=15&license_type=all`,
		{ headers: UA, signal: AbortSignal.timeout(10000) },
	);
	if (!res.ok) return null;
	const results = (await res.json().catch(() => null))?.results;
	if (!Array.isArray(results) || !results.length) return null;
	return results.map((r) => ({ thumb: r.thumbnail || r.url, full: r.url }));
}

// Инструмент "photos": первый работающий провайдер отдаёт список,
// у топ-N скачиваем превью. Возвращает [{thumb:{data,mime}, url}] —
// url потом скачивается для выбранного моделью кандидата.
export async function searchPhotos(query, count = 6) {
	for (const list of [pexelsList, unsplashList, pixabayList, openverseList]) {
		const items = await list(query).catch(() => null);
		if (!items?.length) continue;
		const out = [];
		for (const item of items.slice(0, count)) {
			if (!item?.thumb) continue;
			const thumb = await download(item.thumb).catch(() => null);
			if (thumb) out.push({ thumb, url: item.full || item.thumb });
		}
		if (out.length) return out;
	}
	return [];
}

// Обходит спеку/правки: image-ноды с "query" или "photo" (id кандидата
// из инструмента photos) получают data (base64) и mime; то же для
// update-опов — замена фото на живой ноде. photoCache — Map id → {url,
// query}, наполняется ответами searchPhotos. Мутирует value, отчёт.
export async function resolveImages(value, photoCache, { max = Infinity, enabled = true } = {}) {
	const nodes = [];
	const walk = (node) => {
		if (Array.isArray(node)) {
			for (const item of node) walk(item);
			return;
		}
		if (!node || typeof node !== "object") return;
		if (
			(node.type === "image" || node.op === "update") &&
			((typeof node.query === "string" && node.query.trim()) ||
				(typeof node.photo === "string" && node.photo.trim()))
		)
			nodes.push(node);
		for (const child of Object.values(node)) {
			if (child && typeof child === "object") walk(child);
		}
	};
	walk(value);
	const report = { resolved: 0, failed: [] };
	if (!enabled) {
		if (nodes.length) report.failed.push("стоковые фото отключены (MCP_NO_IMAGES) — картинки останутся серыми заглушками");
		return report;
	}
	if (nodes.length > max) {
		report.failed.push(`фото: за один вызов не больше ${max}, остальные ${nodes.length - max} — серые заглушки (добавьте их отдельным figma_edit)`);
		nodes.length = max;
	}
	// Последовательно: бесплатные стоки не любят параллельный наброс.
	// Падение одного провайдера не должно мешать следующему.
	const safe = (fn) => fn.catch(() => null);
	for (let i = 0; i < nodes.length; i++) {
		const n = nodes[i];
		try {
			const w = typeof n.w === "number" ? n.w : undefined;
			const h = typeof n.h === "number" ? n.h : undefined;
			// Кандидат, выбранный через инструмент photos: полный вариант
			// по сохранённому url. Неизвестный id или сбой — откат на query.
			const picked =
				typeof n.photo === "string"
					? photoCache?.get(n.photo.trim())
					: null;
			if (n.photo && !picked)
				report.failed.push(
					`"${n.photo}": кандидат не найден в последних поисках`,
				);
			// query подставляем и из выбранного кандидата — он пишется
			// в ноду и сериализуется обратно для будущих замен.
			if (picked?.query && !n.query) n.query = picked.query;
			let img = picked ? await safe(download(picked.url)) : null;
			if (!img && typeof n.query === "string" && n.query.trim()) {
				img =
					(await safe(pexels(n.query, i))) ??
					(await safe(unsplash(n.query, i))) ??
					(await safe(pixabay(n.query, i))) ??
					(await safe(openverse(n.query, i))) ??
					(await safe(loremflickr(n.query, w, h, i))) ??
					(await picsum(n.query, w, h, i));
			}
			if (!img) {
				report.failed.push(`"${n.photo || n.query}": фото не найдено`);
				continue;
			}
			Object.assign(n, img);
			report.resolved++;
		} catch (err) {
			report.failed.push(
				`"${n.photo || n.query}": ${String(err?.message || err)}`,
			);
		}
	}
	return report;
}
