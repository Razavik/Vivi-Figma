import test from "node:test";
import assert from "node:assert/strict";
import { lint, type LintNode } from "../src/main/lint";

const white = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
const dark = [{ type: "SOLID", color: { r: 0.1, g: 0.08, b: 0.06 } }];
const photo = [{ type: "IMAGE" }];

function text(id: string, over: Partial<LintNode> = {}): LintNode {
	return { id, name: `t${id}`, type: "TEXT", characters: "text", fontSize: 16, fills: white, ...over };
}

test("off-grid: 13 — замечание, 6 и 2 — по шкале", () => {
	const bad: LintNode = { id: "1", name: "Card", type: "FRAME", layoutMode: "VERTICAL", paddingTop: 13 };
	assert.ok(lint(bad).some((i) => i.kind === "off-grid" && i.detail.includes("13")));
	const ok: LintNode = { id: "2", name: "Card", type: "FRAME", layoutMode: "VERTICAL", paddingTop: 6, itemSpacing: 2 };
	assert.equal(lint(ok).filter((i) => i.kind === "off-grid").length, 0);
});

test("small-text: кегль 11 — замечание, 12 — ок", () => {
	const root: LintNode = { id: "r", name: "R", type: "FRAME", children: [text("a", { fontSize: 11 })] };
	root.children![0].parent = root;
	assert.ok(lint(root).some((i) => i.kind === "small-text"));
	const ok: LintNode = { id: "r", name: "R", type: "FRAME", children: [text("a", { fontSize: 12 })] };
	ok.children![0].parent = ok;
	assert.equal(lint(ok).filter((i) => i.kind === "small-text").length, 0);
});

test("контраст: тёмный текст на светлом фоне ловится", () => {
	const root: LintNode = { id: "r", name: "R", type: "FRAME", fills: white, children: [text("a", { fills: white })] };
	root.children![0].parent = root;
	assert.ok(lint(root).some((i) => i.kind === "contrast"));
});

test("контраст: плашка под текстом внутри родителя считается фоном (скрим)", () => {
	// Тёмный непрозрачный слой под текстом: белый текст читается, замечания нет
	const scrim: LintNode = { id: "s", name: "Scrim", type: "RECTANGLE", fills: dark, absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 120 } };
	const cap = text("c", { absoluteBoundingBox: { x: 20, y: 40, width: 200, height: 20 } });
	const root: LintNode = { id: "r", name: "R", type: "FRAME", fills: white, children: [scrim, cap] };
	scrim.parent = root;
	cap.parent = root;
	assert.equal(lint(root).filter((i) => i.kind === "contrast").length, 0);
});

test("контраст: фото без полностью покрывающего слоя — замечания нет (ложное хуже пропуска)", () => {
	const pic: LintNode = { id: "p", name: "Photo", type: "RECTANGLE", fills: photo as unknown as readonly Paint[], absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 120 } };
	const cap = text("c", { absoluteBoundingBox: { x: 20, y: 40, width: 200, height: 20 } });
	const root: LintNode = { id: "r", name: "R", type: "FRAME", fills: white, children: [pic, cap] };
	pic.parent = root;
	cap.parent = root;
	assert.equal(lint(root).filter((i) => i.kind === "contrast").length, 0);
});
