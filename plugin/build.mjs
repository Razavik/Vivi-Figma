// Сборка плагина: code.ts -> dist/code.js, ui.ts инлайнится в dist/ui.html
// (Figma требует, чтобы UI был одним самодостаточным html-файлом).
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

mkdirSync("dist", { recursive: true });

await build({
	entryPoints: ["src/main/code.ts"],
	bundle: true,
	format: "iife",
	target: "es2020",
	outfile: "dist/code.js",
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
