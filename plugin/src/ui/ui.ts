// UI плагина — чат с агентом, как в IDE.
// Точка входа: WebSocket к локальному мосту (server/index.mjs),
// обмен с code.ts (сборка/правки/выделение), обработчики кнопок.
// Лента сообщений — chat.ts, дропдаун моделей — models.ts,
// общее состояние — ui-state.ts.
import type { DesignSpec } from "../spec";
import {
	S,
	MAX_REVIEWS,
	MAX_INSPECTS,
	MAX_PHOTOS,
	MAX_SAME_WARNINGS,
	MAX_SAME_REMAINING,
} from "./ui-state";
import {
	activeChatId,
	addUserMessage,
	appendThought,
	chatContext,
	closeThought,
	endRun,
	finishRun,
	persistChat,
	pinDots,
	pushAgentText,
	pushStep,
	pushTool,
	removeDots,
	restoreChat,
	setPlan,
	setPlanDone,
	setChatSummary,
	setChatCtx,
	chatCtx,
	chatList,
	switchChat,
	chatPlan,
	clearInterrupted,
	saveInterrupted,
	showInterruptedPrompt,
	updateInterrupted,
	setInterruptedHandlers,
	type InterruptedRun,
} from "./chat";
import { initPlan, showChecklist } from "./plan";
import type { Attachment } from "./attachments";
import { activeModelId } from "./settings-core";
import { planTiles, sliceImage } from "./tiles";
import { initContextRing, renderRing, setCompacting } from "./context-ring";
import {
	activeEffort,
	activeFast,
	activeModel,
	closeDropdown,
	lockModelSelect,
	refreshModels,
	refreshItemTags,
	setModelChangeHandler,
	setReloadHandler,
	setPrefsChangeHandler,
} from "./models";
import {
	saveSettingsNow,
	initSettings,
	normalizeSettings,
	onCatalogUpdate,
	refreshSettingsView,
	setBridgeTokenChangeHandler,
} from "./settings";
import { initRollback, onRollbackReply } from "./rollback";
import { closeVersions, initVersions, onVersionsReply } from "./versions";
import { closeChats, initChats } from "./chats";
import { PROTOCOL, staleProblem } from "./build-check";
import { applyMcpMode, initMcpMode, noteMcpCall, setMcpConnected } from "./mcp-mode";
import { dismissBrief, showBrief } from "./brief";
import { fallbackActions, mergeAction } from "./quick-core";
import { mixColors } from "./palette";
import { refModeOf, wantsStyleTransfer } from "./ref-mode";
import { extractStyle } from "./style-extract";
import { dismissVariants, showVariants } from "./variants";
import { priorSpecFor } from "./selection-context";
import { styleOps } from "./style-apply";
import { clearStyleCard, showStyleCard } from "./style-card";
import { initAnnotate, onAnnotateData, setAnnotateVisible } from "./annotate";
import { clearQuick, showQuick } from "./quick";
import {
	attachments,
	clearAttachments,
	initAttachments,
	serializeAttachments,
} from "./attachments";

const WS_URL = "ws://localhost:8787";
const CLIENT_ID = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
const TERMINAL_ROUNDS = new Set([
	"done",
	"inspect",
	"search",
	"photos",
	"ask",
	"schema",
	"mcp_call",
	"error",
	"critique",
]);
const INTERRUPTED_REMAINING =
	"The previous run was interrupted (connection lost) before it finished. Compare the current result with the user's request and the plan, and build what is still missing.";

const promptEl = document.getElementById("prompt") as HTMLTextAreaElement;
const sendBtn = document.getElementById("send") as HTMLButtonElement;
const cancelBtn = document.getElementById("cancel") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const selChip = document.getElementById("sel") as HTMLElement;
const selLabel = document.getElementById("sel-label") as HTMLElement;
const selClear = document.getElementById("sel-clear") as HTMLButtonElement;

let ws: WebSocket | null = null;
let immediateReconnect = false;
let reconnectTimer: number | undefined;
let reconnectDeadlineTimer: number | undefined;

function setStatus(text: string, isError = false): void {
	statusEl.textContent = text;
	statusEl.className = isError ? "error" : "";
}

function setBusy(value: boolean): void {
	S.busy = value;
	renderRing();
	cancelBtn.hidden = !value;
	syncSendBtn();
	if (value) pinDots();
	else removeDots();
	// Прогон кончился (любой причиной): его контекст — в его беседу,
	// а в S подставляем контекст отображаемой.
	if (!value) {
		dismissBrief();
		endRun();
	}
}

// Повторный запрос к модели с тем же контекстом (inspect, review).
// Прошлый дизайн чата — только если он относится к выделению (или выделения нет).
function priorSpec(): typeof S.lastSpec | undefined {
	// После первой сборки прогона lastSpec — уже результат этого прогона.
	if (S.reviewCount > 0 || S.reviewExtra) return S.lastSpec || undefined;
	return priorSpecFor(S.lastSpec, S.selectionHidden ? null : S.selectionSpec);
}

// «Сделай как этот блок»: выделено 2+ нод и запрос про стиль — первая нода
// источник, остальные цели. Стиль извлекаем из её сериализованной спеки.
// Выделение для переноса стиля: первая нода — источник (⇄ меняет порядок).
function orderedSelection(): unknown[] | null {
	const sel = S.selectionHidden ? null : S.selectionSpec;
	if (!Array.isArray(sel) || sel.length < 2) return null;
	return S.styleSwap ? [...sel].reverse() : sel;
}

// Кнопка «Стиль»: перенос без модели — правки по рангам цветов и ролям шрифтов.
function applyStyleDirect(): void {
	const sel = orderedSelection() as { id?: string; name?: string }[] | null;
	if (!sel || S.busy) return;
	const style = extractStyle(sel[0] as never);
	const edits = sel.slice(1).flatMap((t) => styleOps(style, t as never));
	const names = `«${sel[0].name}» → ${sel.slice(1).map((t) => `«${t.name}»`).join(", ")}`;
	if (!edits.length) {
		pushStep(`Стиль ${names}: менять нечего — уже совпадает`, { status: "info" });
		return;
	}
	S.runId = Math.max(Date.now(), S.runId + 1);
	parent.postMessage(
		{ pluginMessage: { type: "run_start", runId: S.runId, prompt: "Применить стиль" } },
		"*",
	);
	parent.postMessage({ pluginMessage: { type: "apply_edits", edits } }, "*");
	pushStep(`Стиль ${names}: правок — ${edits.length}`, { status: "info" });
}

function styleSourceOf():
	| { from: string; to: string[]; style: unknown }
	| undefined {
	const sel = orderedSelection();
	if (!sel || !wantsStyleTransfer(S.lastPrompt, sel.length)) return undefined;
	const names = sel.map((n) => String((n as { name?: string }).name || "node"));
	return {
		from: names[0],
		to: names.slice(1),
		style: extractStyle(sel[0] as never),
	};
}

