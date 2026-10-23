// Настоящие карты OpenStreetMap для блока map ("real":true). По умолчанию
// ВЫКЛЮЧЕНО: включается переменной окружения OSM_MAPS=1 в server/.env.
// Правила использования OSM: информативный User-Agent, кэш тайлов и
// геокодинга, не чаще одного запроса геокодера в секунду, без массовой
// загрузки, подпись «© OpenStreetMap contributors» на карте.
const UA = "ViviAgent/1.0 (local Figma plugin bridge)";
const TILE = 256;
const MAX_TILES = 12;
const GEOCODE_GAP_MS = 1100;

const geocodeCache = new Map();
const tileCache = new Map();
let lastGeocode = 0;

// Широта/долгота → пиксельные координаты мира на масштабе z.
export function worldPixel(lat, lon, z) {
	const scale = TILE * 2 ** z;
	const x = ((lon + 180) / 360) * scale;
	const sin = Math.sin((lat * Math.PI) / 180);
	const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
	return { x, y };
}

// Тайлы, покрывающие окно w×h вокруг точки; x/y — позиция тайла в окне.
export function tilesFor(lat, lon, z, w, h) {
	const c = worldPixel(lat, lon, z);
	const left = c.x - w / 2;
	const top = c.y - h / 2;
	const max = 2 ** z;
	const out = [];
	for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + h) / TILE); ty++)
		for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + w) / TILE); tx++) {
			if (ty < 0 || ty >= max) continue;
			out.push({
				z,
				tx: ((tx % max) + max) % max,
				ty,
				x: Math.round(tx * TILE - left),
				y: Math.round(ty * TILE - top),
			});
		}
	return { tiles: out, center: { x: w / 2, y: h / 2 } };
}

export function osmEnabled(env = process.env) {
	return env.OSM_MAPS === "1";
}

async function geocode(place, fetchImpl) {
	const key = place.toLowerCase();
	if (geocodeCache.has(key)) return geocodeCache.get(key);
	const wait = lastGeocode + GEOCODE_GAP_MS - Date.now();
	if (wait > 0) await new Promise((r) => setTimeout(r, wait));
	lastGeocode = Date.now();
	const res = await fetchImpl(
		`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(place)}`,
		{ headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) },
	);
	if (!res.ok) throw new Error(`геокодер: HTTP ${res.status}`);
	const hit = (await res.json())?.[0];
	if (!hit) throw new Error(`геокодер: «${place}» не найдено`);
	const point = { lat: Number(hit.lat), lon: Number(hit.lon) };
	geocodeCache.set(key, point);
	return point;
}

async function tileData(t, fetchImpl) {
	const key = `${t.z}/${t.tx}/${t.ty}`;
	if (tileCache.has(key)) return tileCache.get(key);
	const res = await fetchImpl(`https://tile.openstreetmap.org/${key}.png`, {
		headers: { "User-Agent": UA },
		signal: AbortSignal.timeout(10000),
	});
	if (!res.ok) throw new Error(`тайл ${key}: HTTP ${res.status}`);
	const data = Buffer.from(await res.arrayBuffer()).toString("base64");
	tileCache.set(key, data);
	// Кэш ограничен — старые тайлы вытесняются.
	while (tileCache.size > 200) tileCache.delete(tileCache.keys().next().value);
	return data;
}

// Обходит спеку/правки: map с real:true получает _osm = { tiles, center } —
// плитки с данными. Сбой (сеть, геокодер) — предупреждение и схематичная карта.
export async function prefetchOsm(value, { env = process.env, fetchImpl = fetch, warn = console.warn } = {}) {
	if (!osmEnabled(env)) return 0;
	const maps = [];
	const walk = (node) => {
		if (Array.isArray(node)) return node.forEach(walk);
		if (!node || typeof node !== "object") return;
		if (node.type === "map" && node.real === true) maps.push(node);
		if (node.op === "update" && node.map && node.map.real === true) maps.push(node.map);
		for (const [k, child] of Object.entries(node)) {
			if (k === "meta" || k === "_osm") continue;
			if (child && typeof child === "object") walk(child);
		}
	};
	walk(value);
	let done = 0;
	for (const spec of maps.slice(0, 3)) {
		try {
			const place = typeof spec.place === "string" ? spec.place.trim() : "";
			if (!place) throw new Error("нет place");
			const w = typeof spec.w === "number" && spec.w > 0 ? spec.w : 720;
			const h = typeof spec.h === "number" && spec.h > 0 ? spec.h : 320;
			const z = Math.min(18, Math.max(10, Math.round(Number(spec.zoom) || 15)));
			const point = await geocode(place, fetchImpl);
			const { tiles, center } = tilesFor(point.lat, point.lon, z, w, h);
			if (tiles.length > MAX_TILES) throw new Error(`слишком много тайлов (${tiles.length})`);
			const filled = [];
			for (const t of tiles) filled.push({ ...t, data: await tileData(t, fetchImpl) });
			spec._osm = { tiles: filled, center };
			done++;
		} catch (err) {
			warn(`osm: ${String(err?.message || err)} — будет схематичная карта`);
		}
	}
	return done;
}

// Сброс кэшей (тесты).
export function _resetOsmCaches() {
	geocodeCache.clear();
	tileCache.clear();
	lastGeocode = 0;
}
