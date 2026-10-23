/// <reference types="@figma/plugin-typings" />
// Точка входа плагина: showUI, обмен сообщениями с ui.ts,
// оркестрация сборки/правок. Логика разнесена по модулям:
//   builder.ts    — построение нод из JSON-спеки
//   serializer.ts — сериализация канваса обратно в спеку
//   edits.ts      — точечные правки живых нод
//   paint.ts      — цвета/заливки/обводки/шрифты-хелперы
//   canvas-state  — общая изменяемая стейт-площадка
import type { AnySpec } from "./canvas-state";
import { state } from "./canvas-state";
import { runMcpTool } from "./mcp-tools";
import { buildRoot, placeAnchored, type ReplacePlace } from "./builder";
import { searchIn, type SearchNode } from "./search";
import { pageOutline, serializeNode, setSerializeLimits } from "./serializer";
import {
	availableFonts,
	flushStyleBindings,
	loadComponents,
	loadDesignSystem,
} from "./designsystem";
import { applyEditOp, type EditOp } from "./edits";
import { lint, setRequestLang, type Issue, type LintNode } from "./lint";
import {
	beginRun,
	clearRuns,
	dropRun,
	dropRuns,
	isSnapshotTop,
	recordCreated,
	restoreRuns,
	runInfos,
	snapshotFor,
	undoRuns,
	undoableRuns,
} from "./undo";

// PNG-превью узла для ревью по картинке (до ~1024px по большей стороне).
// Измеримые проблемы макета (вылезание, контраст, шкала отступов…) —
// уходят модели в ревью вместе с деревом и скриншотом.
function lintNodes(nodes: SceneNode[]): Issue[] {
	const out: Issue[] = [];
	for (const n of nodes) {
		try {
			out.push(...lint(n as unknown as LintNode));
		} catch {
			/* проверка не должна ломать сборку */
		}
	}
	return out.slice(0, 40);
}

async function previewOf(node: SceneNode | null): Promise<string | undefined> {
	if (!node || node.removed || !("exportAsync" in node)) return undefined;
	try {
		const scale = Math.min(
			2,
			Math.max(0.1, 1024 / Math.max(node.width, node.height, 1)),
		);
		const bytes = await node.exportAsync({
			format: "PNG",
			constraint: { type: "SCALE", value: scale },
		});
		return figma.base64Encode(bytes);
	} catch {
		return undefined;
	}
}

// Длинная страница экспортируется целиком, чтобы UI нарезал её на читаемые куски.
async function fullOf(
	node: SceneNode | null,
): Promise<
	{ data: string; scale: number; width: number; height: number } | undefined
> {
	if (!node || node.removed || !("exportAsync" in node)) return undefined;
	if (!(node.height > 1.6 * node.width && node.height > 1400))
		return undefined;
	try {
		const scale = Math.min(1, 1024 / node.width, 9000 / node.height);
		const bytes = await node.exportAsync({
			format: "PNG",
			constraint: { type: "SCALE", value: scale },
		});
		return {
			data: figma.base64Encode(bytes),
			scale,
			width: node.width,
			height: node.height,
		};
	} catch {
		return undefined;
	}
}

// id и parent из правок — чтобы перед применением сделать копии
// затрагиваемых блоков (для отката).
function editTargets(edits: EditOp[]): string[] {
	const ids: string[] = [];
	for (const op of edits) {
		for (const key of ["id", "parent"] as const) {
			const v = op?.[key];
			if (typeof v === "string") ids.push(v);
		}
		// group: цели лежат массивом в "ids".
		if (Array.isArray(op?.ids)) {
			for (const v of op.ids) if (typeof v === "string") ids.push(v);
		}
	}
	return ids;
}

// __html__ подставляет Figma — содержимое файла из поля "ui" манифеста.
declare const __html__: string;

