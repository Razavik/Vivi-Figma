// Паттерны и текстуры: svg-плитка по параметрам. Плагин кладёт плитку в
// «Components / Patterns» и использует как PATTERN-заливку; запасной путь —
// svg-слой поверх фона.
import { hashOf } from "./generated.mjs";
import { rng } from "./maps.mjs";

export const PATTERNS = ["dots", "grid", "lines", "diagonal", "waves", "noise", "topo"];

const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v || "") ? v : d);
const num = (v, d, lo, hi) =>
	Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(hi, Math.max(lo, Number(v))) : d;

// Нормализованные параметры: из них же считается ключ кэша плитки.
export function patternParams(p) {
	const name = PATTERNS.includes(p?.pattern) ? p.pattern : "dots";
	return {
		pattern: name,
		color: hex(p?.color, "#00000026"),
		size: num(p?.size, 4, 1, 64),
		gap: num(p?.gap, 16, 4, 128),
		bg: p?.bg ? hex(p.bg, "") || undefined : undefined,
	};
}

export function patternKey(p) {
	const q = patternParams(p);
	return `${q.pattern}-${q.color.replace("#", "")}-${q.size}-${q.gap}`;
}

// Плитка: квадрат side×side.
export function tileSvg(p) {
	const q = patternParams(p);
	const side = Math.max(q.size, q.gap);
	const c = q.color;
	let body = "";
	switch (q.pattern) {
		case "dots":
			body = `<circle cx="${side / 2}" cy="${side / 2}" r="${q.size / 2}" fill="${c}"/>`;
			break;
		case "grid":
			body = `<path d="M0 0H${side}M0 0V${side}" stroke="${c}" stroke-width="${Math.max(1, q.size / 4)}"/>`;
			break;
		case "lines":
			body = `<path d="M0 ${side / 2}H${side}" stroke="${c}" stroke-width="${Math.max(1, q.size / 2)}"/>`;
			break;
		case "diagonal":
			body = `<path d="M0 ${side}L${side} 0M-${side / 2} ${side / 2}L${side / 2} -${side / 2}M${side / 2} ${side * 1.5}L${side * 1.5} ${side / 2}" stroke="${c}" stroke-width="${Math.max(1, q.size / 3)}"/>`;
			break;
		case "waves":
			body = `<path d="M0 ${side / 2}Q${side / 4} 0 ${side / 2} ${side / 2}T${side} ${side / 2}" stroke="${c}" stroke-width="${Math.max(1, q.size / 3)}" fill="none"/>`;
			break;
		case "noise": {
			const rand = rng(hashOf(patternKey(q)));
			const dots = [];
			for (let i = 0; i < Math.round(side * 1.2); i++)
				dots.push(`<circle cx="${(rand() * side).toFixed(1)}" cy="${(rand() * side).toFixed(1)}" r="${(0.4 + rand() * q.size * 0.25).toFixed(2)}" fill="${c}"/>`);
			body = dots.join("");
			break;
		}
		case "topo":
			body = `<path d="M0 ${side * 0.3}C${side * 0.3} ${side * 0.05} ${side * 0.6} ${side * 0.55} ${side} ${side * 0.3}M0 ${side * 0.7}C${side * 0.3} ${side * 0.45} ${side * 0.6} ${side * 0.95} ${side} ${side * 0.7}" stroke="${c}" stroke-width="${Math.max(1, q.size / 4)}" fill="none"/>`;
			break;
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}" fill="none">${body}</svg>`;
}

// У ноды с fill:{pattern:...} — отдельные поля для плагина: плитка и параметры.
// Сервер заменяет объект заливки на фон-цвет и кладёт описание рядом.
export function expandPatternFills(value) {
	let count = 0;
	const walk = (node) => {
		if (Array.isArray(node)) return node.forEach(walk);
		if (!node || typeof node !== "object") return;
		const fill = node.fill;
		if (fill && typeof fill === "object" && typeof fill.pattern === "string") {
			const q = patternParams(fill);
			node.pattern = { key: patternKey(q), svg: tileSvg(q), side: Math.max(q.size, q.gap), params: q };
			node.fill = q.bg || "none";
			count++;
		}
		for (const [k, child] of Object.entries(node)) {
			if (k === "pattern" || k === "meta") continue;
			if (child && typeof child === "object") walk(child);
		}
	};
	walk(value);
	return count;
}
