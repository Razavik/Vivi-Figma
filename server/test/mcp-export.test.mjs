import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseNodeRef, resolveArgs, safeFileName, safeFolder, saveExported } from "../mcp-export.mjs";

test("parseNodeRef: id, id с дефисом и ссылка Figma", () => {
	assert.deepEqual(parseNodeRef("12:345"), { id: "12:345" });
	assert.deepEqual(parseNodeRef("12-345"), { id: "12:345" });
	assert.deepEqual(parseNodeRef("https://www.figma.com/design/AbC123/Name?node-id=12-345&t=x"), { id: "12:345", fileKey: "AbC123" });
	assert.deepEqual(parseNodeRef("https://figma.com/file/KEY9/N?node-id=1%3A2"), { id: "1:2", fileKey: "KEY9" });
	assert.equal(parseNodeRef("https://evil.com/design/K/N?node-id=1-2"), null);
	assert.equal(parseNodeRef("https://figma.com/design/K/N"), null);
	assert.equal(parseNodeRef("hello"), null);
	assert.equal(parseNodeRef(""), null);
});

test("resolveArgs: чистит id, in и ids, ловит мусор и запоминает ключ файла", () => {
	const r = resolveArgs({ id: "https://figma.com/design/K1/N?node-id=3-4", ids: ["1-2", "5:6"], in: "7-8", scale: 2 });
	assert.deepEqual(r.args, { id: "3:4", ids: ["1:2", "5:6"], in: "7:8", scale: 2 });
	assert.equal(r.fileKey, "K1");
	assert.match(resolveArgs({ ids: ["не id"] }).error, /не похоже/);
});

test("имена файлов и папок: безопасные, без выхода за каталог", () => {
	assert.equal(safeFileName("Hero Фото / 1", "12:3", "png"), "hero-фото-1-12-3.png");
	assert.equal(safeFileName("", "1:2", "svg"), "asset-1-2.svg");
	assert.equal(safeFolder(""), "");
	assert.equal(safeFolder("my-project_1"), "my-project_1");
	for (const bad of ["../x", "a/b", "a\\b", "..", ".hidden", "x".repeat(70)]) assert.equal(safeFolder(bad), null);
});