function reportSelection(): void {
	const selection = figma.currentPage.selection;
	const outline = pageOutline();
	// Не сообщаем о фрейме, который только что построили сами —
	// он и так уходит модели как previousSpec.
	const onlyBuiltRoot =
		selection.length === 1 && selection[0].id === state.lastBuiltRootId;
	if (!selection.length || onlyBuiltRoot) {
		figma.ui.postMessage({
			type: "selection",
			spec: null,
			outline,
		});
		return;
	}
	state.serializedNodes = 0;
	const specs: AnySpec[] = [];
	// Выделенный блок — цель запроса: сериализуем глубже обычного.
	setSerializeLimits(300, 8);
	for (const node of selection) {
		const s = serializeNode(node as SceneNode, 0);
		if (s) specs.push(s);
	}
	setSerializeLimits();
	figma.ui.postMessage({
		type: "selection",
		spec: specs.length ? specs : null,
		names: selection.map((n) => n.name).slice(0, 3),
		count: specs.length,
		outline,
	});
	// Скриншот выделенного: модель видит блок, а не только дерево. Отправляем
	// следом, чтобы выделение не ждало экспорт; устаревший ответ отбрасываем.
	const first = selection[0] as SceneNode;
	void previewOf(first).then((image) => {
		const now = figma.currentPage.selection;
		if (image && now.length && now[0].id === first.id)
			figma.ui.postMessage({ type: "selection_image", id: first.id, image });
	});
}

figma.showUI(__html__, {
	width: 420,
	height: 660,
	title: "Vivi Agent",
	themeColors: true,
});

