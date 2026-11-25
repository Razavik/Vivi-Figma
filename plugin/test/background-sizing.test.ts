import test from "node:test";
import assert from "node:assert/strict";
import { buildNode, figmaFontSize, placeAnchored } from "../src/main/builder";
import { state } from "../src/main/canvas-state";

test("font sizes are valid before assignment to the Figma API", () => {
	assert.equal(figmaFontSize(0), 1);
	assert.equal(figmaFontSize(0.25), 1);
	assert.equal(figmaFontSize(16), 16);
	assert.equal(figmaFontSize(Number.NaN), undefined);
	assert.equal(figmaFontSize(Number.POSITIVE_INFINITY), undefined);
});

test("captured text line never wraps again at a narrower browser measurement", async () => {
	const previous = globalThis.figma;
	function makeText(): any {
		let mode = "HEIGHT";
		return {
			type: "TEXT", name: "", width: 63, height: 24, x: 0, y: 0, effects: [],
			get textAutoResize() { return mode; },
			set textAutoResize(value: string) { mode = value; if (value === "WIDTH_AND_HEIGHT") { this.width = 63; this.height = 24; } },
			resize(w: number) { this.width = w; this.height = w < 63 ? 48 : 24; },
		};
	}
	(globalThis as any).figma = { createText: makeText, loadFontAsync: async () => {} };
	const parent: any = { appendChild(node: any) { node.parent = this; } };
	try {
		const line = await buildNode({ type: "text", text: "Global", w: 59.7, fontSize: 20, lineHeight: 24, noWrap: true }, parent, false);
		assert.equal(line?.height, 24);
		assert.equal(line?.width, 63);
		const wrapping = await buildNode({ type: "text", text: "Global", w: 59.7, fontSize: 20, lineHeight: 24 }, parent, false);
		assert.equal(wrapping?.height, 48);
	} finally { (globalThis as any).figma = previous; }
});

test("background keeps its captured size while the auto-layout parent settles", async () => {
	const previous = globalThis.figma;
	const children: any[] = [];
	const parent: any = {
		type: "FRAME", width: 178, height: 447,
		appendChild(node: any) { node.parent = this; children.push(node); },
	};
	const rect: any = {
		type: "RECTANGLE", name: "", width: 100, height: 100, x: 0, y: 0,
		layoutPositioning: "AUTO", constraints: { horizontal: "MIN", vertical: "MIN" },
		fills: [], strokes: [], effects: [], cornerRadius: 0, removed: false,
		resize(w: number, h: number) { this.width = w; this.height = h; },
	};
	function resizeParent(width: number) {
		for (const child of children) if (child.constraints.horizontal === "STRETCH") child.width += width - parent.width;
		parent.width = width;
	}
	(globalThis as any).figma = { createImage: () => ({ hash: "test" }), createRectangle: () => rect };
	state.anchors.length = 0;
	try {
		await buildNode({ type: "image", name: "Background", data: "AAAA", w: 660, h: 447, x: 0, y: 0, position: "absolute", constraints: { horizontal: "STRETCH", vertical: "STRETCH" } }, parent, true);
		resizeParent(660);
		placeAnchored();
		assert.equal(rect.width, 660); // прежний результат — 1142px
		assert.equal(rect.height, 447);
		assert.equal(rect.x, 0);
		assert.equal(rect.constraints.horizontal, "STRETCH");
		resizeParent(760);
		assert.equal(rect.width, 760); // после сборки привязка продолжает работать
	} finally {
		(globalThis as any).figma = previous;
		state.anchors.length = 0;
	}
});