function sendGenerate(extra: Record<string, unknown>): void {
	// Ревью-раунд запоминаем: ответы на inspect/search внутри него должны
	// повторить запрос с теми же review-полями, а не стать обычным запросом.
	if (extra.review === true) {
		S.reviewExtra = {
			review: true,
			warnings: extra.warnings,
			issues: extra.issues,
			finalCheck: extra.finalCheck,
			unresolved: extra.unresolved,
			continueWork: extra.continueWork,
			remaining: extra.remaining,
		};
	}
	// Скриншот выделения — один раз за прогон, в первом раунде.
	const selectionImage =
		!S.selectionImageSent && !S.selectionHidden && S.selectionSpec && S.selectionImage
			? S.selectionImage
			: undefined;
	if (selectionImage) S.selectionImageSent = true;
	const fallback = !!S.runModel;
	const payload: Record<string, unknown> = {
		selectionImage,
		type: "generate",
		model: S.runModel || activeModel() || "sonnet",
		...(fallback
			? {}
			: {
					effort: activeEffort(),
					fast: activeFast() || undefined,
				}),
		chatKey: S.runChatId || activeChatId(),
		prompt: S.lastPrompt,
		previousSpec: priorSpec(),
		selection: S.selectionHidden ? undefined : S.selectionSpec || undefined,
		page: S.pageOutline.length ? S.pageOutline : undefined,
		designSystem: S.designSystem || undefined,
		components: S.components.length ? S.components : undefined,
		fonts: S.fonts.length ? S.fonts : undefined,
		// Один бриф на задачу; в настройках можно выключить.
		noAsk: S.briefAsked || !S.settings.askBrief || undefined,
		checklist: S.checklist.length ? S.checklist : undefined,
		checked: S.checklist.length ? S.checked : undefined,
		plan: S.plan.length ? S.plan : undefined,
		planDone: S.plan.length && S.planDone.length ? S.planDone : undefined,
		rules: S.settings.rules.trim() || undefined,
		userImages: S.runImages.length ? S.runImages : undefined,
		refMode: S.runRefMode || undefined,
		refPalette: S.runPalette.length ? S.runPalette : undefined,
		styleSource: styleSourceOf(),
		teach: S.settings.teach || undefined,
		allowVariants: S.settings.offerVariants || undefined,
		userFiles: S.runFiles.length ? S.runFiles : undefined,
		docNotes: S.docNotes || undefined,
		// Сообщения, написанные пользователем, пока агент работал.
		userUpdates: S.runUpdates.length ? S.runUpdates : undefined,
		// Транскрипт беседы — контекст для stateless-агентов.
		...chatContext(),
		...extra,
	};
	S.updatesDelivered = S.runUpdates.length;
	S.inflight = payload;
	sendPayload(payload);
}

// Картинки ревью: общий вид (уменьшенный) и куски длинной страницы с подписями.
function reviewImages(): { data: string; mimeType: string; label: string }[] {
	if (!S.lastImage) return [];
	return [
		{
			data: S.lastImage,
			mimeType: "image/png",
			label: "whole result, scaled down",
		},
		...S.lastTiles,
	];
}

// Нарезка длинного скриншота; ошибка нарезки — ревью без кусков.
async function tilesOf(full: {
	data: string;
	scale: number;
	height: number;
}): Promise<{ data: string; mimeType: "image/jpeg"; label: string }[]> {
	try {
		const tiles = planTiles(full.height * full.scale);
		const parts = await sliceImage(full.data, tiles);
		return parts.map((data, i) => ({
			data,
			mimeType: "image/jpeg" as const,
			label: `part ${i + 1}/${parts.length}, y ${Math.round(tiles[i].y0 / full.scale)}–${Math.round(tiles[i].y1 / full.scale)} of the root frame`,
		}));
	} catch {
		return [];
	}
}

// Ключ модели для критика: выбранная в настройках, иначе модель прогона.
function criticModelId(): string {
	const picked = S.settings.criticModel;
	if (picked && S.merged.some((m) => m.id === picked))
		return activeModelId(picked, S.merged, S.settings.prefs);
	return S.runModel || activeModel() || "sonnet";
}

function sendPayload(payload: Record<string, unknown>): void {
	if (!ws || ws.readyState !== WebSocket.OPEN) {
		if (S.busy) {
			S.inflight = payload;
			S.inflightUnsent = true;
		}
		return;
	}
	S.inflight = payload;
	S.inflightUnsent = false;
	ws.send(JSON.stringify(payload));
}

// Модель хочет завершить, но сама сообщила, что часть не сделана
// («remaining»): отправляем раунд продолжения вместо завершения. Не
// продолжаем, если она пометила остаток невыполнимым (blocked) или
// несколько раз подряд не продвинулась.
function continueIfUnfinished(blocked: boolean): boolean {
	if (!S.remaining || blocked || !ws || ws.readyState !== WebSocket.OPEN)
		return false;
	S.remainingRepeat =
		S.remaining === S.remainingKey ? S.remainingRepeat + 1 : 0;
	S.remainingKey = S.remaining;
	if (S.remainingRepeat >= MAX_SAME_REMAINING) return false;
	pushTool("continue");
	sendGenerate({
		review: true,
		continueWork: true,
		remaining: S.remaining,
		previousSpec: priorSpec(),
		warnings: S.runWarnings,
		issues: S.runIssues,
		images: reviewImages(),
	});
	return true;
}

// Требования чек-листа, не отмеченные выполненными.
function uncheckedRequirements(): string[] {
	const done = new Set(S.checked);
	return S.checklist.filter((_, i) => !done.has(i + 1));
}

// Расход прогона одной строкой: раунды, токены, стоимость, время.
function usageLine(): string {
	const u = S.runUsage;
	if (!u.rounds) return "";
	const k = (n: number) =>
		n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
	const parts = [`раундов: ${u.rounds}`];
	if (u.input || u.output)
		parts.push(
			`токены: ${k(u.input + u.cached)} вход / ${k(u.output)} выход`,
		);
	if (u.cost) parts.push(`${u.cost.toFixed(2)}`);
	if (S.runStarted) {
		const sec = Math.round((Date.now() - S.runStarted) / 1000);
		parts.push(
			sec >= 60
				? `${Math.floor(sec / 60)} мин ${sec % 60} с`
				: `${sec} с`,
		);
	}
	return parts.join(" · ");
}

// Клик по быстрому действию: пустое поле — сразу запрос, иначе дописываем.
function pickQuick(action: string): void {
	const merged = mergeAction(promptEl.value, action);
	promptEl.value = merged.text;
	promptEl.dispatchEvent(new Event("input"));
	if (merged.send) sendPrompt();
	else promptEl.focus();
}

// Единая точка завершения прогона. approved — модель сама одобрила результат;
// иначе остановились по лимиту проверок.
function completeRun(approved: boolean): void {
	// Сообщение пришло, когда раунд уже шёл: модель его ещё не видела — ещё раунд.
	if (
		approved &&
		S.runUpdates.length > S.updatesDelivered &&
		ws &&
		ws.readyState === WebSocket.OPEN
	) {
		pushTool("новое сообщение");
		sendGenerate({
			review: true,
			previousSpec: S.lastSpec || undefined,
			warnings: S.runWarnings,
			images: S.lastImage ? [{ data: S.lastImage, mimeType: "image/png" }] : undefined,
		});
		return;
	}
	S.reviewExtra = null;
	S.inflight = null;
	S.inflightUnsent = false;
	S.runModel = "";
	S.fallbackUsed = false;
	clearInterrupted();
	finishRun();
	const lines: string[] = [];
	if (S.remaining) lines.push(`Не доделано: ${S.remaining}`);
	if (!approved)
		lines.push(
			"Остановился по лимиту проверок — последние изменения не подтверждены моделью",
		);
	for (const w of S.runWarnings.slice(0, 5)) lines.push(`⚠ ${w}`);
	if (S.runIssues.length)
		lines.push(
			`Проверка макета: осталось замечаний — ${S.runIssues.length}`,
		);
	// План этого прогона доведён до конца — отмечаем все части.
	if (approved && !S.remaining && S.planInRun && S.plan.length)
		setPlanDone(S.plan.map((_, i) => i + 1));
	if (S.checklist.length) {
		const open = uncheckedRequirements();
		lines.push(
			`Требования: ${S.checklist.length - open.length}/${S.checklist.length}${open.length ? `, не сделано: ${open.join("; ")}` : ""}`,
		);
	}
	const usage = usageLine();
	if (usage) lines.push(usage);
	if (lines.length)
		pushStep(S.remaining || !approved ? "Итог: не завершено" : "Итог", {
			warnings: lines,
		});
	// Итог пишем до endRun: он должен попасть в беседу прогона.
	setBusy(false);
	// Кнопки следующих шагов — только у законченной работы (setBusy(false)
	// уже сбросил прежние).
	if (approved && !S.remaining) {
		const actions = S.nextActions.length
			? S.nextActions
			: fallbackActions(S.lastSpec as never);
		showQuick(actions, pickQuick);
	}
}

