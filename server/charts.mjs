// Графики: {"type":"chart",...} разворачивается на сервере в обычные ноды
// (frame/rect/text/icon с svg) — плагин ничего о графиках не знает, результат
// редактируется руками как слои. Исходная спека хранится в meta.chart.
const PALETTE = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#06B6D4", "#8B5CF6"];
const MUTED = "#6B7280";
const GRID = "#E5E7EB";
const KINDS = ["bar", "hbar", "line", "area", "pie", "donut", "sparkline"];
const MAX_POINTS = 60;

const r1 = (n) => Math.round(n * 10) / 10;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// «Красивые» деления шкалы: шаг 1/2/5 × 10ⁿ, ноль всегда в диапазоне.
export function niceScale(min, max, count = 4) {
	let lo = Math.min(0, min);
	let hi = Math.max(0, max);
	if (hi === lo) hi = lo + 1;
	const raw = (hi - lo) / count;
	const mag = 10 ** Math.floor(Math.log10(raw));
	const f = raw / mag;
	const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
	lo = Math.floor(lo / step + 1e-9) * step;
	hi = Math.ceil(hi / step - 1e-9) * step;
	const ticks = [];
	for (let v = lo; v <= hi + step / 2; v += step)
		ticks.push(Math.round(v / step) * step);
	return { min: lo, max: hi, step, ticks };
}

// Число для подписей: 12000 → 12K, 2500000 → 2.5M.
export function fmt(v) {
	const a = Math.abs(v);
	const trim = (n) => String(Math.round(n * 10) / 10);
	if (a >= 1e6) return `${trim(v / 1e6)}M`;
	if (a >= 1e4) return `${trim(v / 1e3)}K`;
	return Number.isInteger(v) ? String(v) : trim(v);
}

const textW = (s, size = 11) => Math.ceil(String(s).length * size * 0.58);

const text = (t, x, y, extra = {}) => ({
	type: "text",
	text: String(t),
	x: r1(x),
	y: r1(y),
	fontSize: 11,
	color: MUTED,
	...extra,
});

// Данные → { cats:[{label, vals}], series:[{name,color}] }.
export function normalize(spec) {
	const data = (Array.isArray(spec.data) ? spec.data : [])
		.slice(0, MAX_POINTS)
		.filter((d) => d && typeof d === "object");
	const cats = data.map((d) => ({
		label: String(d.label ?? ""),
		vals: Array.isArray(d.values) ? d.values.map(num) : [num(d.value)],
	}));
	const count = Math.max(1, ...cats.map((c) => c.vals.length));
	const given = Array.isArray(spec.series) ? spec.series : [];
	const series = Array.from({ length: count }, (_, i) => ({
		name: String(given[i]?.name ?? ""),
		color:
			typeof given[i]?.color === "string"
				? given[i].color
				: PALETTE[i % PALETTE.length],
	}));
	return { cats, series };
}

function legendRow(series) {
	return {
		type: "frame",
		name: "Legend",
		layout: "horizontal",
		gap: 16,
		w: "hug",
		h: "hug",
		cross: "center",
		children: series
			.filter((s) => s.name)
			.map((s) => ({
				type: "frame",
				name: s.name,
				layout: "horizontal",
				gap: 6,
				w: "hug",
				h: "hug",
				cross: "center",
				children: [
					{ type: "ellipse", w: 8, h: 8, fill: s.color },
					{ type: "text", text: s.name, fontSize: 12, color: MUTED },
				],
			})),
	};
}

