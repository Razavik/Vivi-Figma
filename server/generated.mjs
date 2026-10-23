// Генерируемые блоки: аватары, логотипы, QR-коды, штрихкоды. Разворачиваются
// на сервере в обычные ноды (frame/text/icon c svg); исходная спека хранится
// в meta, чтобы модель меняла данные, а не слои (см. blocks.mjs).
import QRCode from "qrcode";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

// bwip-js тяжёлый (13 МБ) и нужен только штрихкодам — ставится по желанию:
// npm i --prefix ~/.vivi-figma bwip-js
let bwipCache;
function bwip() {
	if (bwipCache !== undefined) return bwipCache;
	bwipCache = null;
	for (const from of [join(homedir(), ".vivi-figma", "x.js"), import.meta.url]) {
		try {
			bwipCache = createRequire(from)("bwip-js");
			break;
		} catch {
			/* пробуем следующее место */
		}
	}
	return bwipCache;
}

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const clean = (v, max) =>
	typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

// Детерминированный хеш строки (FNV-1a).
export function hashOf(text) {
	let h = 2166136261;
	for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
	return h;
}

// Контраст WCAG между двумя #RRGGBB.
export function contrastOf(a, b) {
	const lum = (hex) => {
		const [r, g, bl] = [1, 3, 5].map((i) => {
			const v = parseInt(hex.slice(i, i + 2), 16) / 255;
			return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
		});
		return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
	};
	const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

// Тёмный или белый текст — тот, что контрастнее на фоне.
export function inkOn(bg) {
	return contrastOf(bg, "#FFFFFF") >= contrastOf(bg, "#111827") ? "#FFFFFF" : "#111827";
}

// Приглушённые цвета аватаров: для каждого читается белый или тёмный текст ≥ 4.5:1.
export const AVATAR_COLORS = [
	"#B4532A",
	"#2F6F8F",
	"#5B7F3A",
	"#7A4E9C",
	"#B8860B",
	"#A63D5B",
	"#3F7F7A",
	"#6B7280",
];

// «Анна Королёва» → «АК», «john» → «J», «Jean-Luc Picard» → «JP».
export function initialsOf(name) {
	const words = clean(name, 80)
		.split(/[\s]+/)
		.map((w) => w.replace(/^[^\p{L}\p{N}]+/u, ""))
		.filter(Boolean);
	const first = (w) => (w ? [...w][0].toUpperCase() : "");
	if (!words.length) return "?";
	if (words.length === 1) return first(words[0]);
	return first(words[0]) + first(words[1]);
}

export function expandAvatar(spec) {
	const size = num(spec.size ?? spec.w, 40);
	const name = clean(spec.name, 80);
	const bg = AVATAR_COLORS[hashOf(name || "?") % AVATAR_COLORS.length];
	const frame = {
		type: "frame",
		name: name ? `Avatar / ${name}` : "Avatar",
		layout: "horizontal",
		align: "center",
		cross: "center",
		w: size,
		h: size,
		radius: size / 2,
		clip: true,
		fill: bg,
		x: spec.x,
		y: spec.y,
		position: spec.position,
		children: [],
	};
	if (spec.photo === true) {
		frame.layout = "none";
		frame.children.push({
			type: "image",
			name: "Photo",
			x: 0,
			y: 0,
			w: size,
			h: size,
			query: clean(spec.query, 80) || "portrait of a person smiling, neutral background",
			label: initialsOf(name),
		});
	} else {
		frame.children.push({
			type: "text",
			name: "Initials",
			text: initialsOf(name),
			fontSize: Math.max(10, Math.round(size * 0.4)),
			fontWeight: "semibold",
			color: inkOn(bg),
		});
	}
	return frame;
}

const LOGO_STYLES = ["monogram", "wordmark", "geometric", "mark+word"];

// svg из 2–3 фигур, детерминированно от текста: круг, квадрат, треугольник.
export function geometricSvg(text, color, size) {
	const h = hashOf(text);
	const pick = (n) => (h >>> (n * 3)) % 3;
	const s = size;
	const parts = [];
	const shapes = [
		(x, y, r, o) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" fill-opacity="${o}"/>`,
		(x, y, r, o) =>
			`<rect x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" rx="${Math.round(r / 4)}" fill="${color}" fill-opacity="${o}"/>`,
		(x, y, r, o) =>
			`<path d="M${x} ${y - r}L${x + r} ${y + r}H${x - r}Z" fill="${color}" fill-opacity="${o}"/>`,
	];
	parts.push(shapes[pick(0)](s * 0.38, s * 0.5, s * 0.3, 1));
	parts.push(shapes[pick(1)](s * 0.62, s * 0.5, s * 0.26, 0.6));
	if (h % 2) parts.push(shapes[pick(2)](s * 0.5, s * 0.3, s * 0.12, 0.35));
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" fill="none">${parts.join("")}</svg>`;
}

export function expandLogo(spec) {
	const text = clean(spec.text ?? spec.name, 40) || "Brand";
	const style = LOGO_STYLES.includes(spec.style) ? spec.style : "wordmark";
	const color = /^#[0-9a-f]{6}$/i.test(spec.color || "") ? spec.color : "#111827";
	const size = num(spec.size, 40);
	const word = {
		type: "text",
		name: "Wordmark",
		text: text.toUpperCase(),
		fontSize: Math.round(size * 0.55),
		fontWeight: "bold",
		letterSpacing: "8%",
		color,
	};
	const mark = {
		type: "icon",
		name: "Mark",
		w: size,
		h: size,
		svg: geometricSvg(text, color, size),
	};
	const monogram = {
		type: "frame",
		name: "Monogram",
		layout: "horizontal",
		align: "center",
		cross: "center",
		w: size,
		h: size,
		radius: hashOf(text) % 2 ? size / 2 : Math.round(size * 0.22),
		fill: color,
		children: [
			{
				type: "text",
				text: initialsOf(text),
				fontSize: Math.round(size * 0.42),
				fontWeight: "bold",
				color: inkOn(color),
			},
		],
	};
	const children =
		style === "monogram"
			? [monogram]
			: style === "geometric"
				? [mark]
				: style === "mark+word"
					? [mark, word]
					: [word];
	return {
		type: "frame",
		name: `Logo / ${text}`,
		layout: "horizontal",
		gap: Math.round(size * 0.25),
		cross: "center",
		w: "hug",
		h: "hug",
		x: spec.x,
		y: spec.y,
		position: spec.position,
		children,
	};
}

// QR: модули → один <path> из прямоугольников (без нативных модулей).
export function qrSvg(value, size, fg, bg) {
	const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
	const n = qr.modules.size;
	const quiet = 2;
	const total = n + quiet * 2;
	let d = "";
	for (let y = 0; y < n; y++) {
		let x = 0;
		while (x < n) {
			if (!qr.modules.data[y * n + x]) {
				x++;
				continue;
			}
			let len = 1;
			while (x + len < n && qr.modules.data[y * n + x + len]) len++;
			d += `M${x + quiet} ${y + quiet}h${len}v1h-${len}z`;
			x += len;
		}
	}
	return {
		modules: n,
		svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="${bg}"/><path d="${d}" fill="${fg}"/></svg>`,
	};
}

export function expandQr(spec) {
	const value = clean(spec.value, 500);
	if (!value) return null;
	const size = num(spec.size ?? spec.w, 120);
	const fg = /^#[0-9a-f]{6}$/i.test(spec.color || "") ? spec.color : "#111111";
	const bg = /^#[0-9a-f]{6}$/i.test(spec.bg || "") ? spec.bg : "#FFFFFF";
	return {
		type: "frame",
		name: "QR",
		layout: "none",
		w: size,
		h: size,
		radius: 4,
		clip: true,
		x: spec.x,
		y: spec.y,
		position: spec.position,
		children: [
			{ type: "icon", name: "QR code", x: 0, y: 0, w: size, h: size, svg: qrSvg(value, size, fg, bg).svg },
		],
	};
}

// Контрольная цифра EAN-13 по первым 12.
export function ean13Check(first12) {
	const sum = [...first12].reduce((s, ch, i) => s + Number(ch) * (i % 2 ? 3 : 1), 0);
	return (10 - (sum % 10)) % 10;
}

// Значение штрихкода: EAN-13 дополняем/исправляем контрольной цифрой.
export function fixEan13(value) {
	const digits = String(value).replace(/\D/g, "");
	if (digits.length < 12) return { value: digits, fixed: false, valid: false };
	const base = digits.slice(0, 12);
	const check = String(ean13Check(base));
	const given = digits[12];
	return { value: base + check, fixed: given !== undefined && given !== check, valid: true };
}

const BARCODE_FORMATS = { ean13: "ean13", ean8: "ean8", code128: "code128", code39: "code39", upca: "upca" };

export function barcodeSvg(value, format, w, h) {
	const bcid = BARCODE_FORMATS[format] || "code128";
	const lib = bwip();
	if (!lib) throw new Error("штрихкоды: установите bwip-js — npm i --prefix ~/.vivi-figma bwip-js");
	const raw = lib.toSVG({ bcid, text: value, height: 10, includetext: false, paddingwidth: 0, paddingheight: 0 });
	const body = raw.replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
	const vb = /viewBox="([^"]+)"/.exec(raw)?.[1] || "0 0 100 40";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}" preserveAspectRatio="none">${body}</svg>`;
}

export function expandBarcode(spec, report) {
	let value = clean(spec.value, 64);
	if (!value) return null;
	const format = BARCODE_FORMATS[spec.format] ? spec.format : "code128";
	if (format === "ean13") {
		const fixed = fixEan13(value);
		if (!fixed.valid) {
			report?.warnings.push(`barcode: для EAN-13 нужно минимум 12 цифр, получено «${value}»`);
			return null;
		}
		if (fixed.fixed)
			report?.warnings.push(`barcode: контрольная цифра EAN-13 исправлена → ${fixed.value}`);
		value = fixed.value;
	}
	const w = num(spec.w, 180);
	const h = num(spec.h, 60);
	let svg;
	try {
		svg = barcodeSvg(value, format, w, h);
	} catch (err) {
		report?.warnings.push(`barcode: ${String(err?.message || err)}`);
		return null;
	}
	return {
		type: "frame",
		name: "Barcode",
		layout: "vertical",
		gap: 4,
		cross: "center",
		w: "hug",
		h: "hug",
		x: spec.x,
		y: spec.y,
		position: spec.position,
		children: [
			{ type: "icon", name: "Bars", w, h, svg },
			{ type: "text", name: "Digits", text: value, fontSize: 11, color: "#111827", letterSpacing: "10%" },
		],
	};
}