figma.ui.onmessage = async (msg: {
	type?: string;
	spec?: AnySpec;
	data?: unknown;
	id?: string;
	targetId?: string;
	ids?: unknown;
	runId?: number;
	from?: number;
	edits?: EditOp[];
	query?: string;
	prompt?: string;
	// Поиск нод: область, текст, тип, лимит
	in?: string;
	text?: boolean;
	nodeType?: string;
	limit?: number;
	offset?: number;
	reqId?: string;
	w?: number;
	h?: number;
	tool?: string;
	args?: unknown;
}) => {
	if (!msg || typeof msg !== "object") return;
	// Персист чата между запусками плагина
	if (msg.type === "save_chat") {
		try {
			await figma.clientStorage.setAsync("figma-agent-chat", msg.data);
		} catch {
			/* квота/доступ — молча пропускаем */
		}
		return;
	}
	// Пометки: скриншот выделенного фрейма + карта видимых нод (координаты
	// относительно фрейма) — по ней UI находит ноды под пометками.
	if (msg.type === "select_node" && typeof msg.id === "string") {
		const node = await figma.getNodeByIdAsync(msg.id);
		if (node && node.type !== "PAGE" && node.type !== "DOCUMENT" && !node.removed) {
			figma.currentPage.selection = [node as SceneNode];
			figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
		}
		return;
	}
	if (msg.type === "annotate_request") {
		const node = figma.currentPage.selection[0] as SceneNode | undefined;
		if (!node || !("exportAsync" in node) || !("absoluteBoundingBox" in node)) {
			figma.ui.postMessage({ type: "annotate_data", error: "Выделите фрейм, который хотите пометить" });
			return;
		}
		try {
			const box = node.absoluteBoundingBox;
			if (!box) throw new Error("нет границ");
			const scale = Math.min(2, 1100 / Math.max(box.width, box.height));
			const bytes = await node.exportAsync({
				format: "PNG",
				constraint: { type: "SCALE", value: scale },
			});
			const nodes: { id: string; name: string; x: number; y: number; w: number; h: number; depth: number }[] = [];
			const walk = (n: SceneNode, depth: number): void => {
				if (nodes.length >= 400 || depth > 8 || n.visible === false) return;
				const b = "absoluteBoundingBox" in n ? n.absoluteBoundingBox : null;
				if (b && n !== node)
					nodes.push({
						id: n.id,
						name: n.name,
						x: Math.round(b.x - box.x),
						y: Math.round(b.y - box.y),
						w: Math.round(b.width),
						h: Math.round(b.height),
						depth,
					});
				if ("children" in n && n.type !== "INSTANCE")
					for (const c of n.children) walk(c, depth + 1);
			};
			walk(node, 0);
			figma.ui.postMessage({
				type: "annotate_data",
				name: node.name,
				width: Math.round(box.width),
				height: Math.round(box.height),
				image: figma.base64Encode(bytes),
				nodes,
			});
		} catch (err) {
			figma.ui.postMessage({ type: "annotate_data", error: String(err) });
		}
		return;
	}
	// MCP: внешний агент читает дизайн (только чтение) — ответ уходит обратно через UI и мост.
	if (msg.type === "mcp_call" && typeof msg.reqId === "string") {
		const res = await runMcpTool(msg.tool, (msg.args && typeof msg.args === "object" ? msg.args : {}) as Record<string, unknown>);
		figma.ui.postMessage({ type: "mcp_result", reqId: msg.reqId, ...res });
		return;
	}
	if (msg.type === "serialize" && typeof msg.id === "string") {
		let spec: AnySpec | null = null;
		let image: string | undefined;
		try {
			const node = await figma.getNodeByIdAsync(msg.id);
			if (node && "exportAsync" in node && !node.removed) {
				state.serializedNodes = 0;
				spec = serializeNode(node as SceneNode, 0);
				image = await previewOf(node as SceneNode);
			}
		} catch {
			spec = null;
		}
		figma.ui.postMessage({ type: "serialized", id: msg.id, spec, image });
		return;
	}
	// Агент запросил визуальный просмотр нод — отдаём PNG base64.
	if (msg.type === "export" && Array.isArray(msg.ids)) {
		const images: {
			id: string;
			name: string;
			data: string;
			spec: AnySpec | null;
		}[] = [];
		const missing: string[] = [];
		for (const rawId of (msg.ids as unknown[]).slice(0, 4)) {
			const id = String(rawId);
			try {
				const node = await figma.getNodeByIdAsync(id);
				if (!node || !("exportAsync" in node)) {
					missing.push(id);
					continue;
				}
				const scene = node as SceneNode;
				// Ограничиваем скриншот ~1024px по большей стороне.
				const scale = Math.min(
					2,
					Math.max(
						0.1,
						1024 / Math.max(scene.width, scene.height, 1),
					),
				);
				const bytes = await (
					scene as SceneNode & ExportMixin
				).exportAsync({
					format: "PNG",
					constraint: { type: "SCALE", value: scale },
				});
				// Вместе со скриншотом отдаём сериализованное дерево ноды —
				// агент получает и картинку, и структуру.
				state.serializedNodes = 0;
				// Просмотр одной ноды — модель просила именно её, лимиты шире.
				setSerializeLimits(400, 10);
				const inspected = serializeNode(scene, 0);
				setSerializeLimits();
				images.push({
					id,
					name: scene.name,
					data: figma.base64Encode(bytes),
					spec: inspected,
				});
			} catch {
				missing.push(id);
			}
		}
		figma.ui.postMessage({ type: "exported", images, missing });
		return;
	}
	// Поиск нод для агента: по имени (и по тексту), на странице или внутри
	// одного фрейма (in), с фильтром по типу — когда дерево обрезано или
	// нужной ноды нет в outline.
	if (msg.type === "search" && typeof msg.query === "string") {
		let scope: SearchNode = figma.currentPage as unknown as SearchNode;
		let scopeName = "";
		let scopeError = "";
		if (typeof msg.in === "string" && msg.in) {
			try {
				const root = await figma.getNodeByIdAsync(msg.in);
				if (root && "findAll" in root && !root.removed) {
					scope = root as unknown as SearchNode;
					scopeName = root.name;
				} else scopeError = `нода ${msg.in} не найдена или без вложенных слоёв`;
			} catch {
				scopeError = `нода ${msg.in} недоступна`;
			}
		}
		const found = scopeError
			? { results: [], total: 0, truncated: false }
			: searchIn(scope, {
					query: msg.query,
					text: msg.text === true,
					type: typeof msg.nodeType === "string" ? msg.nodeType : undefined,
					limit: typeof msg.limit === "number" ? msg.limit : undefined,
					offset: typeof msg.offset === "number" ? msg.offset : undefined,
				});
		figma.ui.postMessage({
			type: "search_results",
			query: msg.query,
			total: found.total,
			truncated: found.truncated,
			offset: typeof msg.offset === "number" ? msg.offset : undefined,
			results: found.results,
			scope: scopeName || undefined,
			scopeId: scopeName ? msg.in : undefined,
			scopeError: scopeError || undefined,
			text: msg.text === true,
			nodeType: typeof msg.nodeType === "string" ? msg.nodeType : undefined,
		});
		return;
	}
	// Настройки плагина (правила, свои модели, названия моделей).
	if (msg.type === "save_settings") {
		try {
			await figma.clientStorage.setAsync(
				"figma-agent-settings",
				msg.data,
			);
		} catch {
			/* квота/доступ — настройки останутся только в этой сессии */
		}
		return;
	}
	// Вложения сообщений (для отката к ним) — отдельным ключом, чтобы не
	// раздувать хранилище чата.
	if (msg.type === "save_attachments") {
		try {
			await figma.clientStorage.setAsync(
				"figma-agent-attachments",
				msg.data,
			);
		} catch {
			/* квота/доступ — вложения останутся только в памяти UI */
		}
		return;
	}
	// Новый прогон агента: runId задаёт UI (монотонный) — по нему откат к сообщению.
	if (msg.type === "run_start") {
		setRequestLang(typeof msg.prompt === "string" ? msg.prompt : "");
		await beginRun(
			typeof msg.runId === "number" ? msg.runId : Date.now(),
			typeof msg.prompt === "string" ? msg.prompt : "",
		);
		// Снимок всего файла в историю версий Figma — страховка на случай,
		// если блочный откат чего-то не покроет. Сохраняется состояние ДО
		// изменений агента; без сохранённого файла API вернёт null — это ок.
		const title = `Vivi: ${(msg.prompt || "").trim().slice(0, 80) || "прогон"}`;
		void figma
			.saveVersionHistoryAsync(title, String(msg.prompt || ""))
			.catch(() => {});
		// Стили/переменные могли измениться — перечитываем.
		void loadDesignSystem().then(async (ds) =>
			figma.ui.postMessage({
				type: "design_system",
				ds,
				fonts: await availableFonts(),
				components: loadComponents(),
			}),
		);
		return;
	}
	// Откат к сообщению с возвратом дизайна: все прогоны от fromId включительно.
	if (msg.type === "undo_to" && typeof msg.from === "number") {
		const result = await undoRuns(msg.from);
		state.lastBuiltRootId = null;
		figma.ui.postMessage({
			type: "undone",
			...result,
			rollback: true,
			runs: undoableRuns(),
			versions: runInfos(),
		});
		return;
	}
	// Откат к сообщению, дизайн оставляем: забываем копии этих прогонов.
	if (msg.type === "drop_runs" && typeof msg.from === "number") {
		await dropRuns(msg.from);
		figma.ui.postMessage({
			type: "runs",
			runs: undoableRuns(),
			versions: runInfos(),
		});
		return;
	}
	// Удалить одну версию из списка — остальные версии не трогаем.
	if (msg.type === "drop_run" && typeof msg.runId === "number") {
		await dropRun(msg.runId);
		figma.ui.postMessage({
			type: "runs",
			runs: undoableRuns(),
			versions: runInfos(),
		});
		return;
	}
	// Полная очистка истории версий (кнопка «Очистить всё»).
	if (msg.type === "clear_history") {
		await clearRuns();
		figma.ui.postMessage({
			type: "runs",
			runs: undoableRuns(),
			versions: runInfos(),
		});
		return;
	}
	if (msg.type === "apply_edits" && Array.isArray(msg.edits)) {
		state.warnings.length = 0;
		state.infos.length = 0;
		state.nodeCount = 0;
		state.namedComponents.clear();
		state.prebuilt.clear();
		state.anchors.length = 0;
		await snapshotFor(editTargets(msg.edits as EditOp[]));
		const touched = new Set<string>();
		// $page — текущая страница: на ней можно создавать верхнеуровневые
		// фреймы (например, «Components») через insert.
		const aliases = new Map<string, string>([
			["page", figma.currentPage.id],
		]);
		for (const op of msg.edits as EditOp[]) {
			try {
				await applyEditOp(op, touched, aliases);
			} catch (err) {
				state.warnings.push(
					`${op?.op || "edit"}: ${String((err as Error)?.message || err)}`,
				);
			}
		}
		placeAnchored();
		// Возвращаем сериализованные верхние контейнеры затронутых
		// нод — агент ревьюит результат как после обычной сборки.
		const seen = new Set<string>();
		const tops: AnySpec[] = [];
		for (const id of touched) {
			try {
				let node = (await figma.getNodeByIdAsync(
					id,
				)) as BaseNode | null;
				while (
					node &&
					node.parent &&
					node.parent.type !== "PAGE" &&
					node.parent.type !== "DOCUMENT"
				)
					node = node.parent;
				if (
					node &&
					node.type !== "PAGE" &&
					node.type !== "DOCUMENT" &&
					!seen.has(node.id)
				) {
					seen.add(node.id);
					state.serializedNodes = 0;
					const s = serializeNode(node as SceneNode, 0);
					if (s) tops.push(s);
				}
			} catch {
				/* нода удалена в ходе правок */
			}
		}
		await flushStyleBindings();
		// Верхнеуровневые ноды, которых не было до агента (копии на странице,
		// результат make_component), при откате нужно удалять.
		for (const id of seen) {
			if (!isSnapshotTop(id)) recordCreated(id);
		}
		// Если правки касались одного верхнего контейнера — он же цель для
		// возможной пересборки после ревью (а не устаревший прошлый фрейм).
		state.lastBuiltRootId = seen.size === 1 ? [...seen][0] : null;
		const built =
			tops.length === 1
				? tops[0]
				: { type: "frame", name: "edits", children: tops };
		const topNodes: SceneNode[] = [];
		for (const id of seen) {
			const node = (await figma.getNodeByIdAsync(id)) as SceneNode | null;
			if (node) topNodes.push(node);
		}
		// Скриншот — самого дизайна: если правки задели и библиотеку
		// компонентов, и макет, модели важнее увидеть макет.
		const shot =
			topNodes.find((n) => n.name.trim().toLowerCase() !== "components") ||
			topNodes[0] ||
			null;
		figma.ui.postMessage({
			type: "built",
			rootId: state.lastBuiltRootId,
			count: state.nodeCount,
			infos: state.infos.slice(),
			warnings: state.warnings.slice(),
			issues: lintNodes(topNodes),
			spec: built,
			image: await previewOf(shot),
			full: await fullOf(shot),
			runs: undoableRuns(),
			versions: runInfos(),
		});
		return;
	}
	if ((msg.type === "build" || msg.type === "rebuild") && msg.spec) {
		state.warnings.length = 0;
		state.nodeCount = 0;
		state.namedComponents.clear();
		state.prebuilt.clear();
		state.anchors.length = 0;
		// Что уже лежит на странице — чтобы при ошибке убрать недостроенное.
		const before = new Set(figma.currentPage.children.map((n) => n.id));
		try {
			// Какую ноду заменяем: явный replace агента, а при исправлении после
			// ревью — последний построенный фрейм. Старую ноду удаляем только
			// ПОСЛЕ успешной сборки, иначе сбой стоил бы пользователю дизайна.
			const replacedId =
				typeof msg.targetId === "string" && msg.targetId
					? msg.targetId
					: msg.type === "rebuild"
						? state.lastBuiltRootId
						: null;
			let old: SceneNode | null = null;
			let place: ReplacePlace | null = null;
			if (replacedId) {
				try {
					const target = await figma.getNodeByIdAsync(replacedId);
					if (
						target &&
						"absoluteTransform" in target &&
						!target.removed
					) {
						old = target as SceneNode;
						const t = old.absoluteTransform;
						const parent = old.parent;
						place = {
							x: Math.round(t[0][2]),
							y: Math.round(t[1][2]),
							parent:
								parent && "children" in parent
									? (parent as BaseNode & ChildrenMixin)
									: null,
							index:
								parent && "children" in parent
									? (
											parent as ChildrenMixin
										).children.indexOf(old)
									: 0,
							sizingH:
								"layoutSizingHorizontal" in old
									? (old as FrameNode).layoutSizingHorizontal
									: undefined,
							sizingV:
								"layoutSizingVertical" in old
									? (old as FrameNode).layoutSizingVertical
									: undefined,
						};
					}
				} catch {
					/* нода уже удалена или недоступна */
				}
			}
			if (replacedId) await snapshotFor([replacedId]);
			const root = await buildRoot(msg.spec, place);
			recordCreated(root.id);
			// Новая нода уже на месте — убираем старую.
			if (old && !old.removed) {
				try {
					old.remove();
				} catch {
					/* нельзя удалить (например, часть инстанса) */
				}
			}
			// Возвращаем фактическое дерево — агент «смотрит» на результат
			state.serializedNodes = 0;
			await flushStyleBindings();
			const builtSpec = serializeNode(root as SceneNode, 0);
			figma.ui.postMessage({
				type: "built",
				rootId: state.lastBuiltRootId,
				count: state.nodeCount,
				warnings: state.warnings.slice(),
				spec: builtSpec,
				issues: lintNodes([root as SceneNode]),
				image: await previewOf(root as SceneNode),
				full: await fullOf(root as SceneNode),
				runs: undoableRuns(),
				versions: runInfos(),
			});
		} catch (err) {
			// Сборка упала — не оставляем на странице половину фрейма.
			for (const n of [...figma.currentPage.children]) {
				if (!before.has(n.id)) {
					try {
						n.remove();
					} catch {
						/* уже удалена */
					}
				}
			}
			figma.ui.postMessage({
				type: "build_error",
				message: String((err as Error)?.message || err),
			});
		}
		return;
	}
	// Режим MCP: окно плагина сжимается в маленький блок и обратно.
	if (msg.type === "resize_ui" && typeof msg.w === "number" && typeof msg.h === "number") {
		figma.ui.resize(Math.round(Math.min(900, Math.max(60, msg.w))), Math.round(Math.min(1000, Math.max(36, msg.h))));
		return;
	}
	if (msg.type === "close") figma.closePlugin();
};

