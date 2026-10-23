// Карта-заглушка: стилизованная svg-карта без сети. Улицы, парки и вода
// строятся детерминированно от места (place), поэтому одинаковый запрос даёт
// одинаковую карту. Настоящие тайлы OSM сознательно не подключены (внешняя
// сеть и правила использования) — это отдельное решение пользователя.
import { hashOf } from "./generated.mjs";

const STYLES = {
	light: { bg: "#EEF0EA", road: "#FFFFFF", main: "#FFD9A0", park: "#CFE5C2", water: "#BFD9EC", pin: "#E5484D" },
	dark: { bg: "#1F232A", road: "#2E343E", main: "#3E4654", park: "#23332A", water: "#1B2C3F", pin: "#FF6B6B" },
	minimal: { bg: "#F4F4F5", road: "#FFFFFF", main: "#E4E4E7", park: "#E7E7EA", water: "#DCE3EA", pin: "#111827" },
};

// Детерминированный генератор псевдослучайных чисел (mulberry32).
export function rng(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const r1 = (n) => Math.round(n * 10) / 10;

export function mapSvg(place, style, w, h) {
	const c = STYLES[style] || STYLES.light;
	const rand = rng(hashOf(place || "map"));
	const parts = [`<rect width="${w}" height="${h}" fill="${c.bg}"/>`];
	// Вода: пара крупных пятен у края.
	for (let i = 0; i < 2; i++) {
		const cx = rand() * w;
		const cy = rand() * h;
		parts.push(`<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(w * (0.12 + rand() * 0.16))}" ry="${r1(h * (0.08 + rand() * 0.14))}" fill="${c.water}"/>`);
	}
	// Парки: скруглённые прямоугольники.
	for (let i = 0; i < 3; i++) {
		const pw = w * (0.08 + rand() * 0.12);
		const ph = h * (0.1 + rand() * 0.14);
		parts.push(`<rect x="${r1(rand() * (w - pw))}" y="${r1(rand() * (h - ph))}" width="${r1(pw)}" height="${r1(ph)}" rx="10" fill="${c.park}"/>`);
	}
	// Улицы: неравномерная сетка + пара диагоналей-проспектов.
	let x = rand() * 40;
	while (x < w) {
		parts.push(`<rect x="${r1(x)}" y="0" width="${2 + Math.round(rand() * 3)}" height="${h}" fill="${c.road}"/>`);
		x += 36 + rand() * 70;
	}
	let y = rand() * 40;
	while (y < h) {
		parts.push(`<rect x="0" y="${r1(y)}" width="${w}" height="${2 + Math.round(rand() * 3)}" fill="${c.road}"/>`);
		y += 36 + rand() * 70;
	}
	for (let i = 0; i < 2; i++) {
		const x1 = rand() * w;
		const x2 = rand() * w;
		parts.push(`<path d="M${r1(x1)} 0L${r1(x2)} ${h}" stroke="${c.main}" stroke-width="${6 + Math.round(rand() * 4)}" stroke-linecap="round"/>`);
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${parts.join("")}</svg>`;
}

const PIN_W = 28;
const PIN_H = 36;

function pinSvg(color) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_W}" height="${PIN_H}" viewBox="0 0 28 36" fill="none"><path d="M14 0C6.3 0 0 6.1 0 13.7 0 23.4 14 36 14 36s14-12.6 14-22.3C28 6.1 21.7 0 14 0Z" fill="${color}"/><circle cx="14" cy="13.5" r="5" fill="#FFFFFF"/></svg>`;
}

// Позиции пинов внутри карты (с отступом от краёв): первый — у центра.
export function pinPositions(place, count, w, h) {
	const rand = rng(hashOf(`${place}|pins`));
	const out = [];
	for (let i = 0; i < count; i++) {
		const margin = 48;
		const x = i === 0 ? w / 2 : margin + rand() * (w - margin * 2);
		const y = i === 0 ? h / 2 : margin + rand() * (h - margin * 2);
		out.push({ x: r1(x - PIN_W / 2), y: r1(y - PIN_H) });
	}
	return out;
}

export function expandMap(spec) {
	const w = typeof spec.w === "number" && spec.w > 0 ? spec.w : 720;
	const h = typeof spec.h === "number" && spec.h > 0 ? spec.h : 320;
	const style = STYLES[spec.style] ? spec.style : "light";
	const place = typeof spec.place === "string" ? spec.place.trim().slice(0, 120) : "";
	// Настоящая карта: плитки OSM подгружены заранее (osm.mjs → spec._osm).
	const osm = spec._osm && Array.isArray(spec._osm.tiles) ? spec._osm : null;
	let pins = (Array.isArray(spec.pins) ? spec.pins : []).slice(0, 6);
	// На настоящей карте осмысленна только точка места — один пин по центру.
	if (osm) pins = [pins[0] ?? { label: "" }];
	const c = STYLES[style];
	const spots = osm
		? [{ x: r1(osm.center.x - PIN_W / 2), y: r1(osm.center.y - PIN_H) }]
		: pinPositions(place, pins.length, w, h);
	const children = osm
		? osm.tiles.map((t) => ({
				type: "image",
				name: `Tile ${t.z}/${t.tx}/${t.ty}`,
				x: t.x,
				y: t.y,
				w: 256,
				h: 256,
				data: t.data,
			}))
		: [{ type: "icon", name: "Map", x: 0, y: 0, w, h, svg: mapSvg(place, style, w, h) }];
	pins.forEach((p, i) => {
		children.push({ type: "icon", name: "Pin", x: spots[i].x, y: spots[i].y, w: PIN_W, h: PIN_H, svg: pinSvg(c.pin) });
		const label = typeof p?.label === "string" ? p.label.trim().slice(0, 40) : "";
		if (label)
			children.push({
				type: "frame",
				name: "Pin label",
				x: Math.max(4, Math.min(w - 120, spots[i].x + PIN_W + 6)),
				y: spots[i].y + 4,
				layout: "horizontal",
				w: "hug",
				h: "hug",
				padding: [4, 8],
				radius: 6,
				fill: style === "dark" ? "#2E343E" : "#FFFFFF",
				shadow: { y: 2, blur: 8, color: "#00000026" },
				children: [{ type: "text", text: label, fontSize: 12, fontWeight: "medium", color: style === "dark" ? "#F3F4F6" : "#111827" }],
			});
	});
	children.push({
		type: "text",
		name: "Credit",
		text: osm ? "© OpenStreetMap contributors" : "Схематичная карта",
		x: 8,
		y: h - 18,
		fontSize: 10,
		color: style === "dark" ? "#9CA3AF" : "#6B7280",
	});
	return {
		type: "frame",
		name: place ? `Map / ${place}` : "Map",
		layout: "none",
		w,
		h,
		radius: 12,
		clip: true,
		x: spec.x,
		y: spec.y,
		position: spec.position,
		children,
	};
}
