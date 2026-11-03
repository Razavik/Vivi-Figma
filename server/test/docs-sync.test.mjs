import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MCP_TOOL_NAMES } from "../mcp-tools.mjs";

// Таблица инструментов в README пишется руками — этот тест ловит дрейф
// в обе стороны: новый инструмент без строки и строка про убранный инструмент.
const readme = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "README.md"), "utf8");

test("каждый MCP-инструмент описан в README, и наоборот", () => {
	for (const name of MCP_TOOL_NAMES)
		assert.ok(readme.includes(`figma_${name}`), `в README нет figma_${name}`);
	for (const m of readme.matchAll(/figma_([a-z_]+)/g))
		assert.ok(MCP_TOOL_NAMES.includes(m[1]), `в README лишний figma_${m[1]}`);
});
