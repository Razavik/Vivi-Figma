// Иконка файла для чипов вложений и бабла сообщения: лист с загнутым
// уголком; цвет зависит от типа документа.
const KINDS: Record<string, string> = {
	pdf: "pdf",
	doc: "doc",
	docx: "doc",
	rtf: "doc",
	svg: "svg",
	csv: "data",
	tsv: "data",
	json: "data",
	xml: "data",
	yaml: "data",
	yml: "data",
};

const SVG = `<svg width="12" height="14" viewBox="0 0 12 14" fill="none" aria-hidden="true"><path d="M2 1h5l3.5 3.5V12a1 1 0 01-1 1h-7.5a1 1 0 01-1-1V2a1 1 0 011-1z" fill="currentColor" fill-opacity="0.16" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M7 1v3.5h3.5" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M3.5 8h5M3.5 10.2h3.2" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>`;

// Расширение для подписи на плитке: «PDF», «DOCX», «SVG»… (до 4 символов).
export function fileExt(name: string): string {
	const dot = name.lastIndexOf(".");
	return dot < 0 ? "FILE" : name.slice(dot + 1, dot + 5).toUpperCase() || "FILE";
}

export function fileKind(name: string): string {
	const dot = name.lastIndexOf(".");
	const ext = dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
	return KINDS[ext] || "text";
}

// Элемент-иконка; класс file-icon--<тип> задаёт цвет в CSS.
export function fileIcon(name: string): HTMLElement {
	const el = document.createElement("span");
	el.className = `file-icon file-icon--${fileKind(name)}`;
	el.innerHTML = SVG;
	return el;
}
