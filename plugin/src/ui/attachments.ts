// Вложения-изображения к запросу: вставка из буфера (Ctrl+V), перетаскивание
// файла и выбор через кнопку. Картинки сжимаем (длинная сторона ≤ 1600 px),
// чтобы запрос не раздувался; в ленте чата храним только маленькие превью.

// Изображение (идёт модели как картинка) или документ (сервер достаёт из него текст).
import { fileExt, fileIcon } from "./file-icon";
import { kmeans, pixelsFromDataUrl } from "./palette";

export type Attachment =
	| {
			kind: "image";
			data: string; // base64 без префикса data:
			mimeType: "image/png" | "image/jpeg";
			thumb: string; // data URL превью для чипа и ленты
			colors?: string[]; // основные цвета картинки (k-means), hex
	  }
	| {
			kind: "file";
			data: string;
			mimeType: string;
			name: string;
	  };

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FILE_EXTENSIONS = new Set([
	"pdf", "docx", "doc", "txt", "md", "markdown", "csv", "tsv", "json",
	"html", "htm", "xml", "yaml", "yml", "rtf", "svg",
]);

const MAX_ATTACHMENTS = 4;
const MAX_SIDE = 1600;
const THUMB_SIDE = 96;

export const attachments: Attachment[] = [];

let svgCounter = 0;

// Текст — целиком SVG-документ: начинается с <svg> (допускаются XML-пролог и
// комментарии) и заканчивается </svg>. Фрагмент кода внутри обычного текста
// сюда не попадает.
export function looksLikeSvg(text: string): boolean {
	return /^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>][\s\S]*<\/svg>\s*$/i.test(
		text,
	);
}

let chipsEl: HTMLElement;
let onChange: () => void = () => {};

function drawScaled(
	bitmap: ImageBitmap,
	maxSide: number,
): HTMLCanvasElement {
	const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(bitmap.width * scale));
	canvas.height = Math.max(1, Math.round(bitmap.height * scale));
	const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
	ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	return canvas;
}

function toBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

async function loadFile(file: File): Promise<Attachment | null> {
	const ext = file.name.includes(".")
		? (file.name.split(".").pop() as string).toLowerCase()
		: "";
	if (!FILE_EXTENSIONS.has(ext) && !file.type.startsWith("text/")) return null;
	if (file.size > MAX_FILE_BYTES) return null;
	try {
		return {
			kind: "file",
			data: toBase64(await file.arrayBuffer()),
			mimeType: file.type || "application/octet-stream",
			name: file.name,
		};
	} catch {
		return null;
	}
}

async function load(file: File): Promise<Attachment | null> {
	// SVG остаётся векторной разметкой (текстом): так агент вставит его в
	// дизайн как настоящий вектор, а не как пиксели.
	const isSvg =
		file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
	if (isSvg || !file.type.startsWith("image/")) return loadFile(file);
	try {
		const bitmap = await createImageBitmap(file);
		// JPEG остаётся JPEG, всё остальное (PNG, WebP, GIF) — PNG: прозрачность и текст целы.
		const mimeType = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
		const full = drawScaled(bitmap, MAX_SIDE).toDataURL(mimeType, 0.9);
		const thumb = drawScaled(bitmap, THUMB_SIDE).toDataURL("image/jpeg", 0.7);
		bitmap.close();
		// Палитра без модели; сбой чтения пикселей не мешает вложению.
		let colors: string[] | undefined;
		try {
			colors = kmeans(await pixelsFromDataUrl(thumb), 6).map((c) => c.color);
		} catch {
			colors = undefined;
		}
		return {
			kind: "image",
			data: full.slice(full.indexOf(",") + 1),
			mimeType,
			thumb,
			colors,
		};
	} catch {
		return null;
	}
}

