// Кастомный выпадающий список для настроек: нативный <select> не стилизуется
// под тему плагина. Список открывается под кнопкой (или над ней, если снизу
// не хватает места) и закрывается кликом снаружи, Esc или выбором.
export interface SelectOption {
	value: string;
	label: string;
}

let openClose: (() => void) | null = null;

export function customSelect(
	options: SelectOption[],
	value: string,
	onChange: (value: string) => void,
): HTMLElement {
	const wrap = document.createElement("div");
	wrap.className = "cs";
	const button = document.createElement("button");
	button.type = "button";
	button.className = "st-input cs-button";
	const text = document.createElement("span");
	text.className = "cs-text";
	button.appendChild(text);
	button.insertAdjacentHTML(
		"beforeend",
		'<svg class="cs-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5L5 6.5L8 3.5"/></svg>',
	);
	wrap.appendChild(button);

	let current = options.some((o) => o.value === value) ? value : (options[0]?.value ?? "");
	const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? "";
	text.textContent = labelOf(current);

	let list: HTMLElement | null = null;
	const close = () => {
		list?.remove();
		list = null;
		button.classList.remove("open");
		document.removeEventListener("mousedown", outside, true);
		document.removeEventListener("keydown", onKey, true);
		if (openClose === close) openClose = null;
	};
	const outside = (e: MouseEvent) => {
		if (!list?.contains(e.target as Node) && !button.contains(e.target as Node)) close();
	};
	const onKey = (e: KeyboardEvent) => {
		if (e.key === "Escape") {
			e.stopPropagation();
			close();
		}
	};
	const open = () => {
		openClose?.();
		list = document.createElement("div");
		list.className = "cs-list";
		for (const o of options) {
			const item = document.createElement("button");
			item.type = "button";
			item.className = "dd-item" + (o.value === current ? " active" : "");
			const label = document.createElement("span");
			label.textContent = o.label;
			item.appendChild(label);
			item.insertAdjacentHTML(
				"beforeend",
				'<svg class="tick" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.5L5 9L9.5 3.5"/></svg>',
			);
			item.onclick = () => {
				current = o.value;
				text.textContent = o.label;
				close();
				onChange(o.value);
			};
			list.appendChild(item);
		}
		document.body.appendChild(list);
		const r = button.getBoundingClientRect();
		const h = Math.min(list.scrollHeight, 240);
		const below = window.innerHeight - r.bottom - 8;
		list.style.left = `${r.left}px`;
		list.style.width = `${r.width}px`;
		if (below >= h || below >= r.top) {
			list.style.top = `${r.bottom + 4}px`;
			list.style.maxHeight = `${Math.max(80, Math.min(240, below))}px`;
		} else {
			list.style.bottom = `${window.innerHeight - r.top + 4}px`;
			list.style.maxHeight = `${Math.min(240, r.top - 8)}px`;
		}
		button.classList.add("open");
		document.addEventListener("mousedown", outside, true);
		document.addEventListener("keydown", onKey, true);
		openClose = close;
		list.querySelector<HTMLElement>(".active")?.scrollIntoView({ block: "nearest" });
	};
	button.onclick = () => (list ? close() : open());
	return wrap;
}
