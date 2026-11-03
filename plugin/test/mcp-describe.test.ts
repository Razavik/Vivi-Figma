import test from "node:test";
import assert from "node:assert/strict";
import { collectTokens, compactSpec, mergeExtras, type NodeExtra, type Spec } from "../src/main/mcp-describe";
import { nodeArgs, scaleNote, screenshotScale } from "../src/main/mcp-core";

const tree: Spec = {
	id: "1:1",
	name: "Root",
	type: "frame",
	layout: "vertical",
	gap: 0,
	padding: [0, 0, 0, 0],
	align: "start",
	cross: "center",
	fill: "#ffffff",
	radius: 25,
	children: [
		{ id: "1:2", name: "Привет мир", type: "text", text: "Привет  мир", align: "left", fontFamily: "Montserrat", fontWeight: "medium", fontSize: 20, lineHeight: 34, color: "#2C2C2C", opacity: 1 },
		{ id: "1:3", name: "Заголовок", type: "text", text: "Другое", align: "center", fontFamily: "Montserrat", fontWeight: "medium", fontSize: 20, lineHeight: 34, color: "#2c2c2c" },
		{ id: "1:4", name: "Vector 4", type: "ref", label: "vector", w: 1300, h: 0 },
		{ id: "1:5", name: "Card", type: "frame", layout: "horizontal", gap: 12, padding: [30, 20, 30, 20], fill: "#f1f6f7", radius: 25, shadow: { y: 4, blur: 8 }, children: [] },
	],
};

test("compactSpec: убирает значения по умолчанию и дубль имя=текст, остальное сохраняет", () => {
	const c = compactSpec(tree);
	assert.equal("gap" in c, false);
	assert.equal("padding" in c, false);
	assert.equal("align" in c, false);
	assert.equal(c.cross, "center");
	const [t1, t2, , card] = c.children!;
	assert.equal("name" in t1, false); // имя совпало с текстом (с учётом пробелов)
	assert.equal("align" in t1, false);
	assert.equal("opacity" in t1, false);
	assert.equal(t2.name, "Заголовок");
	assert.equal(t2.align, "center");
	assert.deepEqual(card.padding, [30, 20, 30, 20]);
	assert.equal(card.gap, 12);
	// исходник не мутируется
	assert.equal(tree.gap, 0);
});

test("mergeExtras: рамки и свойства векторов приклеиваются по id", () => {
	const extras = new Map<string, NodeExtra>([
		["1:1", { box: [0, 0, 1920, 2542] }],
		["1:4", { box: [311, 1752, 1300, 1], vector: { stroke: "#c8c8c8", strokeWidth: 1, rotation: 90 } }],
	]);
	const m = mergeExtras(tree, extras);
	assert.deepEqual(m.box, [0, 0, 1920, 2542]);
	const v = m.children![2];
	assert.deepEqual(v.box, [311, 1752, 1300, 1]);
	assert.equal(v.stroke, "#c8c8c8");
	assert.equal(v.rotation, 90);
	assert.equal("box" in m.children![0], false);
});

test("collectTokens: цвета (с назначением), шрифты, радиусы, отступы по частоте", () => {
	const t = collectTokens(tree);
	assert.equal(t.nodes, 5);
	const dark = t.colors.find((c) => c.hex === "#2c2c2c")!;
	assert.equal(dark.count, 2);
	assert.deepEqual(dark.usage, ["text"]);
	assert.equal(t.colors.find((c) => c.hex === "#f1f6f7")!.usage[0], "fill");
	assert.deepEqual(t.fonts[0], { family: "Montserrat", weight: "medium", size: 20, lineHeight: 34, textCase: undefined, count: 2 });
	assert.deepEqual(t.radius, [{ value: 25, count: 2 }]);
	assert.deepEqual(t.gap, [{ value: 12, count: 1 }]);
	assert.deepEqual(t.padding, [{ value: "30 20 30 20", count: 1 }]);
	assert.equal(t.shadows.length, 1);
});

test("nodeArgs: compact/boxes включены по умолчанию; screenshotScale: scale важнее maxSize", () => {
	assert.deepEqual(nodeArgs({ id: "1:2" }), { id: "1:2", depth: 6, maxNodes: 300, compact: true, expand: false, boxes: true, format: "json" });
	assert.equal(nodeArgs({ id: "1:2", compact: false, boxes: false })!.compact, false);
	assert.equal(screenshotScale(1920, 2542, 1024), 1024 / 2542);
	assert.equal(screenshotScale(1920, 2542, 1024, 1), 1);
	assert.equal(screenshotScale(100, 100, undefined, 99), 4);
	assert.equal(screenshotScale(4000, 100, 4096), 1.024);
	assert.match(scaleNote(0.35, 1920, 2542)!, /35%/);
	assert.equal(scaleNote(1, 100, 100), undefined);
});
