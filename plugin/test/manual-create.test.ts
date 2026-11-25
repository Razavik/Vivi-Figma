import test from "node:test";
import assert from "node:assert/strict";
import { runManualCreate } from "../src/main/mcp-write";
import { undoableRuns } from "../src/main/undo";

test("stopping layer creation removes only the hidden import draft", async () => {
	const previous = globalThis.figma;
	const control = { cancelled: false };
	const existing = { id: "existing", absoluteBoundingBox: { x: 0, y: 0, width: 40, height: 20 } };
	const page = { id: "page", type: "PAGE", children: [existing], selection: [existing], appendChild() {} };
	const draft = {
		id: "draft", type: "FRAME", width: 80, height: 80, visible: true, removed: false, effects: [],
		resizeWithoutConstraints() {},
		appendChild() {},
		remove() { this.removed = true; page.children = page.children.filter((node) => node.id !== this.id); },
	};
	let frameCalls = 0;
	const other = { ...existing, id: "unrelated" };
	(globalThis as any).figma = {
		currentPage: page,
		root: { children: [page] },
		saveVersionHistoryAsync: async () => {},
		createFrame() {
			frameCalls++;
			if (frameCalls === 1) {
				page.children.push(draft as any);
				return draft;
			}
			page.children.push(other);
			control.cancelled = true;
			return { ...draft, id: "child", resize() {} };
		},
	};
	try {
		const before = undoableRuns();
		const result = await runManualCreate({ spec: { type: "frame", children: [{ type: "frame" }, { type: "frame" }] } }, control);
		assert.equal(result.ok, false);
		assert.equal(result.cancelled, true, result.error);
		assert.equal(draft.visible, false);
		assert.equal(draft.removed, true);
		assert.equal(frameCalls, 2);
		assert.deepEqual(page.children, [existing, other]);
		assert.deepEqual(page.selection, [existing]);
		assert.deepEqual(undoableRuns(), before);
	} finally {
		(globalThis as any).figma = previous;
	}
});
