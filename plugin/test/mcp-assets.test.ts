import test from "node:test";
import assert from "node:assert/strict";
import { collectAssets, defaultExportFormat, exportFormat, exportIds, exportScale, type AssetNode } from "../src/main/mcp-core";

const n = (id: string, type: string, w: number, h: number, extra: Partial<AssetNode> = {}): AssetNode => ({ id, name: id, type, width: w, height: h, ...extra });
const photoFill = [{ type: "IMAGE" }];

test("collectAssets: фото по IMAGE-заливке, иконка — контейнер из одних векторов, одиночный вектор", () => {
	const tree = n("root", "FRAME", 800, 600, {
		children: [
			n("hero", "RECTANGLE", 400, 300, { fills: photoFill }),
			n("ico", "FRAME", 24, 24, { children: [n("v1", "VECTOR", 10, 10), n("v2", "VECTOR", 8, 8)] }),
			n("btn", "FRAME", 120, 40, { children: [n("t", "TEXT", 50, 16), n("ico2", "FRAME", 20, 20, { children: [n("v3", "VECTOR", 8, 8)] })] }),
			n("tiny-photo", "RECTANGLE", 8, 8, { fills: photoFill }),
			n("hidden", "RECTANGLE", 100, 100, { fills: photoFill, visible: false }),
			n("big-vector", "VECTOR", 600, 300),
			n("lone", "VECTOR", 40, 40),
		],
	});
	const out = collectAssets(tree);
	assert.deepEqual(out.map((a) => [a.id, a.kind, a.format]), [
		["hero", "photo", "png"],
		["ico", "icon", "svg"],
		["ico2", "icon", "svg"],
		["lone", "icon", "svg"],
	]);
});

test("collectAssets: контейнер с текстом не иконка (иконкой остаётся сам вектор внутри), лимит работает", () => {
	const label = n("label", "FRAME", 60, 20, { children: [n("v", "VECTOR", 8, 8), n("t", "TEXT", 30, 10)] });
	assert.deepEqual(collectAssets(n("r", "FRAME", 100, 100, { children: [label] })).map((a) => a.id), ["v"]);
	const many = n("r", "FRAME", 1000, 1000, { children: Array.from({ length: 20 }, (_, i) => n("p" + i, "RECTANGLE", 50, 50, { fills: photoFill })) });
	assert.equal(collectAssets(many, 5).length, 5);
});

test("defaultExportFormat: вектор и контейнер из векторов — svg, остальное — png", () => {
	assert.equal(defaultExportFormat(n("v", "VECTOR", 500, 400)), "svg");
	assert.equal(defaultExportFormat(n("i", "INSTANCE", 15, 15, { children: [n("v", "VECTOR", 5, 5)] })), "svg");
	assert.equal(defaultExportFormat(n("b", "FRAME", 15, 15, { children: [n("t", "TEXT", 5, 5)] })), "png");
	assert.equal(defaultExportFormat(n("big", "FRAME", 500, 500, { children: [n("v", "VECTOR", 5, 5)] })), "png");
	assert.equal(defaultExportFormat(n("ph", "RECTANGLE", 20, 20, { fills: [{ type: "IMAGE" }] })), "png");
});

test("exportFormat, exportScale, exportIds: значения по умолчанию и границы", () => {
	assert.equal(exportFormat("JPEG", "png"), "jpg");
	assert.equal(exportFormat("gif", "svg"), "svg");
	assert.equal(exportFormat(undefined, "png"), "png");
	assert.equal(exportScale(undefined), 2);
	assert.equal(exportScale(10), 4);
	assert.equal(exportScale(0.1), 0.5);
	assert.deepEqual(exportIds({ ids: ["1:1", "1:1", " ", 5, "1:2"] }), ["1:1", "1:2"]);
	assert.deepEqual(exportIds({ id: "3:3" }), ["3:3"]);
	assert.deepEqual(exportIds({}), []);
});
