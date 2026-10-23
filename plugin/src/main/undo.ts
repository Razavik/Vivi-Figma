/// <reference types="@figma/plugin-typings" />
// Откат прогонов агента. Перед первым изменением верхнего фрейма в прогоне
// делаем его скрытую копию (backup) на служебной странице «⟲ Vivi history»;
// откат возвращает копии на место, а созданное агентом удаляет. Прогонов
// хранится несколько (стек), так что можно откатиться к любому сообщению:
// откатываются все прогоны от него и до последнего, в обратном порядке.
// Ctrl+Z для этого не годится — он откатывает и ручные правки пользователя.
//
// Копии и метаданные живут в файле, а не в clientStorage: мету каждой копии
// пишем в её pluginData, список созданных нод и промпт — в pluginData
// страницы истории. Поэтому откат переживает пересборку и перезапуск плагина.

export const BACKUP_KEY = "viviBackup";
// Страница, где лежат копии. Обычная страница файла — её можно открыть
// и посмотреть руками; видимые слои там только наши заблокированные копии.
export const HISTORY_PAGE = "⟲ Vivi history";
// На странице истории: карта прогонов {runId: {ts, prompt, created}}
const RUNS_KEY = "viviRuns";
// и карта remap: старый id верхнего блока → id восстановленной копии.
const REMAP_KEY = "viviRemap";
// Сколько прогонов с изменениями держим (каждый — копии блоков на странице).
const MAX_RUNS = 8;

type Entry = {
	topId: string;
	backupId: string;
	index: number;
	name: string;
	// Страница, где лежал блок: откат возвращает копию туда, а не на
	// текущую — пользователь мог успеть переключить страницу.
	page: string;
};

type Run = {
	id: number;
	ts: number;
	prompt: string;
	entries: Entry[];
	snapped: Set<string>;
	created: Set<string>;
};

// Прогоны с изменениями, от старых к новым.
let runs: Run[] = [];
// Текущий прогон: в стек попадает при первом изменении.
let current: Run | null = null;
// После отката восстановленная копия получает новый id. Старые id остаются в
// записях более ранних прогонов — переводим их сюда, иначе созданное в раннем
// прогоне нельзя будет найти и удалить. Персистим, чтобы работало и после
// перезапуска плагина.
const remap = new Map<string, string>();

function resolve(id: string): string {
	let cur = id;
	for (let i = 0; i < 20 && remap.has(cur); i++)
		cur = remap.get(cur) as string;
	return cur;
}

// Метаданные копии — в её же pluginData под BACKUP_KEY (JSON). Значение "1" —
// старый формат без меты: такие копии считаем устаревшими и удаляем.
export type BackupMeta = {
	run: number;
	top: string;
	index: number;
	page: string;
	name: string;
};

export function parseBackupMeta(raw: string): BackupMeta | null {
	if (!raw || raw === "1") return null;
	try {
		const m = JSON.parse(raw) as BackupMeta;
		if (typeof m?.run !== "number" || typeof m?.top !== "string")
			return null;
		return m;
	} catch {
		return null;
	}
}

export function isBackup(node: BaseNode): boolean {
	return !!node.getPluginData(BACKUP_KEY);
}

function findHistoryPage(): PageNode | null {
	for (const p of figma.root.children) {
		if (p.type === "PAGE" && p.name === HISTORY_PAGE) return p;
	}
	return null;
}

// Страницу истории создаём лениво — только когда есть что копировать.
function ensureHistoryPage(): PageNode {
	return (
		findHistoryPage() ||
		Object.assign(figma.createPage(), {
			name: HISTORY_PAGE,
		})
	);
}

// Карта прогонов на странице истории: промпт и список созданных нод —
// то, чего нет в мете самих копий.
type RunMap = Record<
	string,
	{ ts?: number; prompt?: string; created?: string[] }
>;

export function parseRunMap(raw: string): RunMap {
	try {
		const m = JSON.parse(raw) as RunMap;
		return m && typeof m === "object" ? m : {};
	} catch {
		return {};
	}
}

