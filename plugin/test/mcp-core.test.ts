import test from "node:test";
import assert from "node:assert/strict";
import { MCP_READ_TOOLS, clampInt, isMcpTool, nodeArgs, screenshotScale } from "../src/main/mcp-core";

test("белый список: только чтение, незнакомое и не строки отклоняются", () => {
	for (const t of MCP_READ_TOOLS) assert.equal(isMcpTool(t), true);
	for (const bad of ["apply_edits", "build", "delete", "", 5, null, undefined]) assert.equal(isMcpTool(bad), false);
});

test("clampInt и nodeArgs: границы и значения по умолчанию", () => {
	assert.equal(clampInt("x", 1, 10, 5), 5);
	assert.equal(clampInt(99, 1, 10, 5), 10);
	assert.equal(clampInt(0, 1, 10, 5), 1);
	assert.equal(nodeArgs({}), null);
	assert.equal(nodeArgs({ id: "  " }), null);
	assert.deepEqual(nodeArgs({ id: " 1:2 " }), { id: "1:2", depth: 6, maxNodes: 300, compact: true, expand: false, boxes: true, format: "json" });
	assert.deepEqual(nodeArgs({ id: "1:2", depth: 99, maxNodes: 1 }), { id: "1:2", depth: 12, maxNodes: 10, compact: true, expand: false, boxes: true, format: "json" });
});

test("screenshotScale: большая сторона ≈ maxSize, потолок 2×, пол 0.05×", () => {
	assert.equal(screenshotScale(512, 256, undefined), 2);
	assert.equal(screenshotScale(2048, 1000, 1024), 0.5);
	assert.equal(screenshotScale(100000, 10, 1024), 0.05);
	assert.equal(screenshotScale(0, 0, 1024), 2);
});