// Следим за выделением и сообщаем UI, что агент сейчас «видит».
figma.on("selectionchange", reportSelection);
reportSelection();

// Стили и переменные файла — модели для ссылок по имени.
void loadDesignSystem().then(async (ds) =>
	figma.ui.postMessage({
		type: "design_system",
		ds,
		fonts: await availableFonts(),
		components: loadComponents(),
	}),
);

// Восстанавливаем список прогонов из копий на странице истории — откат
// и список версий переживают пересборку и перезапуск плагина.
void restoreRuns().then(() =>
	figma.ui.postMessage({
		type: "versions",
		runs: undoableRuns(),
		versions: runInfos(),
	}),
);

// Настройки: правила и свои модели.
figma.clientStorage
	.getAsync("figma-agent-settings")
	.then((data) => {
		if (data) figma.ui.postMessage({ type: "settings_restore", data });
	})
	.catch(() => {});

// Вложения прошлых сообщений — чтобы откат к ним их возвращал.
figma.clientStorage
	.getAsync("figma-agent-attachments")
	.then((data) => {
		if (data) figma.ui.postMessage({ type: "attachments_restore", data });
	})
	.catch(() => {});

// Восстанавливаем прошлый чат; шлём при успешном чтении, даже пустом —
// по этому сигналу UI разрешает запись в хранилище. При ошибке чтения
// сигнала нет: запись остаётся заблокированной и не затирает историю.
figma.clientStorage
	.getAsync("figma-agent-chat")
	.then((data) => {
		figma.ui.postMessage({ type: "chat_restore", data: data || {} });
	})
	.catch(() => {});