// Версии: мост старого протокола или исходники плагина новее сборки.
// Предупреждение один раз на сессию UI — переподключения его не дублируют.
let versionWarned = false;
function checkVersions(protocol?: number, build?: string): void {
	if (versionWarned) return;
	const problem = staleProblem(PROTOCOL, protocol, __BUILD_ID__, build);
	if (!problem) return;
	versionWarned = true;
	pushStep(problem, { status: "error" });
}

function handleServerMessage(msg: {
	type: string;
	text?: string;
	message?: string;
	models?: { id: string; label: string }[];
	providers?: { id: string; label: string }[];
	resumed?: boolean;
	busy?: boolean;
	provider?: string;
	spec?: DesignSpec;
	rootId?: string;
	ok?: boolean;
	review?: boolean;
	ids?: string[];
	reason?: string;
	replace?: string;
	summary?: string;
	edits?: Record<string, unknown>[];
	remaining?: string;
	blocked?: boolean;
	notes?: string;
	query?: string;
	count?: number;
	raw?: string;
	say?: boolean;
	// Поиск нод (search / search_results)
	in?: string;
	nodeType?: string;
	limit?: number;
	offset?: number;
	scope?: string;
	scopeId?: string;
	scopeError?: string;
	total?: number;
	provider_unavailable?: boolean;
	protocol?: number;
	image?: string;
	variants?: string[];
	next?: string[];
	questions?: { id: string; q: string; options: string[]; multi: boolean }[];
	build?: string;
	problems?: { id?: string; problem: string; fix?: string }[];
	failed?: boolean;
	service?: boolean;
	attempt?: number;
	of?: number;
	wait?: number;
}): void {
	const completedPayload = S.inflight;
	if (TERMINAL_ROUNDS.has(msg.type)) {
		S.inflight = null;
		S.inflightUnsent = false;
	}
	// После «Стоп» запоздавшие ответы текущего прогона игнорируем.
	if (
		(msg.type === "inspect" ||
			msg.type === "done" ||
			msg.type === "photos" ||
			msg.type === "search" ||
			msg.type === "critique") &&
		!S.busy
	)
		return;
	switch (msg.type) {
		case "ready":
			setStatus("");
			setMcpConnected(true);
			checkVersions(msg.protocol, msg.build);
			S.serverModels = msg.models || [];
			S.providers = msg.providers || [];
			refreshModels();
			refreshSettingsView();
			S.disconnectedAt = 0;
			window.clearTimeout(reconnectDeadlineTimer);
			if (S.busy && msg.resumed === true) {
				if (S.inflightUnsent && S.inflight) sendPayload(S.inflight);
			} else if (S.busy && msg.resumed === false && S.inflight) {
				pushStep("Переподключился — повторяю раунд", {
					status: "info",
				});
				sendPayload(S.inflight);
			}
			// Доступны все модели провайдеров: запрашиваем их каталоги.
			for (const p of S.providers) {
				const entry = S.catalog[p.id];
				if (!entry || entry.error) requestModels(p.id, false);
			}
			break;
		case "retry":
			pushStep(
				`Сбой модели, повтор через ${Math.ceil((msg.wait || 0) / 1000)} с (${msg.attempt || 0}/${msg.of || 0})`,
				{ status: "info" },
			);
			break;
		case "models_list": {
			// Список доступных моделей провайдера для выбора в настройках.
			const m = msg as unknown as {
				provider: string;
				error?: string;
				note?: string;
				models?: import("./settings-core").CatalogModel[];
				families?: import("./settings-core").ModelFamily[];
			};
			S.catalog[m.provider] = m.error
				? { error: m.error }
				: {
						models: m.models || [],
						families: m.families,
						note: m.note,
					};
			refreshModels();
			onCatalogUpdate();
			break;
		}
		case "chunk":
			// Тело ответа — это JSON-спека, в чат не выводим.
			break;
		case "thought":
			appendThought(msg.text || "");
			break;
		case "usage": {
			const u = msg as unknown as Record<string, number>;
			// Служебный вызов (сжатие, критик без раунда): учитываем токены и стоимость,
			// но не раунд и не кольцо контекста; вне прогона — игнорируем.
			if (msg.service === true) {
				if (S.busy) {
					S.runUsage.input += u.input || 0;
					S.runUsage.output += u.output || 0;
					S.runUsage.cached += u.cached || 0;
					S.runUsage.cost += u.cost || 0;
				}
				break;
			}
			S.runUsage.rounds++;
			S.runUsage.input += u.input || 0;
			S.runUsage.output += u.output || 0;
			S.runUsage.cached += u.cached || 0;
			S.runUsage.cost += u.cost || 0;
			// Занято окна: реальный размер запроса этого раунда (ввод + кэш; ответ
			// в следующий запрос не входит — агент без памяти). Обновляется после
			// каждого раунда.
			if (u.window > 0) S.ctxWindow = u.window;
			const used = (u.input || 0) + (u.cached || 0);
			if (used > 0) setChatCtx(used);
			break;
		}
		case "ctx": {
			// Оценка размера запроса в момент отправки раунда (до ответа модели).
			const c = msg as unknown as { tokens?: number; window?: number };
			if (typeof c.window === "number" && c.window > 0)
				S.ctxWindow = c.window;
			if (typeof c.tokens === "number" && c.tokens > 0)
				setChatCtx(c.tokens);
			break;
		}
		case "summary": {
			const m = msg as unknown as {
				text?: string;
				covers?: number;
				failed?: boolean;
				nothing?: boolean;
				manual?: boolean;
				removed?: number;
				added?: number;
			};
			// Ручное сжатие — для той беседы, где нажали кнопку.
			const chatId = m.manual ? compactChatId : undefined;
			if (m.manual) {
				compactChatId = undefined;
				setCompacting(false);
			}
			if (m.nothing) {
				pushStep("История короткая — сжимать нечего", {
					status: "info",
				});
			} else if (m.failed) {
				pushStep(
					m.manual
						? "Не удалось сжать историю"
						: "Не удалось сжать историю — отправлено как есть",
					{ status: "error" },
				);
			} else if (typeof m.text === "string" && m.covers) {
				setChatSummary(m.text, m.covers, chatId);
				if (
					typeof m.removed === "number" &&
					typeof m.added === "number"
				)
					setChatCtx(chatCtx(chatId) - m.removed + m.added, chatId);
				pushStep(`История сжата · ${m.covers} сообщ. в выжимке`, {
					status: "info",
				});
			}
			break;
		}
		case "plan": {
			const plan = (msg as unknown as { plan?: unknown[] }).plan;
			if (Array.isArray(plan)) {
				S.plan = plan.filter((p): p is string => typeof p === "string");
				S.planDone = [];
				S.planInRun = true;
				if (S.plan.length) setPlan(S.plan);
			}
			break;
		}
		case "checklist": {
			const items = (msg as unknown as { items?: unknown[] }).items;
			if (Array.isArray(items)) {
				S.checklist = items.filter((t): t is string => typeof t === "string");
				S.checked = [];
				showChecklist(S.checklist);
			}
			break;
		}
		case "checked": {
			const done = (msg as unknown as { done?: unknown[] }).done;
			if (Array.isArray(done)) {
				S.checked = done.map(Number).filter((n) => Number.isInteger(n));
				showChecklist(S.checklist, S.checked);
			}
			break;
		}
		case "plan_done": {
			const done = (msg as unknown as { done?: unknown[] }).done;
			if (Array.isArray(done)) {
				S.planDone = done
					.map(Number)
					.filter((n) => Number.isInteger(n));
				setPlanDone(S.planDone);
			}
			break;
		}
		case "inspect":
			// Агент хочет визуально посмотреть ноды — просим code.ts
			// отдать PNG-скриншоты и повторяем запрос с картинками.
			closeThought();
			if (S.inspectCount >= MAX_INSPECTS) {
				sendGenerate({ noInspect: true });
				break;
			}
			S.inspectCount++;
			// Сначала реплика агента («посмотрю…»), потом сам вызов инструмента.
			if (msg.notes) S.docNotes = msg.notes;
			if (msg.reason) pushAgentText(msg.reason);
			pushTool(`inspect [${(msg.ids || []).join(", ")}]`);
			parent.postMessage(
				{ pluginMessage: { type: "export", ids: msg.ids || [] } },
				"*",
			);
			break;
		case "search":
			// Агент ищет ноды по имени — code.ts вернёт список совпадений.
			closeThought();
			if (msg.notes) S.docNotes = msg.notes;
			if (msg.reason) pushAgentText(msg.reason);
			pushTool(
				`search "${msg.query || ""}"${msg.in ? ` in ${msg.in}` : ""}${msg.text ? " +text" : ""}${msg.nodeType ? ` [${msg.nodeType}]` : ""}`,
			);
			parent.postMessage(
				{
					pluginMessage: {
						type: "search",
						query: msg.query || "",
						in: msg.in,
						text: msg.text,
						nodeType: msg.nodeType,
						limit: msg.limit,
						offset: msg.offset,
					},
				},
				"*",
			);
			break;
		case "mcp_call": {
			// Внешний агент (MCP) просит прочитать дизайн: пересылаем в main-код плагина.
			noteMcpCall();
			const call = msg as unknown as { reqId?: string; tool?: string; args?: unknown };
			parent.postMessage(
				{ pluginMessage: { type: "mcp_call", reqId: call.reqId, tool: call.tool, args: call.args } },
				"*",
			);
			break;
		}
		case "schema": {
			// Агент просит полную схему редкого типа — сервер вернёт её текстом.
			closeThought();
			if (msg.notes) S.docNotes = msg.notes;
			if (msg.reason) pushAgentText(msg.reason);
			if (S.schemaCount >= 4) {
				pushStep("Модель слишком часто просит схемы — запрос остановлен", { status: "error" });
				completeRun(false);
				break;
			}
			S.schemaCount++;
			pushTool(`schema ${(msg as { name?: string }).name || ""}`);
			sendGenerate({
				...(S.reviewExtra ? { ...S.reviewExtra, previousSpec: priorSpec() } : {}),
				schemaName: (msg as { name?: string }).name,
			});
			break;
		}
		case "photos":
			// Агент просит превью стоковых фото — сервер уже нашёл
			// кандидатов, повторяем запрос: их превью уйдут image-блоками.
			closeThought();
			if (msg.notes) S.docNotes = msg.notes;
			if (msg.reason) pushAgentText(msg.reason);
			if (S.photoCount >= MAX_PHOTOS) {
				sendGenerate({ noPhotos: true });
				break;
			}
			S.photoCount++;
			pushTool(`photos "${msg.query || ""}" ×${msg.count ?? 0}`);
			sendGenerate({ photos: true });
			break;
		case "ask": {
			// Бриф: ждём ответов пользователя, прогон остаётся активным.
			closeThought();
			if (msg.notes) S.docNotes = msg.notes;
			S.briefAsked = true;
			pushTool("brief");
			showBrief(msg.questions || [], msg.summary || "", (answers) => {
				if (!S.busy) return;
				sendGenerate(
					answers
						? { briefAnswers: answers }
						: { briefSkipped: true },
				);
			});
			break;
		}
		case "done":
			closeThought();
			// Ревью завершено одобрением — правок нет.
			S.remaining = msg.remaining || "";
			if (msg.next?.length) S.nextActions = msg.next;
			updateInterrupted({
				remaining: S.remaining || undefined,
				plan: S.plan.slice(),
				planDone: S.planDone.slice(),
			});
			// Выжимка агента по документам — заменяет их полный текст.
			if (msg.notes) S.docNotes = msg.notes;
			if (msg.notes && S.runRefMode === "mood" && !S.styleCardShown)
				S.styleCardShown = showStyleCard(msg.notes);
			if (msg.review && msg.ok) {
				// Одобрил, но не все требования отмечены, а «Не доделано» пусто —
				// один раунд продолжения (дальше принимаем как есть).
				const unchecked = uncheckedRequirements();
				if (!S.remaining && !msg.blocked && unchecked.length && S.checkRetries < 1) {
					S.checkRetries++;
					S.remaining = `Requirements not checked yet: ${unchecked.join("; ")}`;
				}
				if (continueIfUnfinished(!!msg.blocked)) break;
				const open = ws && ws.readyState === WebSocket.OPEN;
				const shot = reviewImages();
				// Модель одобрила, но часть операций не выполнилась: возвращаем её
				// их исправлять, пока не исправит (останавливаемся, только если
				// она раз за разом оставляет те же самые ошибки).
				if (S.runWarnings.length && open) {
					const key = S.runWarnings.join("|");
					S.warnRepeat = key === S.warnKey ? S.warnRepeat + 1 : 0;
					S.warnKey = key;
					if (S.warnRepeat < MAX_SAME_WARNINGS) {
						pushTool("fix warnings");
						sendGenerate({
							review: true,
							unresolved: true,
							previousSpec: priorSpec(),
							warnings: S.runWarnings,
							issues: S.runIssues,
							images: shot,
						});
						break;
					}
				}
				// Финальная перепроверка всего результата по каждому пункту запроса:
				// модель одобряет только после неё. Любая правка снова запускает цикл.
				if (!S.finalChecked && S.reviewCount > 0 && open) {
					S.finalChecked = true;
					pushTool("audit");
					sendGenerate({
						review: true,
						finalCheck: true,
						previousSpec: priorSpec(),
						warnings: S.runWarnings,
						issues: S.runIssues,
						images: shot,
					});
					break;
				}
				if (
					S.settings.critic &&
					!S.critiqued &&
					S.reviewCount > 0 &&
					open
				) {
					S.critiqued = true;
					S.pendingSummary = msg.summary || "";
					pushTool("critic");
					const criticId = criticModelId();
					const sameModel =
						criticId === (S.runModel || activeModel());
					sendGenerate({
						critique: true,
						model: criticId,
						...(sameModel
							? {}
							: { effort: undefined, fast: undefined }),
						previousSpec: priorSpec(),
						issues: S.runIssues,
						images: shot,
					});
					break;
				}
				if (msg.summary) pushAgentText(msg.summary);
				completeRun(true);
				break;
			}
			// Модель ответила просто текстом (вопрос/пояснение) —
			// показываем реплику и завершаем прогон без ошибки.
			if (msg.say) {
				if (msg.summary) pushAgentText(msg.summary);
				if (continueIfUnfinished(!!msg.blocked)) break;
				completeRun(true);
				break;
			}
			// Пустые правки — вопрос/разговор: нечего применять и ревьюить.
			if (Array.isArray(msg.edits) && !msg.edits.length) {
				if (msg.summary) pushAgentText(msg.summary);
				if (continueIfUnfinished(!!msg.blocked)) break;
				completeRun(true);
				break;
			}
			// Точечные правки живых нод — без пересборки блока.
			if (Array.isArray(msg.edits)) {
				pushTool(`edits ×${msg.edits.length}`);
				if (msg.summary) pushAgentText(msg.summary);
				parent.postMessage(
					{
						pluginMessage: {
							type: "apply_edits",
							edits: msg.edits,
						},
					},
					"*",
				);
				break;
			}
			if (!msg.spec) {
				completeRun(false);
				break;
			}
			S.lastSpec = msg.spec;
			S.variantLabels = msg.variants?.length ? msg.variants : null;
			pushTool(
				msg.replace
					? `replace ${msg.replace}`
					: msg.review
						? "rebuild"
						: "build",
			);
			if (msg.summary) pushAgentText(msg.summary);
			parent.postMessage(
				{
					pluginMessage: {
						type: msg.review ? "rebuild" : "build",
						spec: msg.spec,
						targetId: msg.replace,
					},
				},
				"*",
			);
			break;
		case "critique": {
			// Замечания критика уходят в ревью-раунд; без замечаний прогон завершается.
			const problems = msg.problems || [];
			if (msg.failed)
				pushStep("Проверка критиком не удалась", { status: "info" });
			if (!problems.length) {
				if (S.pendingSummary) pushAgentText(S.pendingSummary);
				completeRun(true);
				break;
			}
			pushStep(`Критик: замечаний — ${problems.length}`, {
				status: "info",
				warnings: problems.map((p) =>
					p.fix ? `${p.problem} → ${p.fix}` : p.problem,
				),
			});
			sendGenerate({
				review: true,
				critique: problems,
				previousSpec: priorSpec(),
				warnings: S.runWarnings,
				issues: S.runIssues,
				images: reviewImages(),
			});
			break;
		}
		case "error": {
			closeThought();
			const fallbackId = S.settings.fallbackModel
				? activeModelId(
						S.settings.fallbackModel,
						S.merged,
						S.settings.prefs,
					)
				: "";
			if (
				msg.provider_unavailable &&
				fallbackId &&
				S.merged.some((m) => m.id === S.settings.fallbackModel) &&
				completedPayload &&
				!S.fallbackUsed &&
				fallbackId !== completedPayload.model
			) {
				const model = S.settings.fallbackModel;
				const runModel = fallbackId;
				S.runModel = runModel;
				S.fallbackUsed = true;
				const fallbackPayload: Record<string, unknown> = {
					...completedPayload,
					model: runModel,
				};
				delete fallbackPayload.effort;
				delete fallbackPayload.fast;
				pushStep(
					`Модель недоступна — продолжаю на ${S.merged.find((m) => m.id === model)?.label || model}`,
					{ status: "info" },
				);
				updateInterrupted({ model: runModel });
				setBusy(true);
				sendPayload(fallbackPayload);
				break;
			}
			pushStep("Ошибка", {
				error: msg.message || "Ошибка моста",
				// Сырой ответ модели — подсказка, почему спека не прошла.
				warnings: msg.raw ? [msg.raw.slice(0, 1500)] : undefined,
			});
			setBusy(false);
			showInterruptedPrompt();
			break;
		}
	}
}

