// Собирает server/icons/lucide.json — иконки Lucide и теги одним файлом
// (пакет lucide-static на ~60 МБ в npm-пакет не едет). Запуск: npm run build:icons
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lib = join(root, "node_modules", "lucide-static");
const icons = {};
for (const file of readdirSync(join(lib, "icons")).sort()) {
	if (!file.endsWith(".svg")) continue;
	icons[file.slice(0, -4)] = readFileSync(join(lib, "icons", file), "utf-8")
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/\s*\n\s*/g, " ")
		.replace(/\s+class="[^"]*"/g, "")
		.trim();
}
const tagsFile = join(lib, "tags.json");
const tags = existsSync(tagsFile) ? JSON.parse(readFileSync(tagsFile, "utf-8")) : {};
const out = join(root, "server", "icons", "lucide.json");
writeFileSync(out, JSON.stringify({ icons, tags }));
console.log(`lucide.json: ${Object.keys(icons).length} иконок`);