function cartesian(spec, kind, { cats, series }) {
	const w = num(spec.w) > 0 ? num(spec.w) : 480;
	const h = num(spec.h) > 0 ? num(spec.h) : 280;
	const spark = kind === "sparkline";
	const axis = spark ? false : spec.axis !== false;
	const grid = spark ? false : spec.grid !== false;
	const values = spec.values === true;
	const stacked = spec.stacked === true && kind === "bar";
	const left = axis ? 40 : 0;
	const bottom = axis ? 22 : 0;
	const top = values ? 16 : 8;
	const plotW = w - left;
	const plotH = h - bottom - top;
	const n = cats.length || 1;

	const totals = cats.map((c) =>
		stacked
			? c.vals.reduce((a, b) => a + Math.max(0, b), 0)
			: Math.max(...c.vals),
	);
	const lows = cats.map((c) => Math.min(...c.vals, 0));
	const scale = niceScale(Math.min(...lows, 0), Math.max(...totals, 0));
	const y = (v) => top + plotH * (1 - (v - scale.min) / (scale.max - scale.min));
	const kids = [];

	if (grid || axis)
		for (const t of scale.ticks) {
			if (grid)
				kids.push({
					type: "rect",
					name: "Grid",
					x: left,
					y: r1(y(t) - 0.5),
					w: plotW,
					h: 1,
					fill: GRID,
				});
			if (axis)
				kids.push(
					text(fmt(t), left - 8 - textW(fmt(t)), y(t) - 7, { name: "Axis" }),
				);
		}

	const xMid = (i) =>
		spark && n > 1 ? plotW * (i / (n - 1)) : left + (plotW / n) * (i + 0.5);
	if (axis)
		cats.forEach((c, i) =>
			kids.push(
				text(c.label, xMid(i) - textW(c.label) / 2, h - bottom + 5, {
					name: "Axis",
				}),
			),
		);

	if (kind === "bar") {
		const band = plotW / n;
		const per = stacked ? 1 : series.length;
		const barW = Math.max(2, Math.min((band * 0.7) / per, 48));
		cats.forEach((c, i) => {
			let acc = 0;
			c.vals.forEach((v, s) => {
				const base = stacked ? acc : 0;
				const to = base + v;
				if (stacked) acc = to;
				const x = stacked
					? xMid(i) - barW / 2
					: left + band * i + (band - barW * per) / 2 + barW * s;
				const yTop = Math.min(y(to), y(base));
				const hh = Math.max(1, Math.abs(y(to) - y(base)));
				kids.push({
					type: "rect",
					name: `Bar ${c.label}${series[s].name ? ` · ${series[s].name}` : ""}`,
					x: r1(x),
					y: r1(yTop),
					w: r1(barW),
					h: r1(hh),
					fill: series[s].color,
					radius: v >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4],
				});
				if (values && (!stacked || s === c.vals.length - 1))
					kids.push(
						text(
							fmt(stacked ? to : v),
							x + barW / 2 - textW(fmt(v)) / 2,
							yTop - 15,
							{ name: "Value" },
						),
					);
			});
		});
	} else {
		series.forEach((s, si) => {
			const pts = cats.map((c, i) => [
				r1(xMid(i) - left),
				r1(y(c.vals[si] ?? 0) - top),
			]);
			if (!pts.length) return;
			const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ");
			const baseY = r1(y(0) - top);
			const area =
				kind === "area"
					? `<path d="${line} L${pts[pts.length - 1][0]} ${baseY} L${pts[0][0]} ${baseY} Z" fill="${s.color}" fill-opacity="0.15"/>`
					: "";
			const dots =
				kind === "line" && pts.length <= 12
					? pts
							.map(
								(p) =>
									`<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${s.color}"/>`,
							)
							.join("")
					: "";
			kids.push({
				type: "icon",
				name: `Line${s.name ? ` ${s.name}` : ""}`,
				x: left,
				y: top,
				w: plotW,
				h: plotH,
				svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${plotW}" height="${plotH}" viewBox="0 0 ${plotW} ${plotH}" fill="none">${area}<path d="${line}" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg>`,
			});
			if (values)
				cats.forEach((c, i) => {
					const v = c.vals[si] ?? 0;
					kids.push(
						text(fmt(v), xMid(i) - textW(fmt(v)) / 2, y(v) - 18, {
							name: "Value",
						}),
					);
				});
		});
	}
	return {
		plot: { type: "frame", name: "Plot", layout: "none", w, h, children: kids },
		w,
	};
}

function horizontal(spec, { cats, series }) {
	const w = num(spec.w) > 0 ? num(spec.w) : 480;
	const rowH = 28;
	const labelW = Math.min(
		140,
		Math.max(40, ...cats.map((c) => textW(c.label, 12) + 12)),
	);
	const valueRoom = spec.values === false ? 0 : 44;
	const plotW = w - labelW - valueRoom;
	const max = niceScale(0, Math.max(...cats.map((c) => c.vals[0]), 0)).max;
	const h = Math.max(num(spec.h), cats.length * rowH);
	const kids = [];
	cats.forEach((c, i) => {
		const cy = i * rowH + rowH / 2;
		const bw = Math.max(2, (plotW * Math.max(0, c.vals[0])) / max);
		kids.push(text(c.label, 0, cy - 8, { name: "Label", fontSize: 12 }));
		kids.push({
			type: "rect",
			name: `Bar ${c.label}`,
			x: labelW,
			y: cy - 9,
			w: r1(bw),
			h: 18,
			fill: series[0].color,
			radius: [0, 4, 4, 0],
		});
		if (spec.values !== false)
			kids.push(text(fmt(c.vals[0]), labelW + bw + 8, cy - 7, { name: "Value" }));
	});
	return {
		plot: { type: "frame", name: "Plot", layout: "none", w, h, children: kids },
		w,
	};
}

// Углы секторов (градусы): сумма всегда 360, отрицательные значения — 0.
export function sectorAngles(values) {
	const vals = values.map((v) => Math.max(0, num(v)));
	const sum = vals.reduce((a, b) => a + b, 0);
	if (!sum) return vals.map(() => 0);
	return vals.map((v) => (v / sum) * 360);
}

