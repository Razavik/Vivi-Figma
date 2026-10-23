// Кнопки быстрых действий под «Итогом» (логика выбора — quick-core.ts).
import { appendToFeed } from "./chat";

let row: HTMLElement | null = null;

export function clearQuick(): void {
	row?.remove();
	row = null;
}

export function showQuick(
	actions: string[],
	onPick: (action: string) => void,
): void {
	clearQuick();
	if (!actions.length) return;
	const box = document.createElement("div");
	box.className = "quick";
	for (const action of actions) {
		const chip = document.createElement("button");
		chip.type = "button";
		chip.className = "quick-chip";
		chip.textContent = action;
		chip.onclick = () => {
			clearQuick();
			onPick(action);
		};
		box.appendChild(chip);
	}
	row = box;
	appendToFeed(box);
}
