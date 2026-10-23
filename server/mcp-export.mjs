// MCP: запись экспортированных ассетов на диск и разбор ссылок Figma. Писать
// можно только внутри проекта агента (и папок из MCP_EXPORT_ROOTS).
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, join, resolve, sep } from "node:path";

// "12:345", "12-345" или ссылка figma.com/...?node-id=12-345 → { id, fileKey? }.
export function parseNodeRef(value) {
	const text = String(value ?? "").trim();
	if (!text) return null;
	if (/^https?:\/\//i.test(text)) {
		try {
			const url = new URL(text);
			if (!/(^|\.)figma\.com$/i.test(url.hostname)) return null;
			const raw = url.searchParams.get("node-id");
			if (!raw) return null;
			const fileKey = /\/(?:design|file|proto|board|make)\/([A-Za-z0-9]+)/.exec(url.pathname)?.[1];
			return { id: normalizeNodeId(raw), ...(fileKey ? { fileKey } : {}) };
		} catch {
			return null;
		}
	}
	const id = normalizeNodeId(text);
	return /^\d+:\d+(?:[;:]\d+)*$/.test(id) || /^I[\d:;]+$/.test(id) ? { id } : null;
}

function normalizeNodeId(raw) {
	const s = decodeURIComponent(String(raw)).trim();
	// В ссылках двоеточие заменено дефисом: 12-345 → 12:345 (вложенные id: I1-2;3-4).
	return s.replace(/-/g, ":");
}

// Все id/ссылки в аргументах → чистые id; возвращает { args, fileKey? } или { error }.
export function resolveArgs(args) {
	const out = { ...args };
	let fileKey;
	const fix = (v, name) => {
		const ref = parseNodeRef(v);
		if (!ref) throw new Error(`${name}: не похоже на id ноды или ссылку Figma с node-id: ${String(v).slice(0, 80)}`);
		if (ref.fileKey) fileKey = ref.fileKey;
		return ref.id;
	};
	try {
		if (typeof out.id === "string") out.id = fix(out.id, "id");
		if (typeof out.in === "string" && out.in) out.in = fix(out.in, "in");
		if (typeof out.parent === "string" && out.parent) out.parent = fix(out.parent, "parent");
		if (typeof out.replace === "string" && out.replace) out.replace = fix(out.replace, "replace");
		if (typeof out.after === "string" && out.after) out.after = fix(out.after, "after");
		if (Array.isArray(out.ids)) out.ids = out.ids.map((v) => fix(v, "ids"));
	} catch (err) {
		return { error: String(err.message || err) };
	}
	return { args: out, fileKey };
}

// Имя файла: латиница/цифры/кириллица, остальное — дефис.
export function safeFileName(name, id, ext) {
	const base =
		String(name || "asset")
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 60) || "asset";
	return `${base}-${String(id).replace(/[^0-9A-Za-z]+/g, "-")}.${ext}`;
}

export function safeFolder(folder) {
	const f = String(folder ?? "").trim();
	if (!f) return "";
	return /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,63}$/u.test(f) && !f.includes("..") ? f : null;
}

// Корень проекта агента: MCP_PROJECT_DIR / CLAUDE_PROJECT_DIR / cwd процесса (агент
// запускает MCP-сервер из папки открытого проекта). Корень диска и домашняя папка
// не годятся — иначе «внутри проекта» значило бы «где угодно».
export function projectRoot(env, cwd, home) {
	const raw = env.MCP_PROJECT_DIR || env.CLAUDE_PROJECT_DIR || cwd;
	if (!raw || !isAbsolute(raw)) return null;
	const root = resolve(raw);
	const norm = (p) => resolve(p).toLowerCase();
	if (root === resolve(root, "..")) return null; // корень диска
	if (home && norm(home) === root.toLowerCase()) return null;
	return root;
}

// Разрешённые корни: папка проекта (+ MCP_EXPORT_ROOTS через ; или ,). Без
// пригодного проекта — запасная папка (server/exports). defaultDir — куда писать,
// если агент не указал dir.
export function exportRoots({ project, extra, fallback }) {
	const more = String(extra ?? "")
		.split(/[;,]/)
		.map((p) => p.trim())
		.filter((p) => p && isAbsolute(p))
		.map((p) => resolve(p));
	if (!project) return { roots: [resolve(fallback), ...more], defaultDir: resolve(fallback) };
	return { roots: [project, ...more], defaultDir: join(project, "figma-exports") };
}

// Куда писать: dir (абсолютный путь внутри разрешённого корня) или defaultDir.
// Возвращает { root, folder } для saveExported либо { error }.
export function exportTarget(roots, dir, folder, defaultDir) {
	const sub = safeFolder(folder);
	if (sub === null) return { error: "folder: буквы (в т.ч. кириллица), цифры, пробел, - _ . (до 64 символов)" };
	const inside = (p) => roots.find((r) => p === r || p.startsWith(r + sep));
	if (dir === undefined || dir === null || dir === "") {
		const def = defaultDir ?? roots[0];
		return inside(def) ? { root: def, folder: sub } : { error: "папка по умолчанию вне разрешённых" };
	}
	if (typeof dir !== "string" || !isAbsolute(dir))
		return { error: "dir: нужен абсолютный путь внутри проекта, например D:/Projects/site/public/img" };
	const target = resolve(dir);
	if (!inside(target))
		return {
			error: `dir вне проекта. Разрешено писать только внутри: ${roots.join("; ")}. Другие папки можно добавить в MCP_EXPORT_ROOTS (server/.env).`,
		};
	return { root: target, folder: sub };
}

// Записывает файлы из ответа плагина; возвращает пути и метаданные без base64.
export function saveExported(root, folder, files) {
	const sub = safeFolder(folder);
	if (sub === null) throw new Error("folder: буквы (в т.ч. кириллица), цифры, пробел, - _ . (до 64 символов)");
	const dir = resolve(sub ? join(root, sub) : root);
	const base = resolve(root);
	if (dir !== base && !dir.startsWith(base + sep)) throw new Error("папка вне exports");
	mkdirSync(dir, { recursive: true });
	const saved = [];
	// Одинаковые по содержимому файлы пишутся один раз: остальные id — в sameAs.
	const seen = new Map();
	for (const f of files || []) {
		if (!f || typeof f.data !== "string") continue;
		const hash = `${f.format}:${createHash("sha1").update(f.data).digest("hex")}`;
		const first = seen.get(hash);
		if (first) {
			(first.sameAs ??= []).push(f.id);
			continue;
		}
		const ext = f.format === "jpg" ? "jpg" : f.format;
		const path = join(dir, safeFileName(f.name, f.id, ext));
		writeFileSync(path, Buffer.from(f.data, "base64"));
		const { data: _drop, ...meta } = f;
		const entry = { ...meta, path, bytes: Buffer.byteLength(f.data, "base64") };
		seen.set(hash, entry);
		saved.push(entry);
	}
	return { dir, files: saved };
}
