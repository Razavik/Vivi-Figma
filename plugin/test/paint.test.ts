import test from "node:test";
import assert from "node:assert/strict";
import { cssNumbers, paddingOf } from "../src/main/paint";

test("cssNumbers: «16px 32px» и «24 0» → числа, мусор → пусто", () => {
	assert.deepEqual(cssNumbers("16px 32px"), [16, 32]);
	assert.deepEqual(cssNumbers("24 0"), [24, 0]);
	assert.deepEqual(cssNumbers("  8px  "), [8]);
	assert.deepEqual(cssNumbers(""), []);
	assert.deepEqual(cssNumbers("abc"), []);
	assert.deepEqual(cssNumbers("-4 0.5"), [-4, 0.5]);
});

test("paddingOf: число, CSS-шортхенд массивом, строка, пусто", () => {
	assert.deepEqual(paddingOf(10), { t: 10, r: 10, b: 10, l: 10 });
	assert.deepEqual(paddingOf([24, 14]), { t: 24, r: 14, b: 24, l: 14 });
	assert.deepEqual(paddingOf([1, 2, 3]), { t: 1, r: 2, b: 3, l: 2 });
	assert.deepEqual(paddingOf([1, 2, 3, 4]), { t: 1, r: 2, b: 3, l: 4 });
	// строка — как у CSS: модель иногда пишет padding так
	assert.deepEqual(paddingOf("16px 32px"), { t: 16, r: 32, b: 16, l: 32 });
	assert.deepEqual(paddingOf("24 0"), { t: 24, r: 0, b: 24, l: 0 });
	assert.deepEqual(paddingOf(undefined), { t: 0, r: 0, b: 0, l: 0 });
});