// Запрос каталога моделей провайдера у сервера (все модели доступны, а
// отключать их можно в настройках).
function requestModels(provider: string, force: boolean): void {
	if (ws && ws.readyState === WebSocket.OPEN) {
		S.catalog[provider] = { ...S.catalog[provider], loading: true };
		ws.send(JSON.stringify({ type: "list_models", provider, force }));
	} else {
		S.catalog[provider] = { error: "Нет соединения с мостом" };
		onCatalogUpdate();
	}
}

// Очистка чата: мост забывает память Devin-сессии.
window.addEventListener("vivi-clear", () => {
	if (ws && ws.readyState === WebSocket.OPEN && !S.busy)
		ws.send(JSON.stringify({ type: "reset_context" }));
});

function connect(): void {
	window.clearTimeout(reconnectTimer);
	reconnectTimer = undefined;
	setStatus("Подключение к мосту…");
	const url = new URL(WS_URL);
	url.searchParams.set("client", CLIENT_ID);
	if (S.settings.bridgeToken)
		url.searchParams.set("token", S.settings.bridgeToken);
	ws = new WebSocket(url.toString());
	ws.onmessage = (event) => {
		try {
			handleServerMessage(JSON.parse(String(event.data)));
		} catch {
			/* битое сообщение — игнорируем */
		}
	};
	ws.onclose = (event) => {
		ws = null;
		setMcpConnected(false);
		const wasBusy = S.busy;
		if (wasBusy) {
			if (!S.disconnectedAt) {
				S.disconnectedAt = Date.now();
				pushStep("Связь с мостом потеряна — переподключаюсь…", {
					status: "info",
				});
				window.clearTimeout(reconnectDeadlineTimer);
				reconnectDeadlineTimer = window.setTimeout(() => {
					if (
						S.busy &&
						(!ws || ws.readyState !== WebSocket.OPEN) &&
						Date.now() - S.disconnectedAt >= 60_000
					) {
						pushStep("Прогон прерван: нет связи с мостом", {
							status: "error",
						});
						S.inflight = null;
						S.inflightUnsent = false;
						setBusy(false);
						showInterruptedPrompt();
					}
				}, 60_000);
			}
		} else setBusy(false);
		// Ручное сжатие оборвалось вместе с мостом — снимаем крутилку.
		if (compactChatId) {
			compactChatId = undefined;
			setCompacting(false);
			pushStep("Сжатие прервано: нет связи с мостом", {
				status: "error",
			});
		}
		lockModelSelect();
		sendBtn.disabled = true;
		if (event.code === 4401) {
			setStatus(
				"Мост отклонил подключение: неверный токен (Настройки → Токен моста)",
				true,
			);
		} else if (event.code === 1009) {
			setStatus("Сообщение слишком большое для моста (вложения?)", true);
		} else if (!wasBusy) {
			setStatus(
				"Мост недоступен. Запустите: cd server && npm start",
				true,
			);
		}
		if (immediateReconnect) {
			immediateReconnect = false;
			window.clearTimeout(reconnectTimer);
			reconnectTimer = window.setTimeout(connect, 0);
		} else {
			window.clearTimeout(reconnectTimer);
			reconnectTimer = window.setTimeout(
				connect,
				event.code === 4401 ? 10_000 : 2500,
			);
		}
	};
	ws.onerror = () => ws?.close();
}

