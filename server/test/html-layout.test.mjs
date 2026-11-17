import test from "node:test";
import assert from "node:assert/strict";
import { htmlToDesign } from "../html-to-design.mjs";

const flatten = (node) => [node, ...(node.children || []).flatMap(flatten)];
test("HTML Flex: wrapped anonymous text keeps browser line positions", async () => {
	const result = await htmlToDesign({ html: '<main style="display:flex;justify-content:center;width:200px;font:700 24px/30px Arial">Комплексные решения в сфере логистики</main>', selector: "main", width: 320 });
	assert.equal(result.spec.layout, "none");
	const texts = result.spec.children.filter((node) => node.type === "text");
	assert.ok(texts.length > 1);
	assert.ok(texts[1].y > texts[0].y);
});
test("HTML layouts: raster backgrounds are outside Flex/Grid flow", async () => {
	const html = `<style>body{margin:0}.box{width:320px;height:80px;background:linear-gradient(red,blue);gap:10px}#flex{display:flex;align-items:center}#grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:80px}.box>div{width:40px;height:30px}</style><main><section id="flex" class="box"><div>A</div><div>B</div></section><section id="grid" class="box"><div>C</div><div>D</div></section></main>`;
	const result = await htmlToDesign({ html, selector: "main", width: 320 });
	for (const [name, layout] of [["flex", "horizontal"], ["grid", "grid"]]) {
		const node = flatten(result.spec).find((item) => item.name === name);
		assert.equal(node.layout, layout, result.warnings.join("\n"));
		const background = node.children.find((child) => child.name === "Background");
		assert.equal(background.type, "image");
		assert.equal(background.position, "absolute");
		assert.ok(background.data);
		assert.equal(background.gridCell, undefined);
		assert.equal(node.children.filter((child) => child.position !== "absolute").length, 2);
	}
});

test("HTML text: intrinsic Arial menu labels hug; paragraphs retain wrapping", async () => {
	const html = `<style>body{margin:0;font:700 14px/16.8px Arial}nav{display:flex;gap:19px}a{display:block;padding:31px 10px;text-transform:uppercase}p{width:320px}#nowrap{width:40px;white-space:nowrap;text-align:center}</style><main><nav><a>Перевозчикам</a><a>О компании</a><a>Контакты</a></nav><p id="paragraph">Длинный текст абзаца, который должен переноситься по ширине контейнера и оставаться редактируемым.</p><div id="nowrap">Без переноса</div></main>`;
	const result = await htmlToDesign({ html, selector: "main", width: 1920 });
	const nodes = flatten(result.spec);
	for (const label of ["ПЕРЕВОЗЧИКАМ", "О КОМПАНИИ", "КОНТАКТЫ"]) {
		const text = nodes.find((node) => node.text === label);
		assert.equal(text.w, "hug", label);
		assert.equal(text.fontFamily, "Arial");
	}
	assert.equal(nodes.find((node) => node.name === "paragraph").children[0].w, "fill");
	const nowrap = nodes.find((node) => node.name === "nowrap");
	assert.equal(nowrap.children[0].w, "hug");
	assert.equal(nowrap.cross, "center");
});

