// Дополнительные блоки запроса: мудборд, источник стиля, режим «учитель»,
// разрешение на варианты направления. Чистые функции — проверяются тестами.

const HEX = /^#[0-9a-f]{6}$/i;

export function paletteList(raw) {
	if (!Array.isArray(raw)) return [];
	return raw.filter((c) => typeof c === "string" && HEX.test(c)).slice(0, 8).map((c) => c.toUpperCase());
}

// refMode: "mood" — мудборд (общий стиль), иначе обычный референс.
export function moodText(refMode, palette) {
	const colors = paletteList(palette);
	const found = colors.length
		? `\nColors extracted from the images by pixel analysis (use as the palette basis, adjust only for contrast): ${colors.join(", ")}.`
		: "";
	if (refMode !== "mood") return found ? `${found}\n` : "";
	return `

MOODBOARD: the attached images are INSPIRATION, not a layout to copy. Do not reproduce any single composition. Derive the shared style: a palette of 5-7 hex colors, a font pairing, corner radii, density and spacing rhythm, imagery treatment and signature techniques. Write it into "notes" as "Direction: ..." with tokens, then build the user's request in that style with your own layout and content.${found}
`;
}

const STYLE_FIELDS = ["fills", "textColors", "strokes", "fonts", "radii", "gaps", "paddings", "shadow"];

// styleSource: сводка стиля исходного блока + имена источника/цели.
export function styleSourceText(src) {
	if (!src || typeof src !== "object" || !src.style) return "";
	const style = {};
	for (const k of STYLE_FIELDS) if (src.style[k] !== undefined) style[k] = src.style[k];
	const from = String(src.from || "source").slice(0, 80);
	const to = Array.isArray(src.to) ? src.to.map((t) => String(t).slice(0, 80)).slice(0, 4) : [];
	return `

STYLE TRANSFER: take the visual style of "${from}" and apply it to ${to.length ? to.map((t) => `"${t}"`).join(", ") : "the other selected node(s)"}. Source style (extracted from the real nodes): ${JSON.stringify(style)}.
Apply it with update ops on the TARGET nodes only (the first selected node is the source — do not change it): map fills to fills, text colors to text colors, heading/body/caption fonts and sizes by role, radii, gaps and paddings, shadow and strokes. Keep the target's structure, layer names and texts unchanged. If a component instance is targeted, the plugin applies look changes to its main component.
`;
}

export function teachText(teach) {
	if (teach !== true) return "";
	return `

TEACHER MODE: do the task as usual, but your FINAL "summary" (the answer that ends the task) must be a short markdown review titled "Разбор" in the user's language: 3-6 bullets "было → стало → почему", each tied to a design rule (spacing scale, type hierarchy, contrast, grid, consistency) and to real values from the tree or the lint report. Mention layers by their Figma id in backticks (like 12:34 in single backticks) — the user can click such an id to select the layer. If the user only asks to explain, change nothing.
`;
}

export function variantsAllowedText(allow) {
	if (allow !== true) return "";
	return `

DIRECTIONS ARE ALLOWED for this task: if it is a NEW page or screen with no existing design to follow, you may first answer {"variants":[frame,frame,frame],"labels":["<name>",...],"summary":"..."} — 2-3 small hero sketches (up to ~40 nodes each, w 720) in clearly different visual directions. The user picks one; only then build the whole page in it. Do this at most once per task.
`;
}
