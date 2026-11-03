import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MCP_TOOLS, isPluginTool } from "../mcp-tools.mjs";

// Реестр инструментов описан в двух местах: server/mcp-tools.mjs и плагин
// (белые списки в mcp-core.ts + case в mcp-tools.ts). Плагин бандлится отдельно,
// общего импорта нет — сверяем списки чтением файлов. Страж против рассинхрона.
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");

function listOf(src, name) {
	const m = src.match(new RegExp(`${name} = \\[([^\\]]*)\\]`));
	assert.ok(m, `${name} не найден`);
	return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
}

const core = read("plugin/src/main/mcp-core.ts");
const tools = read("plugin/src/main/mcp-tools.ts");
const pluginRead = listOf(core, "MCP_READ_TOOLS");
const pluginWrite = listOf(core, "MCP_WRITE_TOOLS");
const cases = [...tools.matchAll(/case "([a-z_]+)"/g)].map((x) => x[1]);

test("белые списки плагина совпадают с реестром сервера", () => {
	const pluginTools = Object.keys(MCP_TOOLS).filter((n) => isPluginTool(n) && !MCP_TOOLS[n].macro); // macro (variants) раскрывается на сервере, в плагин не уходит
	assert.deepEqual([...pluginRead, ...pluginWrite].sort(), pluginTools.sort());
	assert.deepEqual([...pluginWrite].sort(), Object.keys(MCP_TOOLS).filter((n) => MCP_TOOLS[n].write && !MCP_TOOLS[n].macro).sort());
});

test("каждый инструмент белого списка имеет case, лишних case нет", () => {
	const all = new Set([...pluginRead, ...pluginWrite]);
	for (const name of all) assert.ok(cases.includes(name), `в mcp-tools.ts нет case "${name}"`);
	for (const c of cases) assert.ok(all.has(c), `case "${c}" без инструмента в белых списках`);
});

test("флаги фаз: dry/export/prepare только там, где обработчик это умеет", () => {
	for (const [name, def] of Object.entries(MCP_TOOLS)) {
		if (def.dry) assert.ok(["edit", "variants"].includes(name) || def.write, `${name}: dry без записи`);
		if (def.export) assert.ok(!def.write, `${name}: export не должен быть write`);
	}
});