test("HTML Flex: direction, padding, gap, grow, stretch, wrap и reverse", async () => {
	const html = `<style>body{margin:0}.box{width:400px;display:flex;gap:12px;padding:16px;box-sizing:border-box}.box>div{width:60px;height:30px}#row{justify-content:space-between;align-items:center}#grow>div{flex:1}#column{flex-direction:column;gap:8px}#column>div{width:auto}#wrap{width:180px;padding:0;flex-wrap:wrap;gap:8px 12px}#wrap>div{width:80px;height:20px}#reverse{flex-direction:row-reverse}</style><main><div id="row" class="box"><div>A</div><div>B</div></div><div id="grow" class="box"><div>A</div><div>B</div></div><div id="column" class="box"><div>A</div><div>B</div></div><div id="wrap" class="box"><div>A</div><div>B</div><div>C</div></div><div id="reverse" class="box"><div id="first">A</div><div id="last">B</div></div></main>`;
	const result = await htmlToDesign({ html, selector: "main", width: 520 });
	const nodes = flatten(result.spec), byName = (name) => nodes.find((node) => node.name === name);
	assert.equal(byName("row").layout, "horizontal");
	assert.deepEqual(byName("row").padding, [16, 16, 16, 16]);
	assert.equal(byName("row").gap, 12);
	assert.equal(byName("row").align, "space-between");
	assert.equal(byName("row").cross, "center");
	assert.ok(byName("grow").children.every((node) => node.w === "fill"));
	assert.equal(byName("column").layout, "vertical");
	assert.ok(byName("column").children.every((node) => node.w === "fill"));
	assert.equal(byName("wrap").wrap, true);
	assert.equal(byName("wrap").gap, 12);
	assert.equal(byName("wrap").rowGap, 8);
	assert.equal(byName("reverse").align, "end");
	assert.deepEqual(byName("reverse").children.map((node) => node.name), ["last", "first"]);
	assert.ok(result.source.layout.flex >= 5);
});

test("HTML Grid: native grid, fr-колонки, строки, span и именованные области", async () => {
	const html = `<style>body{margin:0}.grid{display:grid;width:400px;gap:8px 10px;grid-template-columns:1fr 2fr;grid-template-rows:40px 60px}#wide{grid-column:1/-1}#areas{grid-template-columns:100px 1fr;grid-template-areas:"hero hero" "side content"}#hero{grid-area:hero}#side{grid-area:side}#content{grid-area:content}</style><main><div id="grid" class="grid"><div id="wide">Wide</div><div id="left">Left</div><div id="right">Right</div></div><div id="areas" class="grid"><div id="hero">Hero</div><div id="side">Side</div><div id="content">Content</div></div></main>`;
	const result = await htmlToDesign({ html, selector: "main", width: 520 });
	const nodes = flatten(result.spec), byName = (name) => nodes.find((node) => node.name === name);
	assert.equal(byName("grid").layout, "grid", JSON.stringify(result.warnings));
	assert.deepEqual(byName("grid").grid.columns, [{ type: "flex", value: 1 }, { type: "flex", value: 2 }]);
	assert.deepEqual(byName("grid").grid.rows, [{ type: "fixed", value: 40 }, { type: "fixed", value: 60 }]);
	assert.equal(byName("grid").grid.columnGap, 10);
	assert.equal(byName("grid").grid.rowGap, 8);
	assert.equal(byName("wide").gridCell.columnSpan, 2);
	assert.equal(byName("wide").w, "fill");
	assert.equal(byName("right").gridCell.row, 1);
	assert.equal(byName("right").gridCell.column, 1);
	assert.equal(byName("areas").layout, "grid", JSON.stringify(result.warnings));
	assert.equal(byName("hero").gridCell.columnSpan, 2);
	assert.equal(byName("content").gridCell.column, 1);
	assert.equal(byName("content").gridCell.row, 1);
});

test("HTML layouts: перекрывающиеся grid-ячейки сохраняют координаты; autoLayout:false отключает преобразование", async () => {
	const html = '<main style="display:grid;width:320px;grid-template-columns:1fr;grid-template-rows:60px"><div id="a" style="grid-area:1/1">A</div><div id="b" style="grid-area:1/1">B</div></main>';
	const result = await htmlToDesign({ html, width: 320, selector: "main" });
	assert.equal(result.spec.layout, "none");
	assert.ok(result.warnings.some((warning) => warning.includes("перекрывающиеся Grid")));
	const fixed = await htmlToDesign({ html: '<main style="display:flex;gap:20px"><div>A</div><div>B</div></main>', width: 320, selector: "main", autoLayout: false });
	assert.equal(fixed.spec.layout, "none");
	assert.equal(typeof fixed.spec.children[0].x, "number");
});