// Есть ли что отправлять: текст или вложения.
function hasInput(): boolean {
	return !!promptEl.value.trim() || attachments.length > 0;
}

// Кнопка отправки: в простое — «Отправить»; пока агент работает — «Дополнить»
// (сообщение уйдёт в текущий прогон) и только если есть что отправлять.
function syncSendBtn(): void {
	sendBtn.hidden = S.busy && !hasInput();
	sendBtn.title = S.busy ? "Дополнить задачу — агент увидит сообщение в следующем раунде" : "Отправить";
	sendBtn.classList.toggle("queueing", S.busy);
}

function sendPrompt(): void {
	const typed = promptEl.value.trim();
	if (!typed && !attachments.length) return;
	// Агент занят — сообщение вливается в текущий прогон (как дополнение к задаче).
	if (S.busy) {
		injectUpdate(typed);
		return;
	}
	if (!ws || ws.readyState !== WebSocket.OPEN) {
		setStatus("Нет соединения с мостом", true);
		return;
	}
	const atts = attachments.slice();
	clearAttachments();
	promptEl.value = "";
	launchRun(typed, atts);
}

// Сообщение во время работы агента: попадает в ленту и во все следующие
// раунды прогона (userUpdates); если прогон уже заканчивается — completeRun
// запустит ещё один раунд. Картинки уходят как референсы прогона, документы — нет.
function injectUpdate(typed: string): void {
	if (S.runChatId && S.runChatId !== activeChatId()) {
		setStatus("Агент работает в другой беседе — дождитесь конца или переключитесь", true);
		return;
	}
	if (!typed) {
		setStatus("Допишите текст сообщения — вложения без текста во время работы не передаются", true);
		return;
	}
	const images = attachments.filter((a) => a.kind === "image");
	const skipped = attachments.length - images.length;
	addUserMessage(typed, undefined, undefined, images.map((a) => (a.kind === "image" ? a.thumb : "")), []);
	S.runUpdates.push(typed.slice(0, 2000));
	if (images.length)
		S.runImages.push(...images.map((a) => ({ data: a.data, mimeType: a.mimeType })));
	if (skipped) setStatus("Документы во время работы не передаются — отправьте их после завершения", true);
	clearAttachments();
	promptEl.value = "";
	syncSendBtn();
}

