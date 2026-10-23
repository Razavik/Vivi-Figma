// Отпечаток исходников плагина: сборка зашивает его в UI, мост считает заново
// и сравнивает — так видно, что в plugin/src правили, а npm run build не делали.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const EXT = /\.(ts|css|html)$/;

function walk(dir, out) {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (EXT.test(name)) out.push(full);
	}
}

// pluginDir — папка с src/ и manifest.json.
export function sourceHash(pluginDir) {
	const files = [];
	walk(join(pluginDir, "src"), files);
	files.push(join(pluginDir, "manifest.json"));
	const rel = files
		.map((f) => relative(pluginDir, f).split("\\").join("/"))
		.sort();
	const hash = createHash("sha1");
	for (const r of rel) {
		hash.update(r);
		hash.update("\0");
		// Переводы строк нормализуем, иначе CRLF/LF меняют хеш.
		hash.update(
			readFileSync(join(pluginDir, r), "utf8").replace(/\r\n/g, "\n"),
		);
		hash.update("\0");
	}
	return hash.digest("hex").slice(0, 12);
}