function readRunMap(page: PageNode): RunMap {
	return parseRunMap(page.getPluginData(RUNS_KEY));
}

// Перезаписываем карту по текущему состоянию runs — проще, чем точечные
// обновления после каждой операции, а объёмы маленькие.
function syncRunMap(): void {
	// Страницу создаём, только когда есть что персистить: прогон с одними
	// созданными нодами (без копий) тоже должен пережить перезапуск.
	const page = runs.length ? ensureHistoryPage() : findHistoryPage();
	if (!page) return;
	const map: RunMap = {};
	for (const run of runs) {
		map[String(run.id)] = {
			ts: run.ts,
			prompt: run.prompt,
			created: [...run.created],
		};
	}
	try {
		page.setPluginData(RUNS_KEY, JSON.stringify(map));
		const rem: Record<string, string> = {};
		for (const [from, to] of remap) rem[from] = to;
		page.setPluginData(REMAP_KEY, JSON.stringify(rem));
	} catch {
		/* страница удалена/недоступна — откат останется только в памяти */
	}
}

// Верхнеуровневый предок ноды (ребёнок страницы).
function topAncestor(node: BaseNode | null): SceneNode | null {
	let cur = node;
	while (cur && cur.parent && cur.parent.type !== "PAGE") cur = cur.parent;
	if (!cur || cur.type === "PAGE" || cur.type === "DOCUMENT") return null;
	return cur as SceneNode;
}

async function removeBackups(run: Run): Promise<void> {
	for (const entry of run.entries) {
		try {
			const node = await figma.getNodeByIdAsync(entry.backupId);
			if (node && !node.removed) node.remove();
		} catch {
			/* уже удалена */
		}
	}
}

// Восстановление списка прогонов после запуска плагина: собираем его из
// копий и меты на странице истории. Легаси-копии старого формата ("1")
// удаляем — у них нет меты, откат по ним всё равно невозможен.
export async function restoreRuns(): Promise<void> {
	runs = [];
	current = null;
	remap.clear();
	const history = findHistoryPage();
	// Устаревшие копии со времён, когда backup лежал на рабочей странице.
	for (const p of figma.root.children) {
		if (p.type !== "PAGE" || p === history) continue;
		for (const n of [...p.children]) {
			if (n.getPluginData(BACKUP_KEY)) {
				try {
					n.remove();
				} catch {
					/* уже удалена */
				}
			}
		}
	}
	if (!history) return;
	const meta = readRunMap(history);
	// remap: {старый id: новый id} — плоская карта строк, не RunMap.
	try {
		const rem = JSON.parse(
			history.getPluginData(REMAP_KEY) || "{}",
		) as Record<string, unknown>;
		for (const [from, to] of Object.entries(rem)) {
			if (typeof to === "string") remap.set(from, to);
		}
	} catch {
		/* битая карта — без remap обойдёмся */
	}
	const byRun = new Map<number, Entry[]>();
	for (const child of [...history.children]) {
		const raw = child.getPluginData(BACKUP_KEY);
		if (!raw) continue;
		const m = parseBackupMeta(raw);
		if (!m) {
			try {
				child.remove();
			} catch {
				/* уже удалена */
			}
			continue;
		}
		const list = byRun.get(m.run) || [];
		list.push({
			topId: m.top,
			backupId: child.id,
			index: typeof m.index === "number" ? m.index : 0,
			name: typeof m.name === "string" ? m.name : child.name,
			page: typeof m.page === "string" ? m.page : "",
		});
		byRun.set(m.run, list);
	}
	const ids = new Set<number>([
		...byRun.keys(),
		...Object.keys(meta)
			.map(Number)
			.filter((n) => Number.isFinite(n)),
	]);
	for (const id of [...ids].sort((a, b) => a - b)) {
		const entries = byRun.get(id) || [];
		const info = meta[String(id)];
		// Мусорная запись: ни копий, ни созданных нод — нечему откатываться.
		if (!entries.length && !info?.created?.length) {
			delete meta[String(id)];
			continue;
		}
		runs.push({
			id,
			ts: typeof info?.ts === "number" ? info.ts : id,
			prompt: typeof info?.prompt === "string" ? info.prompt : "",
			entries,
			snapped: new Set(entries.map((e) => e.topId)),
			created: new Set(
				Array.isArray(info?.created)
					? info.created.filter(
							(x): x is string => typeof x === "string",
						)
					: [],
			),
		});
	}
	while (runs.length > MAX_RUNS) {
		const oldest = runs.shift() as Run;
		await removeBackups(oldest);
	}
	syncRunMap();
}

