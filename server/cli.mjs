#!/usr/bin/env node
// Точка входа пакета vivi-figma-mcp.
//   vivi-figma-mcp          — MCP-сервер (stdio), его запускает MCP-клиент
//   vivi-figma-mcp plugin   — путь к manifest.json плагина Figma (для импорта)
//   vivi-figma-mcp bridge   — запустить мост в фоне
import { cpSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cmd = process.argv[2];

if (cmd === "plugin") {
	// Копия в постоянную папку: кэш npx может очиститься, и плагин в Figma перестал бы открываться.
	const dest = join(homedir(), ".vivi-figma", "plugin");
	mkdirSync(dest, { recursive: true });
	cpSync(join(root, "plugin", "manifest.json"), join(dest, "manifest.json"));
	cpSync(join(root, "plugin", "dist"), join(dest, "dist"), { recursive: true });
	console.log(`Плагин Figma: ${join(dest, "manifest.json")}
`);
	console.log("Figma → Plugins → Development → Import plugin from manifest… → выбрать этот файл (один раз).");
	console.log("Дальше в нужном файле: Plugins → Development → Vivi MCP, окно оставить открытым.");
	console.log("После обновления пакета повторите эту команду — файлы плагина обновятся на месте.");
} else if (cmd === "bridge") {
	if (process.argv.includes("--foreground")) await import("./index.mjs");
	else {
		try {
			const { ensureBridge } = await import("./bridge-start.mjs");
			const result = await ensureBridge();
			console.log(`Мост ${result.started ? "запущен в фоне" : "уже работает"}: ws://localhost:${result.port}`);
			console.log("Терминал можно закрыть. Откройте плагин Vivi MCP в Figma.");
			console.log(`Лог: ${result.logFile}`);
		} catch (err) {
			console.error(String(err?.message || err));
			process.exitCode = 1;
		}
	}
} else if (cmd === "--help" || cmd === "-h") {
	console.log("vivi-figma-mcp [plugin|bridge]\n  (без аргументов) MCP-сервер по stdio\n  plugin   путь к manifest.json плагина\n  bridge   запустить мост в фоне (терминал можно закрыть)\n  bridge --foreground   запустить в текущем терминале для отладки");
} else {
	await import("./mcp.mjs");
}
