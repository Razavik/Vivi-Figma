import test from "node:test";
import assert from "node:assert/strict";
import { selectRuns } from "../src/main/undo";

// Прогоны с id разного масштаба: UI нумерует с единицы, MCP берёт Date.now.
const runs = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 1730000000001 }, { id: 1730000000002 }];

test("selectRuns {last}: берёт последние по порядку журнала, не по id", () => {
	assert.deepEqual(selectRuns(runs, { last: 1 }).map((r) => r.id), [1730000000002]);
	assert.deepEqual(selectRuns(runs, { last: 2 }).map((r) => r.id), [1730000000001, 1730000000002]);
	// Главное: last:2 не задевает UI-прогоны, хотя их id меньше (старая ошибка отката)
	assert.deepEqual(selectRuns(runs, { last: 3 }).map((r) => r.id), [3, 1730000000001, 1730000000002]);
	assert.deepEqual(selectRuns(runs, { last: 99 }).map((r) => r.id), runs.map((r) => r.id));
});

test("selectRuns {fromId}: всё от порога включительно, в порядке журнала", () => {
	assert.deepEqual(selectRuns(runs, { fromId: 2 }).map((r) => r.id), [2, 3, 1730000000001, 1730000000002]);
	assert.deepEqual(selectRuns(runs, { fromId: 1730000000002 }).map((r) => r.id), [1730000000002]);
	assert.deepEqual(selectRuns(runs, { fromId: 9999999999999 }).map((r) => r.id), []);
});

test("selectRuns: last округляется и не бывает меньше 1", () => {
	assert.deepEqual(selectRuns(runs, { last: 0 }).map((r) => r.id), [1730000000002]);
	assert.deepEqual(selectRuns(runs, { last: 1.7 }).map((r) => r.id), [1730000000001, 1730000000002]);
});
