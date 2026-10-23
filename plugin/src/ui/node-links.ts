// Ссылки на слои в тексте ответа: id в обратных кавычках (`1:23`) становятся
// кнопками — клик выделяет слой на холсте. Только <code> целиком из id Figma,
// поэтому «10:30» в обычном тексте ссылкой не станет.
const ID = /^\d{1,7}:\d{1,7}$/;

export function isNodeId(text: string): boolean {
	return ID.test(text.trim());
}

export function linkNodeIds(root: HTMLElement): void {
	for (const code of Array.from(root.querySelectorAll("code"))) {
		const id = (code.textContent || "").trim();
		if (!isNodeId(id)) continue;
		code.classList.add("node-link");
		code.title = "Выделить слой";
		code.onclick = () =>
			parent.postMessage({ pluginMessage: { type: "select_node", id } }, "*");
	}
}