function polar(cx, cy, r, deg) {
	const a = ((deg - 90) * Math.PI) / 180;
	return [r1(cx + r * Math.cos(a)), r1(cy + r * Math.sin(a))];
}

function pie(spec, kind, { cats }) {
	const w = num(spec.w) > 0 ? num(spec.w) : 480;
	const size = num(spec.h) > 0 ? Math.min(num(spec.h), w) : 200;
	const r = size / 2;
	const inner = kind === "donut" ? r * 0.62 : 0;
	const angles = sectorAngles(cats.map((c) => c.vals[0]));
	const total = cats.reduce((a, c) => a + Math.max(0, c.vals[0]), 0);
	const colors = cats.map((_, i) => PALETTE[i % PALETTE.length]);
	if (Array.isArray(spec.series))
		spec.series.forEach((s, i) => {
			if (typeof s?.color === "string" && i < colors.length) colors[i] = s.color;
		});
	let start = 0;
	const paths = [];
	angles.forEach((a, i) => {
		if (a <= 0) return;
		const end = start + a;
		if (a >= 359.99) {
			paths.push(
				inner
					? `<path fill-rule="evenodd" d="M${r1(2 * r)} ${r}A${r} ${r} 0 1 1 0 ${r}A${r} ${r} 0 1 1 ${r1(2 * r)} ${r}ZM${r1(r + inner)} ${r}A${r1(inner)} ${r1(inner)} 0 1 0 ${r1(r - inner)} ${r}A${r1(inner)} ${r1(inner)} 0 1 0 ${r1(r + inner)} ${r}Z" fill="${colors[i]}"/>`
					: `<circle cx="${r}" cy="${r}" r="${r}" fill="${colors[i]}"/>`,
			);
		} else {
			const large = a > 180 ? 1 : 0;
			const [x0, y0] = polar(r, r, r, start);
			const [x1, y1] = polar(r, r, r, end);
			const d = inner
				? `M${x0} ${y0}A${r} ${r} 0 ${large} 1 ${x1} ${y1}L${polar(r, r, inner, end).join(" ")}A${r1(inner)} ${r1(inner)} 0 ${large} 0 ${polar(r, r, inner, start).join(" ")}Z`
				: `M${r} ${r}L${x0} ${y0}A${r} ${r} 0 ${large} 1 ${x1} ${y1}Z`;
			paths.push(`<path d="${d}" fill="${colors[i]}"/>`);
		}
		start = end;
	});
	const legend = {
		type: "frame",
		name: "Legend",
		layout: "vertical",
		gap: 8,
		w: "hug",
		h: "hug",
		children: cats.map((c, i) => ({
			type: "frame",
			name: c.label,
			layout: "horizontal",
			gap: 8,
			w: "hug",
			h: "hug",
			cross: "center",
			children: [
				{ type: "ellipse", w: 10, h: 10, fill: colors[i] },
				{ type: "text", text: c.label, fontSize: 13, color: "#111827" },
				{
					type: "text",
					text: total
						? `${Math.round((Math.max(0, c.vals[0]) / total) * 100)}%`
						: "0%",
					fontSize: 13,
					color: MUTED,
				},
			],
		})),
	};
	return {
		row: {
			type: "frame",
			name: "Plot",
			layout: "horizontal",
			gap: 24,
			w: "hug",
			h: "hug",
			cross: "center",
			children: [
				{
					type: "icon",
					name: kind === "donut" ? "Donut" : "Pie",
					w: size,
					h: size,
					svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths.join("")}</svg>`,
				},
				legend,
			],
		},
		w,
	};
}

// Спека chart → frame. Возвращает null, если данных нет.
export function expandChart(spec) {
	const kind = KINDS.includes(spec.kind) ? spec.kind : "bar";
	const norm = normalize(spec);
	if (!norm.cats.length) return null;
	const round = kind === "pie" || kind === "donut";
	let body;
	let w;
	if (round) {
		const r = pie(spec, kind, norm);
		body = r.row;
		w = r.w;
	} else {
		const r = kind === "hbar" ? horizontal(spec, norm) : cartesian(spec, kind, norm);
		body = r.plot;
		w = r.w;
	}
	const children = [];
	if (typeof spec.title === "string" && spec.title.trim())
		children.push({
			type: "text",
			name: "Title",
			text: spec.title.trim(),
			fontSize: 14,
			fontWeight: "semibold",
			color: "#111827",
		});
	if (!round && norm.series.filter((s) => s.name).length > 1)
		children.push(legendRow(norm.series));
	children.push(body);
	return {
		type: "frame",
		name: typeof spec.name === "string" && spec.name ? spec.name : "Chart",
		layout: "vertical",
		gap: 12,
		w: round ? "hug" : w,
		h: "hug",
		x: spec.x,
		y: spec.y,
		position: spec.position,
		meta: { chart: spec },
		children,
	};
}
