import test from "node:test";
import assert from "node:assert/strict";
import { variantEdits } from "../variants-macro.mjs";

const base = {
	type: "frame",
	name: "Btn",
	layout: "horizontal",
	padding: [16, 32, 16, 32],
	children: [{ type: "text", name: "Label", text: "Label" }],
};

test("ошибки описания набора ловятся до вызова плагина", () => {
	assert.throws(() => variantEdits({}), /name/);
	assert.throws(() => variantEdits({ name: "X", base: { type: "text" }, variants: [] }), /frame/);
	assert.throws(() => variantEdits({ name: "X", base, variants: [{ props: { State: "Default" } }] }), /минимум 2/);
	assert.throws(
		() => variantEdits({ name: "X", base, variants: [{ props: { A: "1" } }, { props: { B: "2" } }] }),
		/одни и те же ключи/,
	);
	assert.throws(
		() => variantEdits({ name: "X", base, variants: [{ props: { S: "A" } }, { props: { S: "A" } }] }),
		/повторяется/,
	);
	assert.throws(
		() => variantEdits({ name: "X", base, variants: [{ props: { S: "a=b" } }, { props: { S: "c" } }] }),
		/нельзя «=»/,
	);
	assert.throws(
		() =>
			variantEdits({
				name: "X", base,
				variants: [{ props: { S: "A" } }, { props: { S: "B" } }],
				replace: [{}],
			}),
		/нужен id/,
	);
});

test("раскрытие: компоненты в $components, набор, swap", () => {
	const ops = variantEdits({
		name: "Button/Primary",
		base,
		variants: [{ props: { State: "Default" } }, { props: { State: "Hover" }, set: { fill: "#000" } }],
		replace: [{ id: "1:2", overrides: { Label: "Go" } }],
	});
	assert.equal(ops[0].op, "insert");
	assert.equal(ops[0].parent, "$components");
	assert.equal(ops[0].as, "v0");
	assert.equal(ops[0].node.component, true);
	assert.equal(ops[0].node.name, "State=Default");
	assert.equal(ops[1].node.fill, "#000");
	const combine = ops.find((o) => o.op === "combine_variants");
	assert.deepEqual(combine.ids, ["$v0", "$v1"]);
	assert.equal(combine.name, "Button/Primary");
	const swap = ops.find((o) => o.op === "swap");
	assert.equal(swap.id, "1:2");
	assert.equal(swap.component, "$set");
	assert.deepEqual(swap.variants, { State: "Default" });
	assert.deepEqual(swap.overrides, { Label: "Go" });
});

test("auto: Default → Hover/Pressed; пара Closed/Open — click туда и обратно", () => {
	const hover = variantEdits({
		name: "B", base,
		variants: [
			{ props: { State: "Default" } },
			{ props: { State: "Hover" } },
			{ props: { State: "Pressed" } },
		],
	});
	const links = hover.filter((o) => o.op === "set_interactions");
	assert.equal(links.length, 1);
	assert.equal(links[0].id, "$v0");
	assert.equal(links[0].interactions[0].trigger, "hover");
	assert.equal(links[0].interactions[0].target, "$v1");
	assert.equal(links[0].interactions[1].trigger, "press");
	assert.equal(links[0].interactions[1].target, "$v2");

	const toggle = variantEdits({
		name: "F", base,
		variants: [{ props: { State: "Closed" } }, { props: { State: "Open" } }],
	});
	const clicks = toggle.filter((o) => o.op === "set_interactions");
	assert.equal(clicks.length, 2);
	assert.equal(clicks[0].interactions[0].trigger, "click");
	assert.equal(clicks[0].interactions[0].target, "$v1");
	assert.equal(clicks[1].interactions[0].target, "$v0");
});

test("без ключа state — связей нет; interactions:none — пусто", () => {
	const noState = variantEdits({ name: "T", base, variants: [{ props: { Type: "A" } }, { props: { Type: "B" } }] });
	assert.equal(noState.filter((o) => o.op === "set_interactions").length, 0);
	const none = variantEdits({
		name: "T", base,
		variants: [{ props: { State: "A" } }, { props: { State: "B" } }],
		interactions: "none",
	});
	assert.equal(none.filter((o) => o.op === "set_interactions").length, 0);
});

test("явные связи: from/to по свойствам, остальные свойства наследуются", () => {
	const ops = variantEdits({
		name: "T", base,
		variants: [
			{ props: { Type: "A", State: "Default" } },
			{ props: { Type: "A", State: "Hover" } },
			{ props: { Type: "B", State: "Default" } },
			{ props: { Type: "B", State: "Hover" } },
		],
		interactions: [{ from: { State: "Default" }, to: { State: "Hover" }, trigger: "hover" }],
	});
	const links = ops.filter((o) => o.op === "set_interactions");
	assert.equal(links.length, 2);
	assert.equal(links[0].interactions[0].target, "$v1"); // Type=A Default → Type=A Hover
	assert.equal(links[1].interactions[0].target, "$v3"); // Type=B Default → Type=B Hover
	assert.throws(
		() =>
			variantEdits({
				name: "T", base,
				variants: [{ props: { State: "A" } }, { props: { State: "B" } }],
				interactions: [{ from: { State: "ZZ" }, to: { State: "B" } }],
			}),
		/нет варианта для from/,
	);
});

test("children по имени слоя: неизвестный слой — ошибка с именем варианта", () => {
	assert.throws(
		() =>
			variantEdits({
				name: "T", base,
				variants: [{ props: { S: "A" } }, { props: { S: "B" }, children: { Ghost: { color: "#fff" } } }],
			}),
		/нет слоя «Ghost»/,
	);
	const ops = variantEdits({
		name: "T", base,
		variants: [{ props: { S: "A" } }, { props: { S: "B" }, children: { Label: { color: "#fff" } } }],
	});
	assert.equal(ops[1].node.children[0].color, "#fff");
});
