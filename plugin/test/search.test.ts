import { test } from "node:test";
import assert from "node:assert/strict";
import { clampLimit, searchIn, type SearchNode } from "../src/main/search";

// Мини-дерево с findAll как у нод Figma (обход вглубь, без самого корня).
function node(
	id: string,
	name: string,
	type: string,
	extra: Partial<SearchNode> = {},
	children: SearchNode[] = [],
): SearchNode {
	const n: SearchNode = {
		id,
		name,
		type,
		...extra,
		findAll(cb) {
			const out: SearchNode[] = [];
			const walk = (list: SearchNode[]) => {
				for (const c of list) {
					if (cb(c)) out.push(c);
					const sub = (c as SearchNode & { kids?: SearchNode[] }).kids;
					if (sub) walk(sub);
				}
			};
			walk((n as SearchNode & { kids?: SearchNode[] }).kids || []);
			return out;
		},
	};
	(n as SearchNode & { kids?: SearchNode[] }).kids = children;
	for (const c of children) c.parent = n;
	return n;
}

function page(): { page: SearchNode; hero: SearchNode; pricing: SearchNode } {
	const hero = node("1:1", "Hero", "FRAME", { width: 1440, height: 600 }, [
		node("1:2", "Title", "TEXT", { characters: "Кофе для утра", width: 400, height: 60 }),
		node("1:3", "Button", "INSTANCE"),
	]);
	const pricing = node("2:1", "Pricing", "FRAME", {}, [
		node("2:2", "Title", "TEXT", { characters: "Тарифы" }),
		node("2:3", "Price", "TEXT", { characters: "990 ₽ / мес" }),
		node("2:4", "Hidden", "TEXT", { characters: "990", visible: false }),
	]);
	const p = node("0:1", "Page", "PAGE", {}, [hero, pricing]);
	return { page: p, hero, pricing };
}

test("поиск по имени на всей странице находит слои во всех фреймах", () => {
	const { page: p } = page();
	const r = searchIn(p, { query: "title" });
	assert.deepEqual(r.results.map((x) => x.id), ["1:2", "2:2"]);
	assert.equal(r.total, 2);
	assert.equal(r.truncated, false);
});

test("область «внутри фрейма» отсекает чужие совпадения", () => {
	const { pricing } = page();
	const r = searchIn(pricing, { query: "title" });
	assert.deepEqual(r.results.map((x) => x.id), ["2:2"]);
	assert.equal(r.results[0].parent, "Pricing");
	assert.equal(r.results[0].parentId, "2:1");
});

test("по тексту ищется только с text:true, скрытые слои пропускаются", () => {
	const { page: p } = page();
	assert.equal(searchIn(p, { query: "990" }).total, 0);
	const r = searchIn(p, { query: "990", text: true });
	assert.deepEqual(r.results.map((x) => x.id), ["2:3"]);
	assert.equal(r.results[0].text, "990 ₽ / мес");
});

test("фильтр по типу и «*» — все слои типа внутри фрейма", () => {
	const { hero, page: p } = page();
	const r = searchIn(hero, { query: "*", type: "text" });
	assert.deepEqual(r.results.map((x) => x.id), ["1:2"]);
	assert.equal(searchIn(p, { query: "*", type: "TEXT" }).total, 3);
	assert.equal(searchIn(p, { query: "button", type: "FRAME" }).total, 0);
});

test("лимит: усечение сообщает общее число, потолок и значение по умолчанию 100, минимум 1", () => {
	const kids = Array.from({ length: 20 }, (_, i) => node(`3:${i}`, `Card ${i}`, "FRAME"));
	const root = node("0:1", "Page", "PAGE", {}, kids);
	const r = searchIn(root, { query: "card", limit: 5 });
	assert.equal(r.results.length, 5);
	assert.equal(r.total, 20);
	assert.equal(r.truncated, true);
	assert.equal(searchIn(root, { query: "card" }).results.length, 20);
	assert.equal(clampLimit(500), 100);
	assert.equal(clampLimit(0), 100);
	assert.equal(clampLimit(-3), 1);
});

test("пустой запрос и нода без вложенных слоёв ничего не находят", () => {
	const { page: p } = page();
	assert.equal(searchIn(p, { query: "   " }).total, 0);
	assert.equal(searchIn({ id: "x", name: "Leaf", type: "TEXT" }, { query: "leaf" }).total, 0);
});

test("offset: следующая страница результата", () => {
	const nodes = Array.from({ length: 5 }, (_, i) => ({ id: `n${i}`, name: "Title", type: "TEXT" }));
	const root = { id: "r", name: "root", type: "FRAME", findAll: (cb: (n: any) => boolean) => nodes.filter(cb) } as any;
	const p1 = searchIn(root, { query: "title", limit: 2 });
	const p2 = searchIn(root, { query: "title", limit: 2, offset: 2 });
	const p3 = searchIn(root, { query: "title", limit: 2, offset: 4 });
	assert.deepEqual(p1.results.map((r) => r.id), ["n0", "n1"]);
	assert.equal(p1.truncated, true);
	assert.deepEqual(p2.results.map((r) => r.id), ["n2", "n3"]);
	assert.deepEqual(p3.results.map((r) => r.id), ["n4"]);
	assert.equal(p3.truncated, false);
});

test("exact: «Hero» не находит «Hero text», регистр игнорируется", () => {
	const nodes = [
		{ id: "1", name: "Hero", type: "TEXT" },
		{ id: "2", name: "Hero text", type: "TEXT" },
		{ id: "3", name: "hero", type: "FRAME" },
	];
	const root = { id: "r", name: "root", type: "FRAME", findAll: (cb: (n: any) => boolean) => nodes.filter(cb) } as any;
	assert.deepEqual(searchIn(root, { query: "hero" }).results.map((r) => r.id), ["1", "2", "3"]);
	assert.deepEqual(searchIn(root, { query: "hero", exact: true }).results.map((r) => r.id).sort(), ["1", "3"]);
});