// Новый прогон агента. id монотонный (задаёт UI) — по нему идёт откат к сообщению.
export async function beginRun(id: number, prompt = ""): Promise<void> {
	current = {
		id,
		ts: Date.now(),
		prompt,
		entries: [],
		snapped: new Set(),
		created: new Set(),
	};
	// Слишком старые прогоны выбрасываем вместе с их копиями.
	while (runs.length >= MAX_RUNS) {
		const oldest = runs.shift() as Run;
		await removeBackups(oldest);
	}
	// Вытесненные прогоны должны исчезнуть и из сохранённой карты — иначе
	// после перезапуска их записи о созданных нодах воскреснут снова.
	syncRunMap();
}

function ensureTracked(): Run | null {
	if (!current) return null;
	if (!runs.includes(current)) {
		runs.push(current);
		syncRunMap();
	}
	return current;
}

export function recordCreated(id: string): void {
	const run = ensureTracked();
	if (!run) return;
	if (!run.created.has(id)) {
		run.created.add(id);
		syncRunMap();
	}
}

// Копия верхнего фрейма для каждого id (один раз за прогон). Ноды, созданные
// самим агентом в этом прогоне, не копируем — их при откате просто удалят.
export async function snapshotFor(ids: Iterable<string>): Promise<void> {
	if (!current) return;
	const history = findHistoryPage();
	for (const id of ids) {
		if (typeof id !== "string" || !id || id.startsWith("$")) continue;
		let node: BaseNode | null = null;
		try {
			node = await figma.getNodeByIdAsync(id);
		} catch {
			continue;
		}
		const top = topAncestor(node);
		if (!top || top.removed) continue;
		// Копии копий не нужны: ноды на странице истории пропускаем.
		if (history && top.parent === history) continue;
		if (current.snapped.has(top.id) || current.created.has(top.id))
			continue;
		current.snapped.add(top.id);
		try {
			const page = top.parent as PageNode;
			const index = page.children.indexOf(top);
			const backup = top.clone();
			const run = ensureTracked() as Run;
			const meta: BackupMeta = {
				run: run.id,
				top: top.id,
				index,
				page: page.id,
				name: top.name,
			};
			backup.setPluginData(BACKUP_KEY, JSON.stringify(meta));
			backup.name = `⟲ backup: ${top.name}`;
			backup.visible = false;
			backup.locked = true;
			// Копия уезжает на страницу истории — рабочая остаётся чистой,
			// а копия переживает перезапуск плагина.
			ensureHistoryPage().appendChild(backup);
			run.entries.push({
				topId: top.id,
				backupId: backup.id,
				index,
				name: top.name,
				page: page.id,
			});
		} catch {
			/* копия не получилась — откат этого блока будет недоступен */
		}
	}
}

// Был ли верхний фрейм скопирован в этом прогоне (значит, он существовал до агента).
export function isSnapshotTop(id: string): boolean {
	return !!current?.snapped.has(id);
}

// id прогонов, которые можно откатить (с изменениями на холсте).
export function undoableRuns(): number[] {
	return runs.map((r) => r.id);
}

// Версии для списка в UI: время и текст запроса каждого прогона.
export function runInfos(): { id: number; ts: number; prompt: string }[] {
	return runs.map((r) => ({ id: r.id, ts: r.ts, prompt: r.prompt }));
}

export function canUndo(): boolean {
	return runs.length > 0;
}

