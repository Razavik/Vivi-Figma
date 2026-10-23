// Таблицы: {"type":"table",...} → вертикальный frame строк (см. charts.mjs).
const BORDER = "#E5E7EB";
const NUMERIC = /^[+\-−]?\s?[\d\s.,]+\s?(%|₽|\$|€|руб\.?|K|M)?$/;
const MAX_ROWS = 100;
const MAX_COLS = 12;

const cell = (v) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 200);

// Числовая колонка (все непустые ячейки — числа/суммы/проценты) → вправо.
export function isNumericColumn(rows, index) {
	const cells = rows.map((r) => cell(r[index])).filter(Boolean);
	return cells.length > 0 && cells.every((c) => NUMERIC.test(c));
}

export function expandTable(spec) {
	const cols = (Array.isArray(spec.columns) ? spec.columns : [])
		.slice(0, MAX_COLS)
		.map((c) => (typeof c === "string" ? { title: c } : c || {}));
	const rows = (Array.isArray(spec.rows) ? spec.rows : [])
		.slice(0, MAX_ROWS)
		.filter(Array.isArray);
	if (!cols.length || !rows.length) return null;
	const header = spec.header !== false;
	const padV = spec.dense === true ? 8 : 12;
	const aligns = cols.map((c, i) =>
		["left", "center", "right"].includes(c.align)
			? c.align
			: isNumericColumn(rows, i)
				? "right"
				: "left",
	);
	const cellOf = (value, i, head) => ({
		type: "frame",
		name: head ? "Head cell" : "Cell",
		layout: "horizontal",
		w: typeof cols[i].w === "number" ? cols[i].w : "fill",
		h: "hug",
		align: aligns[i] === "right" ? "end" : aligns[i] === "center" ? "center" : "start",
		children: [
			head
				? {
						type: "text",
						text: cell(value),
						fontSize: 12,
						fontWeight: "semibold",
						color: "#6B7280",
						textCase: "upper",
						letterSpacing: "4%",
					}
				: { type: "text", text: cell(value), fontSize: 14, color: "#111827" },
		],
	});
	const rowFrame = (values, name, extra) => ({
		type: "frame",
		name,
		layout: "horizontal",
		gap: 16,
		padding: [padV, 16],
		cross: "center",
		w: "fill",
		h: "hug",
		...(spec.dividers !== false
			? { stroke: BORDER, strokeWidth: 1, strokeSides: "bottom" }
			: {}),
		...extra,
		children: cols.map((_, i) => cellOf(values[i], i, name === "Header")),
	});
	const children = [];
	if (header)
		children.push(
			rowFrame(
				cols.map((c) => c.title),
				"Header",
				{ fill: "#F9FAFB" },
			),
		);
	rows.forEach((r, i) =>
		children.push(
			rowFrame(r, `Row ${i + 1}`, spec.zebra && i % 2 ? { fill: "#F9FAFB" } : {}),
		),
	);
	return {
		type: "frame",
		name: typeof spec.name === "string" && spec.name ? spec.name : "Table",
		layout: "vertical",
		w: spec.w ?? "fill",
		h: "hug",
		x: spec.x,
		y: spec.y,
		position: spec.position,
		meta: { table: spec },
		children,
	};
}
