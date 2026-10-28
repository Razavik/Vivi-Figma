// figma_variants: описание набора вариантов → список операций figma_edit
// (insert компонентов в «Components» → combine_variants → set_interactions → swap).
// Чистая функция, без обращения к Figma: ошибки в описании находим до вызова плагина.

const STATE_KEYS = ["state", "status"];
const HOVERS = ["hover", "hovered"];
const PRESSES = ["pressed", "press", "active-press"];

function cloneJson(v) {
	return JSON.parse(JSON.stringify(v));
}

// первая нода с таким именем (в глубину), включая корень
function findByName(node, name) {
	if (node && node.name === name) return node;
	for (const k of node?.children || []) {
		const hit = findByName(k, name);
		if (hit) return hit;
	}
	return null;
}

function variantName(keys, props) {
	return keys.map((k) => `${k}=${props[k]}`).join(", ");
}

// Автосвязи: Default → Hover (наведение), Default → Pressed (нажатие); пара состояний
// (Closed/Open, Active/Inactive, On/Off) — клик туда и обратно. Группы по остальным свойствам.
function autoInteractions(keys, list) {
	const stateKey = keys.find((k) => STATE_KEYS.includes(k.toLowerCase()));
	if (!stateKey) return [];
	const out = [];
	const groups = new Map();
	list.forEach((v, i) => {
		const sig = JSON.stringify(keys.filter((k) => k !== stateKey).map((k) => v.props[k]));
		const g = groups.get(sig) || [];
		g.push(i);
		groups.set(sig, g);
	});
	for (const idxs of groups.values()) {
		const byState = new Map(idxs.map((i) => [String(list[i].props[stateKey]).toLowerCase(), i]));
		const base = idxs[0];
		const hover = [...byState].find(([s]) => HOVERS.includes(s));
		const press = [...byState].find(([s]) => PRESSES.includes(s));
		if (hover || press) {
			const inter = [];
			if (hover) inter.push({ trigger: "hover", target: hover[1], transition: "smart_animate", duration: 0.15 });
			if (press) inter.push({ trigger: "press", target: press[1], transition: "instant" });
			out.push({ from: base, interactions: inter });
		} else if (idxs.length === 2) {
			out.push({ from: idxs[0], interactions: [{ trigger: "click", target: idxs[1], transition: "dissolve", duration: 0.2 }] });
			out.push({ from: idxs[1], interactions: [{ trigger: "click", target: idxs[0], transition: "dissolve", duration: 0.2 }] });
		}
	}
	return out;
}

function explicitInteractions(keys, list, rules) {
	const out = new Map();
	for (const r of rules) {
		const from = list.map((v, i) => i).filter((i) => Object.entries(r.from || {}).every(([k, val]) => list[i].props[k] === val));
		if (!from.length) throw new Error(`interactions: нет варианта для from ${JSON.stringify(r.from)}`);
		for (const i of from) {
			// цель: свойства из to, остальные — как у источника (тот же Type и т.п.)
			const target = list.findIndex((v) => keys.every((k) => (k in (r.to || {}) ? v.props[k] === r.to[k] : v.props[k] === list[i].props[k])));
			if (target < 0) throw new Error(`interactions: нет варианта для to ${JSON.stringify(r.to)} рядом с ${variantName(keys, list[i].props)}`);
			const entry = out.get(i) || { from: i, interactions: [] };
			entry.interactions.push({ trigger: r.trigger || "click", target, transition: r.transition || "instant", ...(r.duration ? { duration: r.duration } : {}) });
			out.set(i, entry);
		}
	}
	return [...out.values()];
}

// args: { name, base, variants:[{props, set?, children?}], interactions?, replace?:[{id, variants, overrides, w, h, name}] }
export function variantEdits(args) {
	const { name, base, variants } = args || {};
	if (typeof name !== "string" || !name.trim()) throw new Error("name: нужно имя набора, например «Button/Primary»");
	if (!base || base.type !== "frame") throw new Error("base: корень описания должен быть frame");
	if (!Array.isArray(variants) || variants.length < 2) throw new Error("variants: нужно минимум 2 варианта");
	const keys = Object.keys(variants[0].props || {});
	if (!keys.length) throw new Error('props: у варианта нужны свойства, например {"State":"Default"}');
	const seen = new Set();
	for (const v of variants) {
		const pk = Object.keys(v.props || {});
		if (pk.length !== keys.length || !keys.every((k) => pk.includes(k))) throw new Error(`props: у всех вариантов одни и те же ключи (${keys.join(", ")}), а у «${JSON.stringify(v.props)}» другие`);
		const n = variantName(keys, v.props);
		if (/[=,]/.test(Object.values(v.props).join(""))) throw new Error(`props: в значениях нельзя «=» и «,» (${n})`);
		if (seen.has(n)) throw new Error(`props: комбинация «${n}» повторяется`);
		seen.add(n);
	}
	const edits = [];
	variants.forEach((v, i) => {
		const node = cloneJson(base);
		node.component = true;
		node.name = variantName(keys, v.props);
		if (v.set) Object.assign(node, cloneJson(v.set));
		for (const [layer, patch] of Object.entries(v.children || {})) {
			const target = findByName(node, layer);
			if (!target || target === node) throw new Error(`children: в base нет слоя «${layer}» (вариант ${node.name})`);
			Object.assign(target, cloneJson(patch));
		}
		edits.push({ op: "insert", parent: "$components", as: `v${i}`, node });
	});
	edits.push({ op: "combine_variants", ids: variants.map((_, i) => `$v${i}`), name: name.trim(), as: "set" });
	const mode = args.interactions === undefined ? "auto" : args.interactions;
	const links = mode === "none" ? [] : Array.isArray(mode) ? explicitInteractions(keys, variants, mode) : autoInteractions(keys, variants);
	for (const l of links)
		edits.push({
			op: "set_interactions",
			id: `$v${l.from}`,
			interactions: l.interactions.map((x) => ({ ...x, target: `$v${x.target}` })),
		});
	for (const r of args.replace || []) {
		if (!r.id) throw new Error("replace: у записи нужен id заменяемого узла");
		edits.push({ op: "swap", id: r.id, component: "$set", variants: r.variants || variants[0].props, ...(r.overrides ? { overrides: r.overrides } : {}), ...(r.w !== undefined ? { w: r.w } : {}), ...(r.h !== undefined ? { h: r.h } : {}), ...(r.name ? { name: r.name } : {}) });
	}
	return edits;
}