test("saveExported: пишет в корень и подпапку, base64 не возвращает, чужую папку отвергает", () => {
	const root = mkdtempSync(join(tmpdir(), "vivi-exp-"));
	try {
		const files = [{ id: "1:2", name: "Logo", format: "svg", data: Buffer.from("<svg/>").toString("base64"), width: 10, height: 10 }];
		const res = saveExported(root, "site", files);
		assert.equal(res.files.length, 1);
		assert.equal(res.files[0].data, undefined);
		assert.equal(readFileSync(res.files[0].path, "utf8"), "<svg/>");
		assert.ok(res.files[0].path.startsWith(join(root, "site")));
		assert.throws(() => saveExported(root, "../out", files), /folder/);
		assert.equal(existsSync(join(root, "..", "out")), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("saveExported: одинаковые файлы пишутся один раз, остальные id — в sameAs", () => {
	const root = mkdtempSync(join(tmpdir(), "vivi-exp-"));
	try {
		const same = Buffer.from("PNGDATA").toString("base64");
		const other = Buffer.from("OTHER").toString("base64");
		const files = [
			{ id: "1:1", name: "Check", format: "png", data: same },
			{ id: "1:2", name: "Check", format: "png", data: same },
			{ id: "1:3", name: "Check", format: "svg", data: same },
			{ id: "1:4", name: "Photo", format: "png", data: other },
		];
		const res = saveExported(root, "", files);
		assert.equal(res.files.length, 3);
		assert.deepEqual(res.files[0].sameAs, ["1:2"]);
		assert.equal(res.files[1].sameAs, undefined); // другой формат — отдельный файл
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("projectRoot: из env или cwd; корень диска и домашняя папка не годятся", async () => {
	const { projectRoot } = await import("../mcp-export.mjs");
	// Пути под платформу: на Windows абсолютные — D:/…, в CI (Linux) — /…
	const win = process.platform === "win32";
	const P = (p) => (win ? p : p === "D:/" ? "/" : p.replace(/^D:/, "/srv").replace(/^C:/, "/home/u").replace(/^E:/, "/mnt/e"));
	assert.ok(projectRoot({}, P("D:/Projects/site"), P("C:/Users/me")).replaceAll("\\", "/").endsWith("Projects/site"));
	assert.ok(projectRoot({ MCP_PROJECT_DIR: P("D:/A/b") }, P("D:/other"), P("C:/Users/me")).replaceAll("\\", "/").endsWith("A/b"));
	assert.ok(projectRoot({ CLAUDE_PROJECT_DIR: P("D:/C/d") }, P("D:/other"), P("C:/Users/me")).replaceAll("\\", "/").endsWith("C/d"));
	assert.equal(projectRoot({}, P("D:/"), P("C:/Users/me")), null);
	assert.equal(projectRoot({}, P("C:/Users/me"), P("C:/Users/me")), null);
	assert.equal(projectRoot({}, "relative", P("C:/Users/me")), null);
	assert.equal(projectRoot({}, "", P("C:/Users/me")), null);
});

test("exportTarget: только внутри проекта и дополнительных корней", async () => {
	const { exportRoots, exportTarget, projectRoot } = await import("../mcp-export.mjs");
	const win = process.platform === "win32";
	const P = (p) => (win ? p : p === "D:/" ? "/" : p.replace(/^D:/, "/srv").replace(/^C:/, "/home/u").replace(/^E:/, "/mnt/e"));
	const project = projectRoot({}, P("D:/Projects/site"), P("C:/Users/me"));
	const { roots, defaultDir } = exportRoots({ project, extra: `${P("E:/other")}; relative/dir`, fallback: P("D:/app/exports") });
	assert.equal(roots.length, 2); // проект + E:/other (относительный путь отброшен)
	assert.ok(defaultDir.replaceAll("\\", "/").endsWith("Projects/site/figma-exports"));
	assert.deepEqual(exportTarget(roots, undefined, "x", defaultDir), { root: defaultDir, folder: "x" });
	const ok = exportTarget(roots, P("D:/Projects/site/public/img"), "", defaultDir);
	assert.equal(ok.error, undefined);
	assert.ok(ok.root.replaceAll("\\", "/").endsWith("site/public/img"));
	assert.equal(exportTarget(roots, P("D:/Projects/site"), "", defaultDir).error, undefined); // сам корень проекта
	assert.equal(exportTarget(roots, P("E:/other/img"), "", defaultDir).error, undefined);
	assert.match(exportTarget(roots, P("D:/Projects/other-project"), "", defaultDir).error, /вне проекта/);
	assert.match(exportTarget(roots, P("D:/Projects/site/../secret"), "", defaultDir).error, /вне проекта/);
	assert.match(exportTarget(roots, P("D:/Projects/site-evil"), "", defaultDir).error, /вне проекта/); // префикс-ловушка
	assert.match(exportTarget(roots, P("C:/Windows"), "", defaultDir).error, /вне проекта/);
	assert.match(exportTarget(roots, "public/img", "", defaultDir).error, /абсолютный/);
	assert.match(exportTarget(roots, P("D:/Projects/site"), "../x", defaultDir).error, /folder/);
});

test("без пригодного проекта — запасная папка", async () => {
	const { exportRoots, exportTarget } = await import("../mcp-export.mjs");
	const win = process.platform === "win32";
	const fb = win ? "D:/app/exports" : "/srv/app/exports";
	const { roots, defaultDir } = exportRoots({ project: null, extra: "", fallback: fb });
	assert.equal(roots.length, 1);
	assert.equal(exportTarget(roots, undefined, "", defaultDir).root, defaultDir);
	assert.match(exportTarget(roots, win ? "D:/anything" : "/srv/anything", "", defaultDir).error, /вне проекта/);
});
