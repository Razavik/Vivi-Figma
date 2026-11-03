import test from "node:test";
import assert from "node:assert/strict";
import { checkSpecFields } from "../spec-fields.mjs";

test("подсказка из HINTS: width → w", () => {
	const notes = checkSpecFields({ type: "frame", width: 100 });
	assert.equal(notes.length, 1);
	assert.match(notes[0], /поле «width» у frame игнорируется: используйте w/);
});

test("опечатка в одну букву: filll → вероятно, fill", () => {
	const notes = checkSpecFields({ type: "rect", w: 10, h: 10, filll: "#fff" });
	assert.equal(notes.length, 1);
	assert.match(notes[0], /вероятно, fill/);
});

test("регистр не считается ошибкой-загадкой: Fill → вероятно, fill", () => {
	const notes = checkSpecFields({ type: "rect", w: 10, h: 10, Fill: "#fff" });
	assert.match(notes[0], /вероятно, fill/);
});

test("невалидный enum: layout grid → список допустимых", () => {
	const notes = checkSpecFields({ type: "frame", layout: "grid" });
	assert.equal(notes.length, 1);
	assert.match(notes[0], /frame\.layout: значение «grid» недопустимо \(допустимо: none, vertical, horizontal\)/);
});

test("fontWeight: heavy отклоняется, extrabold проходит", () => {
	assert.equal(checkSpecFields({ type: "text", text: "x", fontWeight: "heavy" }).length, 1);
	assert.equal(checkSpecFields({ type: "text", text: "x", fontWeight: "extrabold" }).length, 0);
});

test("одинаковые замечания группируются с числом узлов", () => {
	const notes = checkSpecFields({
		type: "frame",
		children: [
			{ type: "text", name: "A", text: "a", width: 10 },
			{ type: "text", name: "B", text: "b", width: 10 },
			{ type: "text", name: "C", text: "c", width: 10 },
		],
	});
	assert.equal(notes.length, 1);
	assert.match(notes[0], /узлов: 3, например «A»/);
});

test("обход вложенных node и tree (правки)", () => {
	const notes = checkSpecFields({ edits: 1, node: { type: "text", text: "x", fontsize: 20 }, tree: [{ type: "icon", icon: "ok", bad: 1 }] });
	assert.equal(notes.length, 2);
	assert.ok(notes.some((n) => n.includes("fontsize")));
	assert.ok(notes.some((n) => n.includes("bad")));
});

test("потолок max: лишние замечания сворачиваются в «…и ещё»", () => {
	const children = [];
	for (let i = 0; i < 20; i++) children.push({ type: "rect", w: 1, h: 1, [`extra${i}`]: 1 });
	const notes = checkSpecFields({ type: "frame", children }, { max: 3 });
	assert.equal(notes.length, 4);
	assert.match(notes[3], /и ещё 17/);
});

test("неизвестный тип узла и отсутствие ошибок молчат", () => {
	assert.equal(checkSpecFields({ type: "unknown", w: 1, custom: 2 }).length, 0);
	assert.equal(checkSpecFields({ type: "frame", w: 100, layout: "vertical", padding: [8, 8, 8, 8] }).length, 0);
});
