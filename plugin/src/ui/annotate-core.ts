// Пометки на скриншоте: какие ноды лежат под пометкой. Чистые функции.
export type NodeBox = {
	id: string;
	name: string;
	x: number;
	y: number;
	w: number;
	h: number;
	depth: number;
};
export type Rect = { x: number; y: number; w: number; h: number };

function overlap(a: Rect, b: Rect): number {
	const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
	const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
	return w > 0 && h > 0 ? w * h : 0;
}

// Ноды под пометкой: пересечение должно закрывать заметную часть НОДЫ
// (иначе большой фон «под» любой пометкой). Сначала самые глубокие и мелкие.
export function nodesUnder(mark: Rect, nodes: NodeBox[], limit = 4): NodeBox[] {
	const share = (n: NodeBox) =>
		overlap(mark, { x: n.x, y: n.y, w: n.w, h: n.h }) / Math.max(1, n.w * n.h);
	const order = (a: NodeBox, b: NodeBox) =>
		b.depth - a.depth || a.w * a.h - b.w * b.h;
	// Нода почти целиком внутри пометки.
	const inside = nodes.filter((n) => n.w * n.h > 0 && share(n) >= 0.5).sort(order);
	if (inside.length) return inside.slice(0, limit);
	// Пометка внутри большой ноды (текст в карточке): самая мелкая из содержащих.
	const markArea = Math.max(1, mark.w * mark.h);
	return nodes
		.filter((n) => n.depth > 0 && overlap(mark, { x: n.x, y: n.y, w: n.w, h: n.h }) / markArea >= 0.8)
		.sort(order)
		.slice(0, limit);
}

export type Mark = {
	rect: Rect;
	note: string;
	/** Стрелка: острие — в rect (небольшой квадрат вокруг конца стрелки). */
	arrow?: { x1: number; y1: number; x2: number; y2: number };
};

// Квадрат вокруг острия стрелки — область, на которую она указывает.
export function tipRect(x: number, y: number, size = 32): Rect {
	return { x: x - size / 2, y: y - size / 2, w: size, h: size };
}

// Текст запроса по пометкам: номер, ноды под ней, подпись.
export function marksText(marks: Mark[], nodes: NodeBox[]): string {
	return marks
		.map((m, i) => {
			const hit = nodesUnder(m.rect, nodes);
			const where = hit.length
				? hit.map((n) => `«${n.name}» ${n.id}`).join(", ")
				: "no matching nodes";
			return `Mark ${i + 1} (red ${m.arrow ? "arrow pointing at" : "rectangle around"}): nodes [${where}]${m.note ? `; note: "${m.note}"` : ""}`;
		})
		.join("\n");
}