// Сам запуск прогона. sel — выделение, снятое при постановке в очередь.
function launchRun(
	typed: string,
	attachments: Attachment[],
	sel?: { spec: unknown; names: string[]; hidden: boolean },
	interrupted?: InterruptedRun,
): void {
	// В ленте — только то, что юзер набрал (пустое так пустое); модели
	// при голых вложениях добавляем подсказку в контекст запроса.
	const text =
		interrupted?.prompt ||
		typed ||
		(attachments.some((a) => a.kind === "image")
			? "Сделай дизайн по приложенному изображению"
			: "Изучи приложенный документ и сделай по нему дизайн");
	if (sel) {
		S.selectionSpec = sel.spec as typeof S.selectionSpec;
		S.selectionNames = sel.names;
		S.selectionHidden = sel.hidden;
	}
	const selTag =
		!S.selectionHidden && S.selectionNames.length
			? `⬚ ${S.selectionNames.join(", ")}`
			: undefined;
	// Контрольная точка для отката к этому сообщению: runId монотонный, а
	// контекст агента (спека и промпт) запоминаем до прогона.
	S.runId = Math.max(Date.now(), S.runId + 1);
	// Прогон привязываем к текущей беседе: юзер может переключиться,
	// а сообщения и контекст всё равно пойдут сюда.
	S.runChatId = activeChatId();
	S.ctxByRun.set(S.runId, { spec: S.lastSpec, prompt: S.lastPrompt });
	if (S.ctxByRun.size > 30) {
		const oldest = [...S.ctxByRun.keys()].sort((a, b) => a - b)[0];
		S.ctxByRun.delete(oldest);
	}
	const images = attachments.filter((a) => a.kind === "image");
	const files = attachments.filter((a) => a.kind === "file");
	S.runImages = images.map((a) => ({ data: a.data, mimeType: a.mimeType }));
	S.runRefMode = refModeOf(images.length, text);
	S.runPalette = mixColors(
		images.map((a) => (a.kind === "image" && a.colors ? a.colors : [])),
	);
	S.runFiles = files.map((a) => ({
		name: a.kind === "file" ? a.name : "",
		data: a.data,
		mimeType: a.mimeType,
	}));
	// Новые документы — выжимку надо пересобрать: старая про другие файлы.
	if (files.length) S.docNotes = "";
	if (!interrupted)
		addUserMessage(
			typed,
			selTag,
			S.runId,
			images.map((a) => (a.kind === "image" ? a.thumb : "")),
			files.map((a) => (a.kind === "file" ? a.name : "")),
		);
	// Запоминаем вложения этого сообщения: при откате к нему они вернутся в поле.
	if (attachments.length) {
		S.attachByRun.set(S.runId, attachments.slice());
		while (S.attachByRun.size > 30) {
			const oldest = [...S.attachByRun.keys()].sort((a, b) => a - b)[0];
			S.attachByRun.delete(oldest);
		}
		parent.postMessage(
			{
				pluginMessage: {
					type: "save_attachments",
					data: serializeAttachments(S.attachByRun),
				},
			},
			"*",
		);
	}
	S.lastPrompt = text;
	S.reviewCount = 0;
	S.inspectCount = 0;
	S.photoCount = 0;
	S.briefAsked = false;
	S.schemaCount = 0;
	S.runUpdates = [];
	S.updatesDelivered = 0;
	S.selectionImageSent = false;
	S.styleCardShown = false;
	clearStyleCard();
	S.checklist = [];
	S.checked = [];
	S.checkRetries = 0;
	showChecklist([]);
	S.nextActions = [];
	clearQuick();
	dismissVariants();
	S.agentSpoke = false;
	parent.postMessage(
		{
			pluginMessage: { type: "run_start", runId: S.runId, prompt: text },
		},
		"*",
	);
	S.remaining = interrupted?.remaining || "";
	S.runWarnings = [];
	S.runIssues = [];
	S.runUsage = { rounds: 0, input: 0, output: 0, cached: 0, cost: 0 };
	S.runStarted = Date.now();
	// Незаконченный план беседы продолжаем («дальше»), готовый — нет.
	const prev = chatPlan();
	const unfinished =
		prev.plan.length > 0 && prev.done.length < prev.plan.length;
	S.plan = interrupted?.plan?.slice() || (unfinished ? prev.plan : []);
	S.planDone =
		interrupted?.planDone?.slice() || (unfinished ? prev.done : []);
	S.planInRun = false;
	S.warnRepeat = 0;
	S.warnKey = "";
	S.remainingKey = "";
	S.remainingRepeat = 0;
	S.finalChecked = false;
	S.reviewExtra = null;
	S.runModel =
		interrupted?.model && interrupted.model !== activeModel()
			? interrupted.model
			: "";
	S.fallbackUsed = false;
	S.critiqued = false;
	S.pendingSummary = "";
	saveInterrupted({
		runId: S.runId,
		prompt: text,
		rootId: interrupted?.rootId,
		remaining: S.remaining || undefined,
		plan: S.plan.slice(),
		planDone: S.planDone.slice(),
		model: S.runModel || activeModel(),
		ts: Date.now(),
	});
	setBusy(true);
	showInterruptedPrompt();
	if (interrupted) {
		pushStep("Продолжаю прерванный прогон", { status: "info" });
		if (interrupted.rootId) {
			S.pendingInterruptedContinue = {
				...interrupted,
				prompt: text,
			};
			parent.postMessage(
				{
					pluginMessage: {
						type: "serialize",
						id: interrupted.rootId,
					},
				},
				"*",
			);
			return;
		}
	}
	sendGenerate({ prompt: text });
}

