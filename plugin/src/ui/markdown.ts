// Лёгкий markdown-рендерер для чата без зависимостей. Строит DOM через
// createElement/textContent (никакого innerHTML), поэтому текст модели
// не может внедрить разметку или скрипт.
// Поддержка: заголовки, **жирный**, *курсив*/_курсив_, ~~зачёркнутый~~,
// `код`, блоки ``` ```, ссылки [t](http…), списки (- * 1.), цитаты >, ---.

const INLINE_SRC =
	/(`+)([\s\S]+?)\1|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\*([^\s*][\s\S]*?)\*|(?<![\w])_([^\s_][\s\S]*?)_(?![\w])|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;

function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	parent?: Node,
	text?: string,
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (text !== undefined) node.textContent = text;
	parent?.appendChild(node);
	return node;
}

// Инлайн-разметка внутри одной строки/абзаца.
function renderInline(parent: Node, text: string): void {
	let last = 0;
	// Свой экземпляр на вызов: lastIndex общего /g-регэкспа ломался бы в рекурсии.
	const re = new RegExp(INLINE_SRC.source, "g");
	for (let m = re.exec(text); m; m = re.exec(text)) {
		if (m.index > last)
			parent.appendChild(document.createTextNode(text.slice(last, m.index)));
		if (m[2] !== undefined) {
			el("code", parent, m[2]);
		} else if (m[3] !== undefined || m[4] !== undefined) {
			renderInline(el("strong", parent), (m[3] ?? m[4]) as string);
		} else if (m[5] !== undefined) {
			renderInline(el("del", parent), m[5]);
		} else if (m[6] !== undefined || m[7] !== undefined) {
			renderInline(el("em", parent), (m[6] ?? m[7]) as string);
		} else if (m[8] !== undefined && m[9] !== undefined) {
			const a = el("a", parent);
			a.href = m[9];
			a.target = "_blank";
			a.rel = "noopener noreferrer";
			renderInline(a, m[8]);
		}
		last = m.index + m[0].length;
	}
	if (last < text.length)
		parent.appendChild(document.createTextNode(text.slice(last)));
}

const FENCE = /^\s*```/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

// Рендерит markdown в контейнер (старое содержимое заменяется).
export function renderMarkdown(container: HTMLElement, source: string): void {
	container.textContent = "";
	container.classList.add("md");
	const lines = source.replace(/\r\n?/g, "\n").split("\n");
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (!line.trim()) {
			i++;
			continue;
		}
		// Блок кода (незакрытый — до конца текста: так он выглядит и при стриме).
		if (FENCE.test(line)) {
			const body: string[] = [];
			i++;
			while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++]);
			i++;
			el("code", el("pre", container), body.join("\n"));
			continue;
		}
		const heading = line.match(HEADING);
		if (heading) {
			renderInline(el("div", container), heading[2]);
			(container.lastChild as HTMLElement).className =
				"md-h md-h" + heading[1].length;
			i++;
			continue;
		}
		if (RULE.test(line)) {
			el("hr", container);
			i++;
			continue;
		}
		if (QUOTE.test(line)) {
			const quote = el("blockquote", container);
			const parts: string[] = [];
			while (i < lines.length && QUOTE.test(lines[i]))
				parts.push((lines[i++].match(QUOTE) as RegExpMatchArray)[1]);
			renderInline(quote, parts.join(" "));
			continue;
		}
		const bullet = BULLET.test(line);
		if (bullet || ORDERED.test(line)) {
			const list = el(bullet ? "ul" : "ol", container);
			const re = bullet ? BULLET : ORDERED;
			while (i < lines.length && re.test(lines[i])) {
				renderInline(
					el("li", list),
					(lines[i++].match(re) as RegExpMatchArray)[1],
				);
			}
			continue;
		}
		// Абзац: строки до пустой или до начала другого блока.
		const para: string[] = [];
		while (
			i < lines.length &&
			lines[i].trim() &&
			!FENCE.test(lines[i]) &&
			!HEADING.test(lines[i]) &&
			!BULLET.test(lines[i]) &&
			!ORDERED.test(lines[i]) &&
			!QUOTE.test(lines[i]) &&
			!RULE.test(lines[i])
		)
			para.push(lines[i++]);
		const p = el("p", container);
		para.forEach((text, n) => {
			if (n) el("br", p);
			renderInline(p, text);
		});
	}
}
