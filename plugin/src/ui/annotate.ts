// Правка по скриншоту с пометками: окно с картинкой выделенного фрейма,
// красные рамки и стрелки с подписями. Результат — картинка-вложение и текст
// с нодами под каждой пометкой (annotate-core.ts).
import { addFiles } from "./attachments";
import { marksText, tipRect, type Mark, type NodeBox } from "./annotate-core";

type Data = {
	error?: string;
	name?: string;
	width?: number;
	height?: number;
	image?: string;
	nodes?: NodeBox[];
};
type Ready = Required<Pick<Data, "image" | "width" | "height">> & Data;
type Pt = { x: number; y: number };

const MAX_MARKS = 8;
const RED = "#E5252A";

let btn: HTMLButtonElement;
let prompt: HTMLTextAreaElement;
let overlay: HTMLElement | null = null;

export function setAnnotateVisible(visible: boolean): void {
	if (btn) btn.hidden = !visible;
}

export function initAnnotate(button: HTMLButtonElement, promptEl: HTMLTextAreaElement): void {
	btn = button;
	prompt = promptEl;
	btn.onclick = () => {
		btn.disabled = true;
		parent.postMessage({ pluginMessage: { type: "annotate_request" } }, "*");
	};
}

export function onAnnotateData(data: Data): void {
	btn.disabled = false;
	if (data.error || !data.image || !data.width || !data.height) {
		prompt.placeholder = data.error || "Не удалось получить скриншот";
		return;
	}
	open(data as Ready);
}

function button(text: string, cls = ""): HTMLButtonElement {
	const b = document.createElement("button");
	b.type = "button";
	b.textContent = text;
	if (cls) b.className = cls;
	return b;
}

