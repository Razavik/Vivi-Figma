// Запуск тестов: собираем *.test.ts через esbuild (в плагине TS и импорты
// без расширений) и гоняем встроенным node --test.
import { build } from "esbuild";
import { readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const out = ".test-build";
rmSync(out, { recursive: true, force: true });
const entries = readdirSync("test")
	.filter((f) => f.endsWith(".test.ts"))
	.map((f) => `test/${f}`);
await build({
	entryPoints: entries,
	bundle: true,
	platform: "node",
	format: "esm",
	outdir: out,
	outExtension: { ".js": ".mjs" },
	logLevel: "error",
});
const result = spawnSync(process.execPath, ["--test", out], { stdio: "inherit" });
process.exit(result.status ?? 1);