function continueInterruptedRun(run: InterruptedRun): void {
	S.lastPrompt = run.prompt;
	S.remaining = run.remaining || "";
	S.plan = run.plan?.slice() || [];
	S.planDone = run.planDone?.slice() || [];
	launchRun(run.prompt, [], undefined, run);
}

sendBtn.onclick = sendPrompt;
promptEl.addEventListener("input", syncSendBtn);
initMcpMode({
	post: (message) => parent.postMessage({ pluginMessage: message }, "*"),
	save: saveSettingsNow,
});
promptEl.addEventListener("keydown", (e) => {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		sendPrompt();
	}
});

cancelBtn.onclick = () => {
	if (ws && ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify({ type: "cancel" }));
	}
	clearInterrupted();
	S.inflight = null;
	S.inflightUnsent = false;
	S.runModel = "";
	S.fallbackUsed = false;
	closeThought();
	pushStep("Остановлено", { status: "stopped" });
	setBusy(false);
};

// Смена модели и очистка чата живут в models.ts и chat.ts.

// Исключить выделение из контекста до смены выделения в Figma.
selClear.onclick = () => {
	S.selectionHidden = true;
	selChip.hidden = true;
};

// Ответы от code.ts (main thread плагина).
window.onmessage = (event) => {
	const msg = event.data?.pluginMessage;
	if (!msg) return;
	// Ответ main-кода на вызов MCP — обратно в мост.
	if (msg.type === "mcp_result") {
		if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
		return;
	}
	if (msg.type === "serialized") {
		const pending = S.pendingInterruptedContinue;
		if (!pending) return;
		S.pendingInterruptedContinue = null;
		S.lastTiles = [];
		S.lastSpec = msg.spec || null;
		S.lastImage = typeof msg.image === "string" ? msg.image : "";
		if (msg.spec) {
			sendGenerate({
				review: true,
				continueWork: true,
				remaining: S.remaining || INTERRUPTED_REMAINING,
				previousSpec: msg.spec,
				images: reviewImages(),
			});
		} else sendGenerate({ prompt: pending.prompt });
		return;
	}
	// Результаты сборки/экспорта, пришедшие после «Стоп», не должны
	// продолжать агентный цикл (ревью, inspect).
	if (
		(msg.type === "built" ||
			msg.type === "build_error" ||
			msg.type === "exported") &&
		!S.busy
	) {
		if (msg.type === "built" && msg.spec) S.lastSpec = msg.spec;
		return;
	}
	if (msg.type === "built") {
		// Контекст = фактическое дерево после сборки/правок, а не
		// спека-запрос: так агент помнит реальное состояние макета.
		if (msg.spec) S.lastSpec = msg.spec;
		updateInterrupted({
			rootId: typeof msg.rootId === "string" ? msg.rootId : undefined,
			remaining: S.remaining || undefined,
			plan: S.plan.slice(),
			planDone: S.planDone.slice(),
		});
		S.undoRuns = Array.isArray(msg.runs) ? (msg.runs as number[]) : [];
		onVersionsReply(msg);
		// Итоги операций (экспорт, разметка…) — информационные плашки.
		for (const info of ((msg as { infos?: string[] }).infos || []).slice(0, 5))
			pushStep(info, { status: "info" });
		S.lastImage = typeof msg.image === "string" ? msg.image : "";
		// Актуальны только предупреждения последней сборки: исправленные раньше не показываем
		S.runWarnings = ((msg.warnings || []) as string[]).slice();
		S.runIssues = Array.isArray(msg.issues) ? msg.issues : [];
		S.finalChecked = false;
		S.lastTiles = [];
		// Агентный цикл: отправляем построенное дерево модели на ревью.
		const reviewOrFinish = (): void => {
			if (
				S.reviewCount < MAX_REVIEWS &&
				ws &&
				ws.readyState === WebSocket.OPEN &&
				msg.spec
			) {
				S.reviewCount++;
				pushTool("review");
				// Общий путь запроса: в ревью уходят история чата, outline,
				// выделение и дизайн-система, как в обычном раунде.
				sendGenerate({
					review: true,
					previousSpec: msg.spec,
					warnings: msg.warnings || [],
					issues: Array.isArray(msg.issues) ? msg.issues : undefined,
					// Скриншот результата: модель видит визуальные проблемы,
					// а не только дерево нод.
					images: reviewImages(),
				});
				return;
			}
			completeRun(false);
		};
		// Варианты направления: ревью не нужно — ждём выбор пользователя.
		if (S.variantLabels && S.busy) {
			const labels = S.variantLabels;
			S.variantLabels = null;
			completeRun(true);
			showVariants(labels, (label) => {
				if (S.busy) return;
				launchRun(
					`Выбрано направление «${label}»: собери полную страницу по исходному запросу в этом стиле (эскизы — в рамке «Directions»), затем удали рамку с эскизами.`,
					[],
				);
			});
			return;
		}
		if (msg.full)
			void tilesOf(msg.full).then((tiles) => {
				if (!S.busy) return;
				S.lastTiles = tiles;
				reviewOrFinish();
			});
		else reviewOrFinish();
	} else if (msg.type === "attachments_restore") {
		// Вложения прошлых запусков: чтобы откат к старым сообщениям их возвращал.
		const data = (msg.data || {}) as Record<string, unknown[]>;
		for (const [runId, list] of Object.entries(data)) {
			if (Array.isArray(list))
				S.attachByRun.set(Number(runId), list as never);
		}
	} else if (msg.type === "settings_restore") {
		// Настройки из хранилища: правила, свои модели и названия.
		S.settings = normalizeSettings(msg.data);
		applyMcpMode(S.settings.mcpMode);
		refreshModels();
		refreshSettingsView();
	} else if (msg.type === "design_system") {
		const ds = msg.ds as {
			colors?: unknown[];
			text?: unknown[];
			variables?: unknown[];
		};
		const empty =
			!ds ||
			(!ds.colors?.length && !ds.text?.length && !ds.variables?.length);
		S.designSystem = empty ? null : ds;
		S.components = Array.isArray(msg.components) ? msg.components : [];
		if (Array.isArray(msg.fonts))
			S.fonts = (msg.fonts as unknown[]).filter(
				(f): f is string => typeof f === "string",
			);
	} else if (msg.type === "runs") {
		// Дизайн оставили как есть: плагин забыл копии откатываемых прогонов.
		S.undoRuns = Array.isArray(msg.runs) ? (msg.runs as number[]) : [];
		onVersionsReply(msg);
		onRollbackReply();
	} else if (msg.type === "undone" && msg.rollback) {
		// Откат к сообщению с возвратом дизайна.
		S.undoRuns = Array.isArray(msg.runs) ? (msg.runs as number[]) : [];
		onVersionsReply(msg);
		onRollbackReply();
	} else if (msg.type === "versions") {
		// Список версий после восстановления прогонов при запуске плагина.
		S.undoRuns = Array.isArray(msg.runs) ? (msg.runs as number[]) : [];
		onVersionsReply(msg);
	} else if (msg.type === "build_error") {
		// Сборка упала: возвращаем ошибку модели (она видит упавшую спеку
		// как previousSpec) — в пределах того же лимита, что и ревью.
		if (
			S.reviewCount < MAX_REVIEWS &&
			ws &&
			ws.readyState === WebSocket.OPEN
		) {
			S.reviewCount++;
			pushStep("Ошибка построения, пробую исправить", {
				error: msg.message,
			});
			sendGenerate({ buildError: String(msg.message || "") });
			return;
		}
		setBusy(false);
		pushStep("Ошибка построения", { error: msg.message });
		showInterruptedPrompt();
	} else if (msg.type === "exported") {
		// code.ts отдал PNG-скриншоты + сериализованные деревья —
		// повторяем запрос с картинками и структурой.
		const images = (msg.images || []) as {
			id: string;
			name: string;
			data: string;
			spec: unknown;
		}[];
		sendGenerate({
			// Если inspect был запрошен в раунде ревью — раунд остаётся ревью.
			// images здесь — рендеры нод, а не скриншот результата (lastImage).
			...(S.reviewExtra
				? { ...S.reviewExtra, previousSpec: priorSpec() }
				: {}),
			images,
			missing: msg.missing,
			inspected: images.map((i) => ({
				id: i.id,
				name: i.name,
				spec: i.spec,
			})),
		});
	} else if (msg.type === "search_results") {
		// code.ts нашёл ноды по имени — отдаём список модели следующим запросом.
		sendGenerate({
			// Поиск в раунде ревью тоже остаётся ревью-запросом.
			...(S.reviewExtra
				? { ...S.reviewExtra, previousSpec: priorSpec() }
				: {}),
			searchQuery: msg.query,
			searchResults: msg.results || [],
			searchTruncated: msg.truncated === true,
			searchOffset: msg.offset,
			searchTotal: msg.total,
			searchScope: msg.scope,
			searchScopeId: msg.scopeId,
			searchScopeError: msg.scopeError,
			searchText: msg.text === true,
			searchType: msg.nodeType,
		});
	} else if (msg.type === "selection_image") {
		S.selectionImage = typeof msg.image === "string" ? msg.image : "";
	} else if (msg.type === "annotate_data") {
		onAnnotateData(msg as never);
	} else if (msg.type === "selection") {
		// code.ts прислал сериализованное выделение с канваса.
		S.selectionSpec = msg.spec || null;
		S.selectionImage = "";
		S.selectionHidden = false;
		if (Array.isArray(msg.outline)) S.pageOutline = msg.outline;
		selChip.hidden = !S.selectionSpec;
		setAnnotateVisible(!!S.selectionSpec);
		setStyleButtons(Array.isArray(S.selectionSpec) && S.selectionSpec.length >= 2);
		auditBtn.hidden = !S.selectionSpec;
		S.selectionNames =
			S.selectionSpec && Array.isArray(msg.names) ? msg.names : [];
		if (S.selectionSpec) {
			const names = S.selectionNames.join(", ");
			selLabel.textContent = names
				? `выделено: ${names}`
				: `выделено: ${msg.count || 0} слоёв`;
			S.styleSwap = false;
			refreshStyleLabel();
		}
	} else if (msg.type === "chat_restore") {
		restoreChat(msg.data || {});
		// Поздняя история применяет сохранённую модель к уже загруженным
		// спискам, а ранние сообщения/ручной выбор уходят в хранилище.
		refreshModels();
		persistChat();
	}
};

