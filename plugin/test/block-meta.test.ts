import test from "node:test";
import assert from "node:assert/strict";
import { BLOCK_KINDS, blockSpecFromMeta, patternFillFromData } from "../src/main/block-meta";

test("блок: meta → та же спека с type, name и id (круг записи/чтения pluginData)", () => {
	for (const kind of BLOCK_KINDS) {
		const source = { value: "x", data: [{ label: "a", value: 1 }], w: 300 };
		const raw = JSON.stringify({ [kind]: source }); // как пишет builder.setPluginData("meta", …)
		const spec = blockSpecFromMeta(raw, "1:2", "Блок");
		assert.equal(spec?.type, kind);
		assert.equal(spec?.id, "1:2");
		assert.equal(spec?.name, "Блок");
		assert.deepEqual(spec?.data, source.data);
		assert.equal(spec?.w, 300);
	}
});

test("не блок: пусто, битый JSON, чужая meta (iconSet) — null", () => {
	assert.equal(blockSpecFromMeta("", "1:1", "x"), null);
	assert.equal(blockSpecFromMeta("{oops", "1:1", "x"), null);
	assert.equal(blockSpecFromMeta(JSON.stringify({ iconSet: "ph" }), "1:1", "x"), null);
});

test("паттерн-заливка: параметры возвращаются как fill", () => {
	const raw = JSON.stringify({ pattern: "dots", color: "#00000026", size: 4, gap: 16, bg: "#F7F3EE" });
	assert.deepEqual(patternFillFromData(raw), JSON.parse(raw));
	assert.equal(patternFillFromData(""), null);
	assert.equal(patternFillFromData("{}"), null);
	assert.equal(patternFillFromData("nope"), null);
});
