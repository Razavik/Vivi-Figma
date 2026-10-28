// Проверка спеки на неизвестные поля и неверные значения. Билдер молча игнорирует то, чего не знает
// (например size у иконки или extrabold), и ошибка видна только на скриншоте. Здесь — предупреждения
// в notes, вызов не отклоняется. Списки щедрые: лучше пропустить опечатку, чем ругаться на рабочее поле.

const BASE = ["type", "id", "name", "x", "y", "w", "h", "opacity", "position", "right", "bottom", "rotation", "layerBlur", "backgroundBlur", "mask", "meta", "pattern", "constraints", "visible", "locked", "group"];
const VISUAL = ["fill", "stroke", "strokeWidth", "strokeSides", "strokeAlign", "dash", "radius", "shadow", "overlay"];

const FIELDS = {
	frame: [...BASE, ...VISUAL, "layout", "gap", "rowGap", "padding", "align", "cross", "wrap", "clip", "minW", "maxW", "component", "children", "variants"],
	text: [...BASE, ...VISUAL, "text", "spans", "fontSize", "fontWeight", "fontFamily", "textStyle", "color", "align", "lineHeight", "letterSpacing", "textCase", "textDecoration", "maxLines", "minW", "maxW"],
	rect: [...BASE, ...VISUAL],
	ellipse: [...BASE, ...VISUAL],
	line: [...BASE, ...VISUAL, "direction"],
	image: [...BASE, ...VISUAL, "label", "query", "data", "mime", "path", "fit"],
	icon: [...BASE, ...VISUAL, "icon", "svg", "path", "color", "strokeWidth", "size"],
	instance: [...BASE, "component", "overrides", "variants", "minW", "maxW"],
	shape: [...BASE, ...VISUAL, "shape", "d", "viewBox", "rule", "sides", "points", "inner", "seed", "amplitude", "periods", "thickness"],
	bool: [...BASE, ...VISUAL, "op", "children"],
	ref: [...BASE, "scaleToWidth", "label"],
};

const WEIGHTS = ["thin", "light", "regular", "medium", "semibold", "bold", "extrabold", "black"];
const ENUMS = {
	frame: { layout: ["none", "vertical", "horizontal"], align: ["start", "center", "end", "space-between"], cross: ["start", "center", "end"] },
	text: { align: ["left", "center", "right"], textCase: ["upper", "lower", "title", "none"], textDecoration: ["underline", "strike", "none"], fontWeight: WEIGHTS },
	image: { fit: ["fill", "fit"] },
	line: { direction: ["horizontal", "vertical"] },
};
const COMMON_ENUMS = { position: ["absolute", "auto"], strokeAlign: ["inside", "center", "outside"] };

// частые «чужие» названия → что написать вместо
const HINTS = {
	width: "w", height: "h", background: "fill", bg: "fill", backgroundColor: "fill", borderRadius: "radius", cornerRadius: "radius", border: "stroke", borderColor: "stroke", borderWidth: "strokeWidth",
	font: "fontFamily", weight: "fontWeight", fontsize: "fontSize", textColor: "color", colour: "color", textAlign: "align", opacityValue: "opacity", content: "text", label: "text",
	margin: "gap у родителя или padding (margin нет)", flex: "layout:\"horizontal\" и w:\"fill\" у детей", top: "x/y (или position:\"absolute\")", left: "x/y (или position:\"absolute\")",
	justify: "align", alignItems: "cross", flexDirection: "layout", boxShadow: "shadow", src: "query или path", url: "query или path",
};
HINTS.size = "w и h (у иконок size допустим, у остальных — w/h или fontSize у текста)";

// Ближайшее допустимое имя (опечатка в регистре или в одну букву).
function nearest(key, list) {
	const k = key.toLowerCase();
	const hit = list.find((x) => x.toLowerCase() === k);
	if (hit) return hit;
	let best = null;
	let bestD = 2;
	for (const x of list) {
		const d = dist(k, x.toLowerCase());
		if (d < bestD || (d === bestD && best === null && d <= 1)) {
			best = x;
			bestD = d;
		}
	}
	return bestD <= 1 ? best : null;
}
function dist(a, b) {
	if (Math.abs(a.length - b.length) > 1) return 9;
	const m = [];
	for (let i = 0; i <= a.length; i++) m[i] = [i];
	for (let j = 0; j <= b.length; j++) m[0][j] = j;
	for (let i = 1; i <= a.length; i++)
		for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
	return m[a.length][b.length];
}

function* nodes(value) {
	if (Array.isArray(value)) {
		for (const x of value) yield* nodes(x);
		return;
	}
	if (!value || typeof value !== "object") return;
	if (typeof value.type === "string" && FIELDS[value.type]) yield value;
	if (Array.isArray(value.children)) yield* nodes(value.children);
	if (value.node) yield* nodes(value.node);
	if (Array.isArray(value.tree)) yield* nodes(value.tree);
}

const label = (n) => n.name || (typeof n.text === "string" ? n.text.slice(0, 24) : null) || n.icon || n.type;

// Возвращает массив строк-предупреждений (одинаковые сгруппированы).
export function checkSpecFields(value, { max = 12 } = {}) {
	const groups = new Map();
	const add = (key, msg, who) => {
		const g = groups.get(key) || { msg, who, count: 0 };
		g.count++;
		groups.set(key, g);
	};
	for (const n of nodes(value)) {
		const allowed = FIELDS[n.type];
		for (const k of Object.keys(n)) {
			if (allowed.includes(k)) continue;
			const near = nearest(k, allowed);
			const advice = HINTS[k] ? `используйте ${HINTS[k]}` : near ? `вероятно, ${near}` : "";
			add(`f|${n.type}|${k}`, `поле «${k}» у ${n.type} игнорируется${advice ? `: ${advice}` : ""}`, label(n));
		}
		const en = { ...COMMON_ENUMS, ...(ENUMS[n.type] || {}) };
		for (const [k, list] of Object.entries(en)) {
			const v = n[k];
			if (v === undefined || typeof v !== "string" || list.includes(v)) continue;
			add(`e|${n.type}|${k}|${v}`, `${n.type}.${k}: значение «${v}» недопустимо (допустимо: ${list.join(", ")})`, label(n));
		}
	}
	const out = [];
	for (const g of groups.values()) out.push(`${g.msg}${g.count > 1 ? ` (узлов: ${g.count}, например «${g.who}»)` : ` («${g.who}»)`}`);
	if (out.length > max) return [...out.slice(0, max), `…и ещё ${out.length - max} замечаний к полям спеки`];
	return out;
}