initAttachments({
	prompt: promptEl,
	composer: document.getElementById("composer") as HTMLElement,
	chips: document.getElementById("attachments") as HTMLElement,
	button: document.getElementById("attach") as HTMLButtonElement,
	input: document.getElementById("file") as HTMLInputElement,
	changed: () => syncSendBtn(),
});
// Уровень размышления и Fast выбираются в карточке модели: сохраняем выбор
// и обновляем метки в списке и на кнопке модели.
setModelChangeHandler(refreshItemTags);
setReloadHandler(() => {
	for (const p of S.providers) requestModels(p.id, true);
	refreshModels();
});
setPrefsChangeHandler(() => {
	saveSettingsNow();
	refreshItemTags();
});
initSettings(
	document.getElementById("settings") as HTMLElement,
	document.getElementById("settings-btn") as HTMLButtonElement,
	(m) => parent.postMessage({ pluginMessage: m }, "*"),
	requestModels,
);
setBridgeTokenChangeHandler(() => {
	if (ws && ws.readyState !== WebSocket.CLOSED) {
		immediateReconnect = true;
		ws.close();
	} else connect();
});
setInterruptedHandlers(continueInterruptedRun);
initRollback(promptEl, (m) => parent.postMessage({ pluginMessage: m }, "*"));
initPlan();
const auditBtn = document.getElementById("audit-btn") as HTMLButtonElement;
// Аудит выделения: замечания аннотациями Figma, макет не меняем.
auditBtn.onclick = () => {
	if (S.busy) return;
	launchRun(
		"Проведи аудит выделенного: ничего не меняй в макете. Найди проблемы (контраст, отступы и сетка, иерархия, единообразие, контент) и поставь на проблемные слои аннотации через операцию annotate; в итоге списком перечисли замечания, id слоёв пиши в обратных кавычках.",
		[],
	);
};
const styleBtn = document.getElementById("style-btn") as HTMLButtonElement;
const swapBtn = document.getElementById("swap-btn") as HTMLButtonElement;
function setStyleButtons(visible: boolean): void {
	styleBtn.hidden = swapBtn.hidden = !visible;
}
// Подпись кнопки: кто источник стиля и кто цель.
function refreshStyleLabel(): void {
	const sel = orderedSelection() as { name?: string }[] | null;
	styleBtn.title = sel
		? `Применить стиль «${sel[0].name}» → ${sel.length > 2 ? `${sel.length - 1} нод` : `«${sel[1].name}»`} (⇄ меняет источник)`
		: "Применить стиль первой выделенной ноды к остальным";
}
styleBtn.onclick = applyStyleDirect;
swapBtn.onclick = () => {
	S.styleSwap = !S.styleSwap;
	refreshStyleLabel();
};
initAnnotate(
	document.getElementById("annotate-btn") as HTMLButtonElement,
	promptEl,
);
// Клик по индикатору контекста — ручное сжатие истории текущей беседы.
let compactChatId: string | undefined;
initContextRing(() => {
	if (!ws || ws.readyState !== WebSocket.OPEN || S.busy) return;
	compactChatId = activeChatId();
	setCompacting(true);
	ws.send(
		JSON.stringify({
			type: "compact",
			model: activeModel(),
			...chatContext(),
		}),
	);
});
initVersions(
	document.getElementById("versions-btn") as HTMLButtonElement,
	document.getElementById("versions") as HTMLElement,
	(m) => parent.postMessage({ pluginMessage: m }, "*"),
	// Открыли версии — панель чатов закрываем (и наоборот в initChats).
	() => closeChats(),
);
initChats(
	document.getElementById("chats-btn") as HTMLButtonElement,
	document.getElementById("chats") as HTMLElement,
	() => closeVersions(),
);
connect();
