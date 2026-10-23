// Варианты направления: модель отвечает {"variants":[frame,...],"labels":[...]}
// — 2–3 небольших эскиза. Собираем их в одну рамку «Directions» в ряд, чтобы
// пользователь выбрал направление, а остальное строилось в выбранном.
const MAX_VARIANTS = 3;
const GAP = 80;

const clean = (v, max) =>
	typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

// → { wrapper, labels } или null, если пригодных эскизов меньше двух.
export function variantsWrapper(spec) {
	if (!spec || !Array.isArray(spec.variants)) return null;
	const labels = [];
	const frames = [];
	for (const item of spec.variants) {
		if (!item || typeof item !== "object" || item.type !== "frame") continue;
		const i = frames.length;
		const label =
			clean(Array.isArray(spec.labels) ? spec.labels[i] : "", 40) ||
			clean(item.name, 40) ||
			`Вариант ${i + 1}`;
		labels.push(label);
		frames.push({ ...item, name: `Direction: ${label}` });
		if (frames.length >= MAX_VARIANTS) break;
	}
	if (frames.length < 2) return null;
	return {
		labels,
		wrapper: {
			type: "frame",
			name: "Directions",
			layout: "horizontal",
			gap: GAP,
			padding: 0,
			w: "hug",
			h: "hug",
			summary: clean(spec.summary, 300) || undefined,
			children: frames,
		},
	};
}
