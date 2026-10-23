// Вложенные документы: достаём из них текст, и он идёт модели как часть
// запроса. PDF — через unpdf, DOCX — через mammoth, остальное — текстовые
// форматы. Картинки сюда не попадают (они идут отдельными image-блоками).
import { createHash } from "node:crypto";

export const MAX_FILES = 3;
export const MAX_FILE_BASE64 = 14_000_000; // ≈ 10 МБ файла

const TEXT_EXTENSIONS = new Set([
	"txt",
	"md",
	"markdown",
	"csv",
	"tsv",
	"json",
	"html",
	"htm",
	"xml",
	"yaml",
	"yml",
	"rtf",
	"svg",
]);

// Максимум для SVG: обрезанная разметка невалидна, поэтому такие файлы
// не режем, а отклоняем.
const MAX_SVG_CHARS = 40000;

// Из SVG убираем то, что раздувает запрос и не нужно для вставки:
// пролог, комментарии, метаданные и встроенные растры (base64).
function tidySvg(svg) {
	return String(svg)
		.replace(/<\?xml[\s\S]*?\?>/gi, "")
		.replace(/<!DOCTYPE[\s\S]*?>/gi, "")
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/<metadata[\s\S]*?<\/metadata>/gi, "")
		.replace(/<(title|desc)\b[\s\S]*?<\/\1>/gi, "")
		.replace(/(href|xlink:href)="data:[^"]*"/gi, '$1="[embedded bitmap removed]"')
		.replace(/\s{2,}/g, " ")
		.trim();
}

// Один и тот же файл уходит в каждом раунде прогона — разбираем его один раз.
const cache = new Map();
const CACHE_LIMIT = 20;

function extensionOf(name) {
	const dot = String(name).lastIndexOf(".");
	return dot < 0 ? "" : String(name).slice(dot + 1).toLowerCase();
}

function tidy(text) {
	return String(text)
		.replace(/\r\n?/g, "\n")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

async function extractPdf(buffer) {
	const { extractText, getDocumentProxy } = await import("unpdf");
	const pdf = await getDocumentProxy(new Uint8Array(buffer));
	const { text } = await extractText(pdf, { mergePages: true });
	return text;
}

async function extractDocx(buffer) {
	const mammoth = (await import("mammoth")).default;
	const { value } = await mammoth.extractRawText({ buffer });
	return value;
}

function extractPlain(buffer) {
	const text = buffer.toString("utf-8");
	// NUL-байты — признак бинарного файла, а не текста.
	if (text.includes("\u0000")) throw new Error("файл не текстовый");
	return text;
}

// Возвращает полный текст файла. Бросает Error с понятным сообщением.
async function extractOne(file) {
	const buffer = Buffer.from(file.data, "base64");
	const ext = extensionOf(file.name);
	const mime = String(file.mimeType || "");
	let text;
	if (ext === "pdf" || mime === "application/pdf") {
		text = await extractPdf(buffer);
	} else if (
		ext === "docx" ||
		mime.includes("wordprocessingml.document")
	) {
		text = await extractDocx(buffer);
	} else if (ext === "doc") {
		throw new Error("формат .doc не поддерживается — сохраните как .docx или PDF");
	} else if (ext === "svg" || mime === "image/svg+xml") {
		text = tidySvg(extractPlain(buffer));
		if (!/<svg[\s>]/i.test(text)) throw new Error("это не SVG-разметка");
		if (text.length > MAX_SVG_CHARS)
			throw new Error("SVG слишком большой (упростите или экспортируйте иконку отдельно)");
	} else if (TEXT_EXTENSIONS.has(ext) || mime.startsWith("text/")) {
		text = extractPlain(buffer);
	} else {
		throw new Error(`формат .${ext || "?"} не поддерживается`);
	}
	text = tidy(text);
	if (!text) throw new Error("в файле не найдено текста (скан или картинка?)");
	return text;
}

// files: [{ name, mimeType, data(base64) }]. Возвращает документы с текстом,
// обрезанным до maxChars, и список ошибок по нечитаемым файлам.
export async function extractFiles(files, maxChars = 60000) {
	const docs = [];
	const errors = [];
	for (const file of files.slice(0, MAX_FILES)) {
		const name = typeof file?.name === "string" ? file.name : "файл";
		if (typeof file?.data !== "string" || !file.data) {
			errors.push({ name, error: "пустой файл" });
			continue;
		}
		if (file.data.length > MAX_FILE_BASE64) {
			errors.push({ name, error: "файл больше 10 МБ" });
			continue;
		}
		const key = createHash("sha1").update(file.data).digest("hex");
		try {
			let text = cache.get(key);
			if (text === undefined) {
				text = await extractOne({ ...file, name });
				cache.set(key, text);
				if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
			}
			docs.push({
				name,
				// SVG целиком или никак: обрезанная разметка бесполезна.
				text:
					text.length > maxChars && extensionOf(name) !== "svg"
						? text.slice(0, maxChars)
						: text,
				truncated: text.length > maxChars && extensionOf(name) !== "svg",
				isSvg: extensionOf(name) === "svg",
				chars: text.length,
			});
		} catch (err) {
			errors.push({ name, error: String(err?.message || err) });
		}
	}
	return { docs, errors };
}
