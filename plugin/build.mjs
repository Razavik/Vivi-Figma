// Сборка плагина: code.ts -> dist/code.js, ui.ts инлайнится в dist/ui.html
// (Figma требует, чтобы UI был одним самодостаточным html-файлом).
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

mkdirSync("dist", { recursive: true });

// Идентификатор сборки: хэш исходников main-кода. Зашивается в code.js (figma_status отдаёт его)
// и пишется в dist/build-id.txt — сервер сверяет и предупреждает, что плагин в Figma устарел.
function sourceFiles(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sourceFiles(join(dir, e.name)) : /\.(ts|mjs)$/.test(e.name) ? [join(dir, e.name)] : []));
}
const hash = createHash("sha1");
for (const file of [...sourceFiles("src/main"), "src/spec.ts"].sort()) hash.update(file).update(readFileSync(file));
const BUILD_ID = hash.digest("hex").slice(0, 10);
writeFileSync("dist/build-id.txt", BUILD_ID);

await build({
	entryPoints: ["src/main/code.ts"],
	bundle: true,
	format: "iife",
	target: "es2020",
	outfile: "dist/code.js",
	define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
	logLevel: "info",
});

const uiResult = await build({
	entryPoints: ["src/ui/ui.ts"],
	bundle: true,
	format: "iife",
	target: "es2020",
	write: false,
	logLevel: "info",
});

const uiJs = uiResult.outputFiles[0].text;
const uiCss = readFileSync("src/ui/ui.css", "utf8");
const html = readFileSync("src/ui/ui.html", "utf8")
	.replace('<link rel="stylesheet" href="./ui.css" />', () => `<style>\n${uiCss}\n</style>`)
	.replace('<script src="./ui.js"></script>', () => `<script>\n${uiJs}\n</script>`);
writeFileSync("dist/ui.html", html);
console.log("dist/ собран");
