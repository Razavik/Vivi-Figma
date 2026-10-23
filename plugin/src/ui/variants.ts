// Карточка «Выберите направление» после эскизов (см. server/variants.mjs).
// Эскизы лежат на холсте рядом (рамка «Directions») — карточка даёт выбор.
import { appendToFeed } from "./chat";

let card: HTMLElement | null = null;

export function dismissVariants(): void {
	card?.remove();
	card = null;
}

export function showVariants(
	labels: string[],
	onPick: (label: string) => void,
): void {
	dismissVariants();
	const root = document.createElement("div");
	root.className = "brief";
	const head = document.createElement("div");
	head.className = "brief-head";
	head.textContent = "Выберите направление — эскизы лежат на холсте рядом";
	const chips = document.createElement("div");
	chips.className = "brief-chips";
	for (const label of labels) {
		const chip = document.createElement("button");
		chip.type = "button";
		chip.className = "brief-chip";
		chip.textContent = label;
		chip.onclick = () => {
			dismissVariants();
			onPick(label);
		};
		chips.appendChild(chip);
	}
	root.append(head, chips);
	card = root;
	appendToFeed(root);
}