function render(): void {
	chipsEl.textContent = "";
	attachments.forEach((att, index) => {
		const chip = document.createElement("span");
		chip.className = "att-chip";
		const remove = document.createElement("button");
		remove.className = "att-remove";
		remove.title = "Убрать изображение";
		remove.textContent = "×";
		remove.onclick = () => {
			attachments.splice(index, 1);
			render();
			onChange();
		};
		if (att.kind === "image") {
			const img = document.createElement("img");
			img.src = att.thumb;
			img.alt = "";
			chip.appendChild(img);
		} else {
			// Документ: имя файла в чипе.
			chip.classList.add("att-file");
			chip.title = att.name;
			chip.appendChild(fileIcon(att.name));
			const label = document.createElement("span");
			label.className = "att-ext";
			label.textContent = fileExt(att.name);
			chip.appendChild(label);
		}
		chip.appendChild(remove);
		chipsEl.appendChild(chip);
	});
	chipsEl.hidden = attachments.length === 0;
}

export async function addFiles(files: Iterable<File>): Promise<void> {
	for (const file of files) {
		if (attachments.length >= MAX_ATTACHMENTS) break;
		const att = await load(file);
		if (att) attachments.push(att);
	}
	render();
	onChange();
}

// Вернуть набор вложений в поле ввода (откат к сообщению).
export function restoreAttachments(list: Attachment[]): void {
	attachments.length = 0;
	attachments.push(...list.slice(0, MAX_ATTACHMENTS));
	render();
	onChange();
}

// Лимиты хранилища плагина: одно вложение и общий объём (в символах base64).
const STORE_ITEM_LIMIT = 1_500_000;
const STORE_TOTAL_LIMIT = 3_000_000;

// Вложения по прогонам -> то, что кладём в clientStorage: свежие первыми,
// пока влезают в бюджет. Слишком большие файлы остаются только в памяти.
export function serializeAttachments(
	byRun: Map<number, Attachment[]>,
): Record<string, Attachment[]> {
	const out: Record<string, Attachment[]> = {};
	let total = 0;
	for (const runId of [...byRun.keys()].sort((a, b) => b - a)) {
		const kept = (byRun.get(runId) || []).filter(
			(a) => a.data.length <= STORE_ITEM_LIMIT,
		);
		const size = kept.reduce((n, a) => n + a.data.length, 0);
		if (!kept.length || total + size > STORE_TOTAL_LIMIT) continue;
		total += size;
		out[String(runId)] = kept;
	}
	return out;
}

export function clearAttachments(): void {
	attachments.length = 0;
	render();
	onChange();
}

export function initAttachments(opts: {
	prompt: HTMLTextAreaElement;
	composer: HTMLElement;
	chips: HTMLElement;
	button: HTMLButtonElement;
	input: HTMLInputElement;
	changed: () => void;
}): void {
	chipsEl = opts.chips;
	onChange = opts.changed;
	opts.button.onclick = () => opts.input.click();
	opts.input.onchange = () => {
		void addFiles(Array.from(opts.input.files || []));
		opts.input.value = "";
	};
	// Вставка картинки из буфера в поле ввода.
	opts.prompt.addEventListener("paste", (e) => {
		const files = Array.from(e.clipboardData?.items || [])
			.filter((item) => item.kind === "file")
			.map((item) => item.getAsFile())
			.filter((f): f is File => !!f);
		if (files.length) {
			e.preventDefault();
			void addFiles(files);
			return;
		}
		// Скопированный текст с SVG-разметкой (например «Copy as SVG» в Figma
		// или код из редактора) прикрепляем как файл .svg, а не вставляем текстом.
		const text = e.clipboardData?.getData("text/plain") || "";
		if (looksLikeSvg(text)) {
			e.preventDefault();
			svgCounter += 1;
			void addFiles([
				new File([text], `pasted-${svgCounter}.svg`, {
					type: "image/svg+xml",
				}),
			]);
		}
	});
	// Перетаскивание файлов в окно плагина.
	const hasFiles = (e: DragEvent) =>
		Array.from(e.dataTransfer?.types || []).includes("Files");
	document.addEventListener("dragover", (e) => {
		if (!hasFiles(e)) return;
		e.preventDefault();
		opts.composer.classList.add("dragging");
	});
	document.addEventListener("dragleave", (e) => {
		if (e.relatedTarget === null) opts.composer.classList.remove("dragging");
	});
	document.addEventListener("drop", (e) => {
		if (!hasFiles(e)) return;
		e.preventDefault();
		opts.composer.classList.remove("dragging");
		void addFiles(Array.from(e.dataTransfer?.files || []));
	});
}
