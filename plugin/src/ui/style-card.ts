// Плашка «Стиль» после мудборда: направление и образцы цветов из notes модели.
import { appendToFeed } from "./chat";
import { styleFromNotes } from "./ref-mode";

let card: HTMLElement | null = null;

export function clearStyleCard(): void {
	card?.remove();
	card = null;
}

export function showStyleCard(notes: string): boolean {
	const style = styleFromNotes(notes);
	if (!style) return false;
	clearStyleCard();
	const root = document.createElement("div");
	root.className = "brief style-card";
	const head = document.createElement("div");
	head.className = "brief-head";
	head.textContent = `Стиль: ${style.direction}`;
	root.appendChild(head);
	if (style.colors.length) {
		const row = document.createElement("div");
		row.className = "swatches";
		for (const c of style.colors) {
			const sw = document.createElement("span");
			sw.className = "swatch";
			sw.style.background = c;
			sw.title = c;
			row.appendChild(sw);
		}
		root.appendChild(row);
	}
	card = root;
	appendToFeed(root);
	return true;
}