// Откатывает один прогон: копии на место, созданное — удалить.
async function revertRun(
	run: Run,
	restoredNodes: SceneNode[],
): Promise<number> {
	const history = findHistoryPage();
	let restored = 0;
	let removed = 0;
	for (const entry of [...run.entries].reverse()) {
		const backup = (await figma.getNodeByIdAsync(
			entry.backupId,
		)) as SceneNode | null;
		if (!backup || backup.removed) continue;
		const currentNode = await figma.getNodeByIdAsync(resolve(entry.topId));
		if (currentNode && !currentNode.removed) {
			try {
				currentNode.remove();
			} catch {
				/* нельзя удалить — оставим как есть */
			}
		}
		backup.locked = false;
		backup.visible = true;
		backup.name = entry.name;
		backup.setPluginData(BACKUP_KEY, "");
		// Возвращаем на страницу, откуда копировали; если её нет — на текущую.
		let page = figma.currentPage;
		if (entry.page && entry.page !== history?.id) {
			try {
				const p = await figma.getNodeByIdAsync(entry.page);
				if (p && p.type === "PAGE" && !p.removed) page = p as PageNode;
			} catch {
				/* страница недоступна — кладём на текущую */
			}
		}
		page.insertChild(Math.min(entry.index, page.children.length), backup);
		remap.set(entry.topId, backup.id);
		if (page === figma.currentPage) restoredNodes.push(backup);
		restored++;
	}
	for (const id of run.created) {
		const node = await figma.getNodeByIdAsync(resolve(id));
		if (node && !node.removed && node.type !== "PAGE") {
			try {
				node.remove();
				removed++;
			} catch {
				/* уже удалена вместе с родителем */
			}
		}
	}
	return restored + removed > 0 ? 1 : 0;
}

// Откат прогонов от fromId (включительно) до последнего, от новых к старым.
// Без аргумента — только последний прогон.
export async function undoRuns(
	fromId?: number,
): Promise<{ restored: number; removed: number; runs: number }> {
	const targets =
		fromId === undefined
			? runs.slice(-1)
			: runs.filter((r) => r.id >= fromId);
	let restoredNodes: SceneNode[] = [];
	let restored = 0;
	let removed = 0;
	for (const run of [...targets].reverse()) {
		const before = restoredNodes.length;
		await revertRun(run, restoredNodes);
		restored += restoredNodes.length - before;
		removed += run.created.size;
		runs = runs.filter((r) => r !== run);
		if (current === run) current = null;
	}
	syncRunMap();
	const page = figma.currentPage;
	restoredNodes = restoredNodes.filter((n) => !n.removed);
	if (restoredNodes.length) {
		page.selection = restoredNodes;
		figma.viewport.scrollAndZoomIntoView(restoredNodes);
	}
	return { restored, removed, runs: targets.length };
}

// Забываем прогоны от fromId и удаляем их копии: дизайн остаётся как есть,
// а откатиться к этим сообщениям уже не получится.
export async function dropRuns(fromId: number): Promise<void> {
	const dropped = runs.filter((r) => r.id >= fromId);
	for (const run of dropped) await removeBackups(run);
	runs = runs.filter((r) => r.id < fromId);
	if (current && current.id >= fromId) current = null;
	syncRunMap();
}

// Удалить одну версию из списка (кнопка «×» у версии), остальные не трогаем.
export async function dropRun(id: number): Promise<void> {
	const run = runs.find((r) => r.id === id);
	if (!run) return;
	await removeBackups(run);
	runs = runs.filter((r) => r !== run);
	if (current === run) current = null;
	syncRunMap();
}

// Полная очистка истории версий: удаляем все копии; страницу истории тоже
// убираем, если она пустая и не открыта у пользователя.
export async function clearRuns(): Promise<void> {
	for (const run of runs) await removeBackups(run);
	runs = [];
	current = null;
	remap.clear();
	const history = findHistoryPage();
	if (history) {
		for (const n of [...history.children]) {
			if (isBackup(n)) {
				try {
					n.remove();
				} catch {
					/* уже удалена */
				}
			}
		}
		history.setPluginData(RUNS_KEY, "");
		history.setPluginData(REMAP_KEY, "");
		if (!history.children.length && figma.currentPage !== history) {
			try {
				history.remove();
			} catch {
				/* страницу удалить нельзя — оставим пустую */
			}
		}
	}
}