function open(data: Ready): void {
	overlay?.remove();
	const root = document.createElement("div");
	root.className = "annotate";
	const hint = document.createElement("div");
	hint.className = "annotate-hint";
	hint.textContent = "Обведите места, которые нужно изменить, или укажите на них стрелкой, и подпишите";
	const stage = document.createElement("div");
	stage.className = "annotate-stage";
	const canvas = document.createElement("canvas");
	stage.appendChild(canvas);
	const list = document.createElement("div");
	list.className = "annotate-list";

	const toolRect = button("▭ Рамка");
	const toolArrow = button("➚ Стрелка");
	const undo = button("Отменить");
	const cancel = button("Закрыть");
	const done = button("Готово", "brief-ok");
	const actions = document.createElement("div");
	actions.className = "annotate-actions";
	actions.append(toolRect, toolArrow, undo, cancel, done);
	root.append(hint, stage, list, actions);
	document.body.appendChild(root);
	overlay = root;

	let tool: "rect" | "arrow" = "rect";
	const setTool = (t: "rect" | "arrow"): void => {
		tool = t;
		toolRect.classList.toggle("on", t === "rect");
		toolArrow.classList.toggle("on", t === "arrow");
	};
	toolRect.onclick = () => setTool("rect");
	toolArrow.onclick = () => setTool("arrow");
	setTool("rect");

	const img = new Image();
	img.src = `data:image/png;base64,${data.image}`;
	const marks: Mark[] = [];
	const notes: HTMLInputElement[] = [];
	let start: Pt | null = null;
	let cursor: Pt | null = null;

	// Рисует картинку и пометки (координаты пометок — в пикселях фрейма).
	const redraw = (target: HTMLCanvasElement = canvas): void => {
		const ctx = target.getContext("2d") as CanvasRenderingContext2D;
		ctx.drawImage(img, 0, 0, target.width, target.height);
		const k = target.width / data.width;
		ctx.strokeStyle = RED;
		ctx.lineWidth = 2;
		ctx.font = "bold 13px sans-serif";
		const badge = (x: number, y: number, n: number): void => {
			ctx.fillStyle = RED;
			ctx.fillRect(x, y - 16, 18, 16);
			ctx.fillStyle = "#fff";
			ctx.fillText(String(n), x + 5, y - 4);
		};
		const all: { rect?: Mark["rect"]; arrow?: Mark["arrow"] }[] = marks.map((m) => ({
			rect: m.arrow ? undefined : m.rect,
			arrow: m.arrow,
		}));
		if (start && cursor) {
			if (tool === "arrow")
				all.push({ arrow: { x1: start.x, y1: start.y, x2: cursor.x, y2: cursor.y } });
			else
				all.push({
					rect: {
						x: Math.min(start.x, cursor.x),
						y: Math.min(start.y, cursor.y),
						w: Math.abs(cursor.x - start.x),
						h: Math.abs(cursor.y - start.y),
					},
				});
		}
		all.forEach((m, i) => {
			if (m.rect) {
				ctx.strokeRect(m.rect.x * k, m.rect.y * k, m.rect.w * k, m.rect.h * k);
				badge(m.rect.x * k, m.rect.y * k, i + 1);
			} else if (m.arrow) {
				const { x1, y1, x2, y2 } = m.arrow;
				const ang = Math.atan2(y2 - y1, x2 - x1);
				ctx.beginPath();
				ctx.moveTo(x1 * k, y1 * k);
				ctx.lineTo(x2 * k, y2 * k);
				for (const s of [-1, 1]) {
					ctx.moveTo(x2 * k, y2 * k);
					ctx.lineTo(
						x2 * k - 12 * Math.cos(ang + s * 0.45),
						y2 * k - 12 * Math.sin(ang + s * 0.45),
					);
				}
				ctx.stroke();
				badge(x1 * k - 9, y1 * k, i + 1);
			}
		});
	};

	img.onload = () => {
		const scale = Math.min(1, 380 / data.width);
		canvas.width = Math.round(data.width * scale);
		canvas.height = Math.round(data.height * scale);
		redraw();
	};

	const toFrame = (e: PointerEvent): Pt => {
		const b = canvas.getBoundingClientRect();
		return {
			x: ((e.clientX - b.left) / b.width) * data.width,
			y: ((e.clientY - b.top) / b.height) * data.height,
		};
	};
	const addRow = (): void => {
		const row = document.createElement("label");
		row.className = "annotate-row";
		const input = document.createElement("input");
		input.type = "text";
		input.placeholder = `Пометка ${marks.length}: что изменить`;
		input.maxLength = 160;
		notes.push(input);
		row.append(`${marks.length}`, input);
		list.appendChild(row);
		input.focus();
	};

	canvas.onpointerdown = (e) => {
		if (marks.length >= MAX_MARKS) return;
		canvas.setPointerCapture(e.pointerId);
		start = toFrame(e);
		cursor = start;
	};
	canvas.onpointermove = (e) => {
		if (!start) return;
		cursor = toFrame(e);
		redraw();
	};
	canvas.onpointerup = () => {
		if (start && cursor) {
			const len = Math.hypot(cursor.x - start.x, cursor.y - start.y);
			if (tool === "arrow" && len > 12) {
				marks.push({
					rect: tipRect(cursor.x, cursor.y),
					note: "",
					arrow: { x1: start.x, y1: start.y, x2: cursor.x, y2: cursor.y },
				});
				addRow();
			} else if (
				tool === "rect" &&
				Math.abs(cursor.x - start.x) > 6 &&
				Math.abs(cursor.y - start.y) > 6
			) {
				marks.push({
					rect: {
						x: Math.min(start.x, cursor.x),
						y: Math.min(start.y, cursor.y),
						w: Math.abs(cursor.x - start.x),
						h: Math.abs(cursor.y - start.y),
					},
					note: "",
				});
				addRow();
			}
		}
		start = null;
		cursor = null;
		redraw();
	};
	undo.onclick = () => {
		marks.pop();
		notes.pop();
		list.lastElementChild?.remove();
		redraw();
	};
	const close = (): void => {
		root.remove();
		overlay = null;
	};
	cancel.onclick = close;
	done.onclick = () => {
		if (!marks.length) {
			hint.textContent = "Сначала обведите или укажите стрелкой хотя бы одно место";
			return;
		}
		marks.forEach((m, i) => (m.note = notes[i].value.trim()));
		// Итоговая картинка в разрешении экспорта — пометки читаются.
		const out = document.createElement("canvas");
		out.width = img.naturalWidth;
		out.height = img.naturalHeight;
		redraw(out);
		out.toBlob((blob) => {
			if (blob) void addFiles([new File([blob], "marks.png", { type: "image/png" })]);
			const intro = `Исправь помеченные места на скриншоте «${data.name ?? ""}» (красные рамки и стрелки с номерами).`;
			prompt.value = `${intro}\n${marksText(marks, data.nodes ?? [])}\n${prompt.value}`.trim();
			prompt.dispatchEvent(new Event("input"));
			prompt.focus();
			close();
		}, "image/png");
	};
}
