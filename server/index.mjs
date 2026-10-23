// Сервер-мост между плагином Figma и ACP-провайдерами моделей.
// Figma plugin UI (iframe) не может запускать процессы, поэтому общается
// с этим сервером по WebSocket, а сервер гоняет JSON-RPC по stdio:
//   - модели без префикса  -> Claude-мост (bridges/claude/index.mjs, claude-agent-sdk)
//   - модели "devin:*"     -> devin.exe acp (настоящий ACP, сессия живёт на соединение)
//   - модели "acp:*"       -> свои ACP-агенты из agents.json (одноразовый процесс)
import { parseClaudeInfo } from "./claude-info.mjs";
import { mkdtempSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { tmpdir } from "node:os";
import { NdJsonClient } from "./acp-client.mjs";
import { cleanConfigArgs, devinConfig, devinModelsFromCli } from "./devin.mjs";
import {
	SUMMARY_SYSTEM,
	KEEP_RECENT_MESSAGES,
	MIN_SUMMARY_CHARS,
	clampSummary,
	estimateTokens,
	lineOf,
	needsCompaction,
	olderCount,
	promptEstimate,
	summaryInput,
	windowOf,
} from "./context.mjs";
import {
	CRITIC_SYSTEM,
	FULL_SYSTEM_EVERY,
	SYSTEM_REMINDER,
	systemPromptWith,
} from "./prompt.mjs";
import {
	critiqueUserText,
	parseCritique,
	sanitizeCritique,
} from "./critique.mjs";
import { acpGenerate, acpListModels } from "./acp-agent.mjs";
import { agentConfig, loadAgents, parseAcpModel } from "./agents.mjs";
import { extractJson, remainingOf } from "./parse.mjs";
import { routeReply } from "./route.mjs";
import { briefText, sanitizeQuestions } from "./brief.mjs";
import { cleanNext } from "./next.mjs";
import { checklistText, cleanChecked, cleanChecklist } from "./checklist.mjs";
import { expandBlocks } from "./blocks.mjs";
import { expandPatternFills } from "./patterns.mjs";
import { prefetchOsm } from "./osm.mjs";
import { schemaText } from "./schemas.mjs";
import { updatesText } from "./updates.mjs";
import { createRelay } from "./mcp-relay.mjs";
import { variantsWrapper } from "./variants.mjs";
import {
	moodText,
	styleSourceText,
	teachText,
	variantsAllowedText,
} from "./request-extras.mjs";
import { designSeed, needsFullSystem, stableBlock } from "./prompt-builder.mjs";
import { usageOf } from "./usage.mjs";
import { processDesign } from "./icons.mjs";
import { resolveImages, searchPhotos } from "./images.mjs";
import { extractFiles } from "./files.mjs";
import {
	checkToken,
	MAX_AGENT_TEXT,
	MAX_PAYLOAD,
	sanitizeImages,
	sanitizeUserFiles,
} from "./limits.mjs";
import { isTransientError, isTransientReply, RETRY_DELAYS } from "./retry.mjs";

// Подхватываем server/.env (KEY=VALUE) — туда можно положить ANTHROPIC_BASE_URL,
// ANTHROPIC_AUTH_TOKEN, WINDSURF_API_KEY и т.п. Уже заданные env не трогаем.
const serverDir = dirname(fileURLToPath(import.meta.url));
try {
	for (const line of readFileSync(join(serverDir, ".env"), "utf-8").split(
		/\r?\n/,
	)) {
		const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
		if (match && !(match[1] in process.env)) {
			process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
		}
	}
} catch {
	/* .env необязателен */
}

const PORT = Number(process.env.PORT || 8787);
const CLAUDE_BRIDGE =
	process.env.CLAUDE_ACP_BRIDGE ||
	join(serverDir, "bridges", "claude", "index.mjs");
// Подключённые ACP-агенты (server/agents.json): команды задаются только тут.
const AGENTS_FILE = process.env.AGENTS_FILE || join(serverDir, "agents.json");
const { agents: AGENTS, errors: AGENT_ERRORS } = loadAgents(AGENTS_FILE);
for (const e of AGENT_ERRORS) console.warn("agents:", e);
// Провайдеры, которые видит интерфейс настроек (для добавления своих моделей).
const PROVIDERS = [
	{ id: "claude", label: "Claude" },
	{ id: "devin", label: "Devin" },
	...[...AGENTS.values()].map((a) => ({
		id: `acp:${a.name}`,
		label: a.label,
	})),
];
const WORKDIR = process.env.FIGMA_AGENT_WORKDIR || process.cwd();
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || "";

// Доступные модели — уходят клиенту в сообщении "ready".
// Формат env MODELS: "id=Лейбл,id=Лейбл". Префикс "devin:" выбирает Devin-провайдер.
const MODELS = (
	process.env.MODELS ||
	[
		"sonnet=Sonnet",
		"opus=Opus",
		"haiku=Haiku",
		"devin:swe-2-high=SWE-2 High",
	].join(",")
)
	.split(",")
	.map((entry) => {
		const [id, label] = entry.split("=", 2);
		return { id: id.trim(), label: (label || id).trim() };
	})
	.filter((m) => m.id);

// Списки доступных моделей по провайдерам: кэш на 10 минут, чтобы не
// запускать агентов при каждом открытии настроек.
const MODEL_LIST_TTL_MS = 10 * 60 * 1000;
const modelListCache = new Map();
// Последний раунд модели: реальные токены ввода и размер текста — от них
// считаем следующий запрос (см. promptEstimate в context.mjs).
const lastRound = new Map();

// Транскрипт чата одним блоком: выжимка (если есть) + последние реплики.
function historyText(summary, entries) {
	const lines = [];
	// Без жёсткого лимита: размер держит выжимка (см. context.mjs).
	for (const h of entries) lines.push(lineOf(h));
	if (!summary && !lines.length) return "";
	const head = summary
		? `Summary of the earlier conversation (compressed by the assistant):\n${summary}\n\nLatest messages:\n`
		: "";
	return (
		"\n\nConversation history in this chat (you have NO memory between requests — this transcript is your only context for follow-ups):\n" +
		head +
		lines.join("\n")
	);
}

// Контекст Devin-модели из каталога (окно из max_context_tokens).
function devinContextOf(id) {
	const models = modelListCache.get("devin")?.models || [];
	return models.find((m) => m.id === id)?.context;
}

async function listProviderModels(provider, force, claudeClient) {
	const cached = modelListCache.get(provider);
	if (!force && cached && Date.now() - cached.at < MODEL_LIST_TTL_MS)
		return cached;
	let models;
	// Пояснение для пользователя, если список получен запасным путём.
	let note = "";
	// Семейства: варианты одной модели (уровни размышления, Fast) — одним пунктом.
	let families = [];
	if (provider === "claude") {
		const result = await claudeClient.request("models/list", {});
		models = (result?.models || []).map((m) => ({
			id: m.value,
			label: m.displayName,
			description: m.description || "",
			fast: m.supportsFastMode === true,
			levels: m.supportedEffortLevels,
			// Окно контекста у всех моделей Claude — 1M
			context: 1_000_000,
			...parseClaudeInfo(m.description, m.displayName),
		}));
	} else if (provider === "devin") {
		// Основной источник — команда CLI (полный список аккаунта); если она
		// не сработала — то, что отдаёт ACP-сессия.
		try {
			({ models, families } = await devinModelsFromCli());
		} catch (cliError) {
			console.warn("devin models list:", cliError.message);
			const config = devinConfig();
			if (!config) throw cliError;
			models = await acpListModels(config);
			note = `Показан неполный список из сессии Devin: ${cliError.message}`;
		}
	} else if (provider.startsWith("acp:")) {
		const agent = AGENTS.get(provider.slice(4).toLowerCase());
		if (!agent)
			throw new Error(`ACP-агент «${provider.slice(4)}» не подключён`);
		models = await acpListModels(agentConfig(agent));
	} else {
		throw new Error(`неизвестный провайдер «${provider}»`);
	}
	const result = { at: Date.now(), models, families, note };
	modelListCache.set(provider, result);
	return result;
}

function send(ws, message) {
	if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

const httpServer = createServer();
// Слушаем только loopback и пускаем лишь клиентов без web-origin: iframe
// плагина Figma шлёт Origin "null" (или не шлёт его вовсе), а страницы из
// браузера — "http(s)://…". Иначе любой сайт мог бы гонять агента за наш токен.
const wss = new WebSocketServer({
	server: httpServer,
	maxPayload: MAX_PAYLOAD,
	verifyClient: ({ origin }) => !origin || !/^https?:/i.test(origin),
});

const connections = new Map();

// Версия протокола «плагин ↔ мост»: поднимать при несовместимых изменениях.
const PROTOCOL = 1;
const pluginDir = join(serverDir, "..", "plugin");
// Отпечаток исходников плагина (если папка плагина лежит рядом) — UI сравнит
// со своим и покажет «плагин устарел». Нет папки — проверку молча пропускаем.
let sourceHash = null;
try {
	({ sourceHash } = await import(
		pathToFileURL(join(pluginDir, "build-id.mjs")).href
	));
} catch {
	/* сервер запущен без папки плагина */
}
function serverInfo() {
	let build;
	try {
		build = sourceHash ? sourceHash(pluginDir) : undefined;
	} catch {
		/* нечитаемые исходники — не мешаем подключению */
	}
	return { protocol: PROTOCOL, build };
}

// Запросы MCP-сервера (server/mcp.mjs) в плагин: только чтение дизайна.
const mcpRelay = createRelay();

function serveMcpClient(socket) {
	socket.on("message", (raw) => {
		let msg;
		try {
			msg = JSON.parse(raw.toString());
		} catch {
			return;
		}
		if (msg?.type !== "mcp_call" || typeof msg.reqId !== "string") return;
		const reply = (body) => {
			if (socket.readyState === socket.OPEN)
				socket.send(JSON.stringify({ type: "mcp_result", reqId: msg.reqId, ...body }));
		};
		mcpRelay
			.call(msg.tool, msg.args)
			.then((res) => reply({ ok: true, data: res.data, images: res.images }))
			.catch((err) => reply({ ok: false, error: String(err?.message || err) }));
	});
}

wss.on("connection", (socket, request) => {
	if (!checkToken(request.url, BRIDGE_TOKEN)) {
		socket.close(4401, "bad token");
		return;
	}
	if (new URL(request.url || "/", "ws://localhost").searchParams.get("role") === "mcp") {
		serveMcpClient(socket);
		return;
	}
	const clientId =
		new URL(request.url || "/", "ws://localhost").searchParams.get(
			"client",
		) || "";
	const existing = clientId ? connections.get(clientId) : null;
	if (existing && !existing.disposed) {
		clearTimeout(existing.graceTimer);
		const previous = existing.socket;
		existing.bind(socket);
		existing.readySent = true;
		if (socket.readyState === socket.OPEN)
			socket.send(
				JSON.stringify({
					type: "ready",
					...serverInfo(),
					models: MODELS,
					providers: PROVIDERS,
					resumed: true,
					busy: existing.isBusy(),
				}),
			);
		existing.flush();
		if (
			previous &&
			previous !== socket &&
			previous.readyState === previous.OPEN
		)
			previous.close(4000, "replaced");
		return;
	}
	let ws = socket;
	const conn = {
		clientId,
		socket: null,
		outbox: [],
		graceTimer: null,
		bind: null,
		flush: null,
		isBusy: null,
		readySent: false,
		disposed: false,
	};
	if (clientId) connections.set(clientId, conn);
	function out(message) {
		if (ws.readyState === ws.OPEN) {
			ws.send(JSON.stringify(message));
			return;
		}
		if (message.type === "chunk" || message.type === "thought") return;
		conn.outbox.push(message);
		if (conn.outbox.length > 200) conn.outbox.shift();
	}
	function send(_socket, message) {
		out(message);
	}
	// Claude-мост держим постоянным на время соединения: сессии привязаны к модели.
	const claude = new NdJsonClient(process.execPath, [CLAUDE_BRIDGE]);
	let sessionId = null;
	let sessionModel = null;
	let sessionEffort;
	let sessionFast = false;
	let busy = false;
	let cancelled = false;
	let agentText = "";
	let oversized = false;
	let activeDevin = null;
	// Devin: постоянный процесс и сессия — как у Claude-моста. Память
	// нативная (дельта за ход), транскрипт нужен только свежей сессии.
	let devinClient = null;
	let devinSessionId = null;
	let devinSessionModel = null;
	// Раундов с момента полного системного промпта в сессии Devin.
	let devinRounds = 0;
	// Какой системный промпт (с правилами пользователя) уже лежит в сессии.
	let devinSystemSent = "";
	// Инструмент photos: кэш кандидатов (id → {url, query}) и превью,
	// ожидающие отправки модели следующим промптом.
	const photoCache = new Map();
	let photoSeq = 0;
	let pendingPhotos = null;

	// Служебные Claude-сессии (сжатие, критик): их тоже отменяем по «Стоп».
	const serviceSessions = new Set();

	// Сессия Devin помнит разговор сама: при очистке чата или смене беседы
	// её сбрасываем, иначе контекст прежнего чата протечёт в новый.
	let devinChatKey = "";
	function resetDevinSession() {
		devinClient?.kill();
		devinClient = null;
		devinSessionId = null;
		devinSessionModel = null;
		devinRounds = 0;
		devinSystemSent = "";
	}

	function cancelProvider() {
		if (activeDevin) activeDevin.cancel();
		if (sessionId) claude.notify("session/cancel", { sessionId });
		if (devinClient && devinSessionId)
			devinClient.notify("session/cancel", { sessionId: devinSessionId });
		for (const id of serviceSessions)
			claude.notify("session/cancel", { sessionId: id });
	}

	function appendAgentText(text) {
		if (oversized) return;
		agentText += text;
		if (agentText.length > MAX_AGENT_TEXT) {
			oversized = true;
			cancelProvider();
			out({
				type: "error",
				message: "Ответ модели слишком большой — раунд остановлен",
			});
			return;
		}
		out({ type: "chunk", text });
	}

	function waitForRetry(ms) {
		return new Promise((resolve) => {
			const finish = () => {
				clearTimeout(timer);
				clearInterval(poll);
				resolve();
			};
			const timer = setTimeout(finish, ms);
			const poll = setInterval(() => {
				if (cancelled) finish();
			}, 100);
		});
	}

	// Постоянная Devin-сессия на модель; при смене модели или смерти
	// процесса создаём заново (initialize -> authenticate -> session/new).
	async function ensureDevinSession(model) {
		if (devinClient && devinSessionId && devinSessionModel === model)
			return;
		devinClient?.kill();
		devinClient = null;
		devinSessionId = null;
		devinSessionModel = null;
		const config = devinConfig();
		if (!config)
			throw new Error(
				"Devin CLI не найден (ни в PATH, ни в Devin Desktop)",
			);
		const workdir = mkdtempSync(join(tmpdir(), "figma-agent-devin-"));
		const client = new NdJsonClient(config.command, config.args || [], {
			cwd: workdir,
			env: config.env,
		});
		devinClient = client;
		client.proc.on("exit", () => {
			devinClient = null;
			devinSessionId = null;
			devinSessionModel = null;
		});
		client.onSessionUpdate = (_sid, text, isThought) => {
			if (isThought) {
				out({ type: "thought", text });
			} else {
				appendAgentText(text);
			}
		};
		await client.request(
			"initialize",
			{
				protocolVersion: 1,
				clientInfo: { name: "figma-agent", version: "0.1.0" },
				clientCapabilities: {},
			},
			30_000,
		);
		if (config.auth?.apiKey) {
			await client
				.request(
					"authenticate",
					{
						methodId: config.auth.methodId,
						_meta: { api_key: config.auth.apiKey },
					},
					30_000,
				)
				.catch((err) =>
					console.warn(
						`devin: authenticate не удался (${String(err?.message || err)}) — пробуем сохранённые креды`,
					),
				);
		}
		const session = await client.request(
			"session/new",
			{ cwd: workdir, mcpServers: [], mode: "ask" },
			30_000,
		);
		devinSessionId = session.sessionId;
		devinSessionModel = model;
		await client
			.request(
				"session/set_mode",
				{ sessionId: devinSessionId, modeId: "ask" },
				15_000,
			)
			.catch(() => {});
		await client
			.request(
				"session/set_config_option",
				{
					sessionId: devinSessionId,
					configId: "model",
					value: model,
				},
				15_000,
			)
			.catch(() => {});
	}

	// Служебные сессии (выжимка истории) — текст собираем сами.
	const captures = new Map();
	claude.onSessionUpdate = (sid, text, isThought) => {
		const cap = captures.get(sid);
		if (cap) {
			if (!isThought) cap.text += text;
			return;
		}
		if (isThought) {
			out({ type: "thought", text });
		} else {
			appendAgentText(text);
		}
	};

	async function summarizeWithHaiku(prompt) {
		const created = await claude.request("session/new", {
			cwd: WORKDIR,
			model: "claude-haiku-5-5",
			effort: "low",
			fast: false,
		});
		const cap = { text: "" };
		captures.set(created.sessionId, cap);
		serviceSessions.add(created.sessionId);
		try {
			const res = await claude.request(
				"session/prompt",
				{
					sessionId: created.sessionId,
					prompt: [
						{ type: "text", text: SUMMARY_SYSTEM },
						{ type: "text", text: prompt },
					],
				},
				300_000,
				{ resetOnActivity: true },
			);
			const u = usageOf(res);
			if (u) out({ type: "usage", ...u, service: true });
		} finally {
			captures.delete(created.sessionId);
			serviceSessions.delete(created.sessionId);
		}
		return cap.text.trim();
	}

	// Devin без инструментов: режим summarizer; при сбое — запасной Haiku.
	async function summarizeHistory(prompt, devin) {
		if (devin) {
			const base = devinConfig();
			if (base) {
				try {
					const job = acpGenerate(
						{
							...base,
							name: "devin-summarizer",
							label: "Devin summarizer",
							// Флаг принадлежит подкоманде acp — только после неё.
							args: [
								...cleanConfigArgs(),
								"acp",
								"--agent-type",
								"summarizer",
							],
							modeId: null,
						},
						{ system: SUMMARY_SYSTEM, user: prompt },
					);
					activeDevin = job;
					const res = await job.promise;
					const u = usageOf(res);
					if (u) out({ type: "usage", ...u, service: true });
					// Короткий ответ — не выжимка, а отказ сервиса (например,
					// «Feature not available in your country»): берём запасной путь.
					const text = String(res?.text || "").trim();
					if (text.length >= MIN_SUMMARY_CHARS)
						return { text, by: "devin" };
					console.warn(
						"devin summarizer: короткий ответ —",
						text.slice(0, 120),
					);
				} catch (err) {
					console.warn(
						"devin summarizer:",
						String(err?.message || err),
					);
				}
			}
		}
		// Стоп во время сжатия: не поднимаем новую сессию Haiku после отмены.
		if (busy && cancelled) throw new Error("сжатие отменено");
		return { text: await summarizeWithHaiku(prompt), by: "haiku" };
	}

	// Сжатие старых older записей истории (вместе с прошлой выжимкой).
	// removed/added — оценка токенов: UI поправляет индикатор контекста.
	async function compactChat(hist, prevSummary, older, devin) {
		const { text, by } = await summarizeHistory(
			summaryInput(prevSummary, hist.slice(0, older)),
			devin,
		);
		const summary = clampSummary(text);
		if (!summary) throw new Error("пустая выжимка");
		const removed =
			estimateTokens(prevSummary) +
			hist
				.slice(0, older)
				.reduce((n, h) => n + estimateTokens(lineOf(h)), 0);
		return {
			summary,
			by,
			covers: older,
			removed,
			added: estimateTokens(summary),
		};
	}

	claude
		.request("initialize", {
			protocolVersion: 1,
			clientInfo: { name: "figma-agent", version: "0.1.0" },
			capabilities: {},
		})
		.then(() => {
			if (!conn.readySent) {
				conn.readySent = true;
				send(ws, {
					type: "ready",
					...serverInfo(),
					models: MODELS,
					providers: PROVIDERS,
					resumed: false,
					busy: false,
				});
			}
			// Прогрев кэша списка моделей: ошибки тут не важны.
			listProviderModels("claude", false, claude).catch(() => {});
		})
		.catch((err) =>
			send(ws, { type: "error", message: String(err.message || err) }),
		);

	// Критик: отдельный раунд без памяти строителя; ответ — только JSON с замечаниями.
	async function runCritic(msg) {
		const shots = sanitizeImages(msg.images);
		const refs = sanitizeImages(msg.userImages, 4);
		const images = [...refs, ...shots].map(({ data, mimeType }) => ({
			data,
			mimeType,
		}));
		const user = critiqueUserText({
			prompt: String(msg.prompt || "")
				.trim()
				.slice(0, 2000),
			spec: msg.previousSpec,
			issues: Array.isArray(msg.issues) ? msg.issues : [],
			refCount: refs.length,
			labels: shots.map((s, i) => s.label || `screenshot ${i + 1}`),
		});
		const model =
			typeof msg.model === "string" && msg.model.trim()
				? msg.model.trim()
				: "sonnet";
		const acp = parseAcpModel(model);
		let text = "";
		let usage = null;
		try {
			if (acp) {
				const agent = AGENTS.get(acp.agent);
				if (!agent)
					throw new Error(`ACP-агент «${acp.agent}» не подключён`);
				activeDevin = acpGenerate(agentConfig(agent), {
					model: acp.model,
					system: CRITIC_SYSTEM,
					user,
					images,
				});
				const res = await activeDevin.promise;
				text = String(res?.text || "");
				usage = usageOf(res);
			} else if (model.startsWith("devin:")) {
				const base = devinConfig();
				if (!base) throw new Error("Devin CLI не найден");
				activeDevin = acpGenerate(
					{ ...base, name: "devin-critic", label: "Devin critic" },
					{
						model: model.slice("devin:".length),
						system: CRITIC_SYSTEM,
						user,
						images,
					},
				);
				const res = await activeDevin.promise;
				text = String(res?.text || "");
				usage = usageOf(res);
			} else {
				const created = await claude.request("session/new", {
					cwd: WORKDIR,
					model,
					fast: false,
				});
				const cap = { text: "" };
				captures.set(created.sessionId, cap);
				serviceSessions.add(created.sessionId);
				try {
					const res = await claude.request(
						"session/prompt",
						{
							sessionId: created.sessionId,
							prompt: [
								{ type: "text", text: CRITIC_SYSTEM },
								{ type: "text", text: user },
								...images.map((img) => ({
									type: "image",
									data: img.data,
									mimeType: img.mimeType || "image/png",
								})),
							],
						},
						300_000,
						{ resetOnActivity: true },
					);
					text = cap.text;
					usage = usageOf(res);
				} finally {
					captures.delete(created.sessionId);
					serviceSessions.delete(created.sessionId);
				}
			}
		} catch (err) {
			if (cancelled) return;
			console.warn("critique:", String(err?.message || err));
			out({ type: "critique", problems: [], failed: true });
			return;
		}
		if (cancelled) return;
		if (usage) out({ type: "usage", ...usage, service: true });
		out({ type: "critique", ...parseCritique(text) });
	}

	const mcpPlugin = {
		send: (message) => out(message),
		isOpen: () => !!conn.socket && conn.socket.readyState === conn.socket.OPEN,
	};
	mcpRelay.add(mcpPlugin);

	const onMessage = async (raw) => {
		let msg;
		try {
			msg = JSON.parse(raw.toString());
		} catch {
			return;
		}
		mcpRelay.touch(mcpPlugin);
		// Ответ плагина на вызов MCP.
		if (msg.type === "mcp_result") {
			mcpRelay.result(msg);
			return;
		}

		if (msg.type === "cancel") {
			cancelled = true;
			cancelProvider();
			return;
		}

		// Ручное сжатие истории (кнопка-индикатор контекста).
		// Очистка чата в UI: новая беседа без памяти прежней.
		if (msg.type === "reset_context") {
			if (!busy) {
				resetDevinSession();
				devinChatKey = "";
			}
			return;
		}

		if (msg.type === "compact") {
			const hist = Array.isArray(msg.history) ? msg.history : [];
			const prev = typeof msg.summary === "string" ? msg.summary : "";
			const older = Math.max(
				olderCount(hist),
				hist.length - KEEP_RECENT_MESSAGES,
			);
			if (older <= 0) {
				send(ws, { type: "summary", nothing: true, manual: true });
				return;
			}
			try {
				const model = typeof msg.model === "string" ? msg.model : "";
				const r = await compactChat(
					hist,
					prev,
					older,
					model.startsWith("devin:"),
				);
				// Нативная память Devin держит старое — следующий раунд с новой сессией.
				if (model.startsWith("devin:")) {
					devinClient?.kill();
					devinClient = null;
					devinSessionId = null;
					devinSessionModel = null;
				}
				lastRound.delete(model);
				send(ws, {
					type: "summary",
					text: r.summary,
					covers: r.covers,
					removed: r.removed,
					added: r.added,
					by: r.by,
					manual: true,
				});
			} catch (err) {
				console.warn("compact:", String(err?.message || err));
				send(ws, { type: "summary", failed: true, manual: true });
			}
			return;
		}

		// Список доступных моделей провайдера (для выбора в настройках).
		if (msg.type === "list_models" && typeof msg.provider === "string") {
			try {
				const { models, families, note } = await listProviderModels(
					msg.provider,
					msg.force === true,
					claude,
				);
				send(ws, {
					type: "models_list",
					provider: msg.provider,
					models,
					families: families?.length ? families : undefined,
					note: note || undefined,
				});
			} catch (err) {
				send(ws, {
					type: "models_list",
					provider: msg.provider,
					error: String(err?.message || err),
				});
			}
			return;
		}

		if (msg.type !== "generate") return;
		if (busy) {
			send(ws, {
				type: "error",
				message:
					"Агент ещё занят предыдущим запросом, повторите чуть позже",
			});
			return;
		}
		if (typeof msg.prompt !== "string" || !msg.prompt.trim()) {
			send(ws, { type: "error", message: "Пустой запрос" });
			return;
		}
		busy = true;
		cancelled = false;
		oversized = false;
		agentText = "";
		const model =
			typeof msg.model === "string" && msg.model.trim()
				? msg.model.trim()
				: "sonnet";
		// Уровень размышления Claude (low…max); иначе мост берёт значение по умолчанию
		const effort = ["low", "medium", "high", "xhigh", "max"].includes(
			msg.effort,
		)
			? msg.effort
			: undefined;
		const fast = msg.fast === true;
		try {
			if (msg.critique === true) {
				await runCritic(msg);
				return;
			}
			const isReview = msg.review === true;
			let promptResult = null;
			const acp = parseAcpModel(model);
			// Без памяти между запросами: одноразовые ACP-агенты (agents.json)
			// и Claude — мост на каждый prompt создаёт новый query() без
			// истории. Им транскрипт чата нужен в каждом раунде. Копить историю
			// внутри SDK (resume) не стоит: каждый раунд несёт полное дерево и
			// скриншоты, контекст разросся бы.
			const stateless = !!acp || !model.startsWith("devin:");
			// Devin держит сессию, но пока её нет или модель сменилась —
			// память пустая, транскрипт нужен один раз.
			if (
				model.startsWith("devin:") &&
				typeof msg.chatKey === "string" &&
				msg.chatKey
			) {
				if (devinChatKey && devinChatKey !== msg.chatKey)
					resetDevinSession();
				devinChatKey = msg.chatKey;
			}
			const devinFresh =
				model.startsWith("devin:") &&
				(!devinSessionId ||
					devinSessionModel !== model.slice("devin:".length));
			// Сессию Claude пересоздаём при смене модели/effort/fast.
			const claudeFresh =
				!sessionId ||
				sessionModel !== model ||
				sessionEffort !== effort ||
				sessionFast !== fast;
			// Изображения, приложенные пользователем (референс/макет/скриншот):
			// проверяем формат и размер, идут первыми, дальше рендеры нод.
			const userImages = Array.isArray(msg.userImages)
				? msg.userImages
						.filter(
							(img) =>
								img &&
								typeof img.data === "string" &&
								img.data.length > 0 &&
								img.data.length < 8_000_000 &&
								["image/png", "image/jpeg"].includes(
									img.mimeType,
								),
						)
						.slice(0, 4)
				: [];
			const shots = sanitizeImages(msg.images);
			let userText;
			if (isReview) {
				// Ревью: модель смотрит на фактически построенное дерево и
				// либо одобряет ({"ok":true}), либо возвращает исправленную спеку.
				userText =
					`You generated a Figma design spec for this request: "${msg.prompt.trim()}".\n\n` +
					`It was built in Figma. Resulting node tree (actual sizes after auto-layout):\n` +
					JSON.stringify(msg.previousSpec) +
					`\n\nBuild warnings: ${JSON.stringify(msg.warnings || [])}\n` +
					`Every build warning is an operation that FAILED or was skipped, so its change is NOT in the tree. Fix each one in this answer with edits on real node ids from the tree above (an alias like "$name" only works inside the answer that creates it with "as"; "hug" needs a frame with auto-layout; a missing component must be created first). Do not answer ok while warnings remain, unless a warning truly cannot be fixed - then say why in "remaining".\n` +
					`${msg.finalCheck === true ? 'FINAL CHECK: before approving, go through the user\'s request point by point and compare it with the whole result (tree + screenshot): is every requested section, element, text and behavior present, are components used instead of copies, are spacing/alignment/contrast/typography consistent, is nothing clipped or overlapping, does every photo fit its subject (if not — replace it with an update op carrying a better "query", or preview candidates first with {"photos":"<query>"} and pick by "photo" id)? If anything is missing or wrong, fix it with edits (use "remaining" if more parts are left). Answer {"ok":true} only if the request is FULLY done and verified.\n' : ""}` +
					(Array.isArray(msg.issues) && msg.issues.length
						? `Lint report — measured on the real nodes (overflow outside the parent, low text contrast, text under 12px, spacing off the 4/8 scale, default layer names, small tap targets on mobile, repeated blocks without a component, content problems: mixed currencies/dates, inconsistent button labels, placeholder texts, typos in typesetting, wrong language, artificial numbers): ${JSON.stringify(msg.issues.slice(0, 40))}\nFix every real problem with edits on these ids. If an item is intentional (e.g. a decorative overlap), leave it and mention it briefly in "summary".\n`
						: "") +
					`${Array.isArray(msg.critique) ? `An independent reviewer checked the result and found these problems: ${JSON.stringify(sanitizeCritique(msg.critique))}\nFix every real one with edits on the node ids from the tree. If an item is wrong, skip it and say why briefly in "summary".\n` : ""}` +
					`${msg.unresolved === true ? "You already answered ok, but the warnings above are STILL unresolved - repair them now instead of approving.\n" : ""}` +
					`${msg.continueWork === true ? `CONTINUE: you reported unfinished work: "${String(msg.remaining || "").slice(0, 300)}". Build the NEXT part now with edits on the node ids from the tree above, and keep "remaining" up to date. Do not answer ok while something the user asked for is still missing.\n` : ""}\n` +
					`${userImages.length ? `REFERENCE: the FIRST ${userImages.length} attached image(s) are the user's reference. Compare the result with them — layout, proportions, content, colors, typography — and fix the important differences the user would expect to match.\n` : ""}Check the result against the request. If the build has real problems (broken layout, unreadable or missing text, wrong sizes, missing elements), fix them with {"edits":[...],"summary":"<one short sentence>"} on the existing node ids — output a full corrected spec JSON (with "summary" on the root frame) ONLY if most of the block must be rebuilt.` +
					`${shots.length > 1 && shots.every((s) => s.label) ? `Screenshots of the built result are attached after the user's reference images (if any), in this order: ${shots.map((s, i) => `#${i + 1} ${s.label}`).join("; ")}. The parts show the design top to bottom at readable scale — check every part for visual problems (overlapping or clipped elements, text overflowing, empty areas, poor contrast, broken alignment) in addition to the tree. ` : Array.isArray(msg.images) && msg.images.length && !(Array.isArray(msg.inspected) && msg.inspected.length) ? "A screenshot of the built result is attached — look at it for visual problems (overlapping or clipped elements, text overflowing, empty areas, poor contrast, broken alignment) in addition to the tree. " : ""}If you need to look at nodes that are missing from the tree (omitted children, the Components frame, anything outside it), you may answer {"inspect":["<id>",...],"reason":"..."}, {"search":"<name>","reason":"..."} or {"photos":"<query>","reason":"..."} instead of approving. If everything is fine and the request is FULLY done, output exactly {"ok":true,"summary":"<one short sentence for the user>"}. If the build is fine but you are assembling a large design in parts and sections are still missing, do NOT answer ok: output {"edits":[...],"summary":"...","remaining":"<what is left>"} that builds the NEXT part (use the node ids from the tree above as parents). Answer ok only when everything the user asked for is built. If you genuinely cannot finish something, answer ok with "remaining" explaining why and "blocked":true — otherwise you will be asked to continue.`;
			} else {
				userText = msg.prompt.trim();
				if (msg.previousSpec) {
					userText +=
						"\n\nCurrent design JSON — modify it according to the request, keep everything not mentioned unchanged:\n" +
						JSON.stringify(msg.previousSpec);
				}
				if (msg.selection) {
					userText +=
						"\n\nTHE USER HAS SELECTED THESE NODES ON THE FIGMA CANVAS — they are the TARGET of this request (serialized with the same schema; work on exactly these ids, not on any other design). Use them as reference — reuse their structure, colors and sizes if the request asks to modify or continue the selected design. For an instance, \"overrides\" holds the texts actually written in it and \"mainComponentTree\" the structure of its main component:\n" +
						JSON.stringify(msg.selection);
				}
				// Оглавление страницы: по нему агент сам выбирает,
				// что посмотреть через inspect.
				if (Array.isArray(msg.page) && msg.page.length) {
					userText +=
						"\n\nOutline of the user's current Figma page — top-level nodes with their ids, names, types and sizes. Use inspect to look at any of them visually:\n" +
						JSON.stringify(msg.page);
				}
				userText += designSeed(msg, {
					isReview,
					hasImages: userImages.length > 0,
				});
				if (typeof msg.buildError === "string" && msg.buildError) {
					userText +=
						`\n\nYour previous spec FAILED to build in Figma with this error: ${msg.buildError.slice(0, 500)}\n` +
						"The spec above is the failing one. Output a corrected full spec (valid colors as #RRGGBB, valid sizes, known node types).";
				}
				if (msg.noInspect) {
					userText +=
						"\n\nDo NOT request more visual inspections — output the final spec JSON now.";
				}
			}

			// Результаты inspect/search применяются в любом раунде — и в
			// обычном запросе, и в ревью (там inspect тоже разрешён).
			// Сериализованные деревья нод, которые агент просил
			// посмотреть (вместе со скриншотами).
			if (Array.isArray(msg.plan) && msg.plan.length) {
				const done = new Set(
					Array.isArray(msg.planDone) ? msg.planDone.map(Number) : [],
				);
				userText +=
					"\n\nYour plan for this task (from your earlier answer), in order:\n" +
					msg.plan
						.filter((p) => typeof p === "string")
						.slice(0, 16)
						.map(
							(p, i) =>
								`${i + 1}. ${p}${done.has(i + 1) ? " — done" : ""}`,
						)
						.join("\n") +
					'\nWork through it part by part; keep "remaining" in sync with the parts not built yet. As soon as a part is finished AND checked on the screenshot, list its number in "planDone" (all finished numbers so far). Send a new "plan" only if the task itself changed.';
			}
			if (Array.isArray(msg.inspected) && msg.inspected.length) {
				userText +=
					"\n\nSerialized structure of the inspected nodes (matches the attached screenshots):\n" +
					JSON.stringify(msg.inspected);
			}
			// Плагин прислал PNG-скриншоты нод, которые агент просил
			// посмотреть (image-блоки приложены к промпту).
			if (Array.isArray(msg.images) && msg.images.length) {
				userText +=
					"\n\nAttached PNG images (after the user's own reference images, if any) are visual renders of the nodes you asked to inspect (same order as the requested ids). Now output the final answer.";
			}
			if (Array.isArray(msg.missing) && msg.missing.length) {
				userText += `\n\nThese node ids could not be rendered (deleted or unavailable): ${msg.missing.join(", ")}.`;
			}
			// Результаты поиска нод по имени (экшен "search" модели).
			if (Array.isArray(msg.searchResults)) {
				const q = String(msg.searchQuery || "");
				const where = msg.searchScope
					? `inside "${msg.searchScope}" (${msg.searchScopeId})`
					: "on the current page";
				const what =
					q === "*"
						? "any node"
						: msg.searchText
							? `name or text contains "${q}"`
							: `name contains "${q}"`;
				userText +=
					(msg.searchScopeError
						? `\n\nSearch failed: ${String(msg.searchScopeError)}. Use an id from the page outline or the tree.`
						: `\n\nNodes ${where} — ${what}${msg.searchType ? `, type ${String(msg.searchType).toUpperCase()}` : ""}:\n` +
							JSON.stringify(msg.searchResults) +
							(msg.searchTruncated === true
								? `\n(only ${msg.searchResults.length} of ${msg.searchTotal ?? "more"} matches shown — narrow it with "in":"<frame id>", "type", or a sharper query, or read the next page with "offset":${(Number(msg.searchOffset) || 0) + msg.searchResults.length})`
								: "")) +
					"\nUse these ids for inspect/edits. Now output the final answer.";
			}

			userText += schemaText(msg.schemaName);
			userText += updatesText(msg.userUpdates);
			// Ответы на бриф (или «реши сам») — модель строит, не переспрашивая.
			const brief = briefText(msg.briefAnswers, msg.briefSkipped === true);
			if (brief) userText += "\n\n" + brief;

			if (userImages.length) {
				const n = userImages.length;
				userText += `

The user attached ${n} reference image(s) — they are the FIRST ${n} attached image(s) (a mockup, screenshot, photo or inspiration). Study them and follow them closely (structure, content, layout, style, colors). You cannot embed the bitmap itself: use "image" nodes with a "query" where a photo/illustration goes and rebuild everything else from frames, text and icons.`;
				userText += moodText(msg.refMode, msg.refPalette);
			}
			userText += styleSourceText(msg.styleSource);
			userText += teachText(msg.teach);
			userText += variantsAllowedText(msg.allowVariants);
			// Рабочая выжимка агента по приложенным документам ("notes"):
			// если он её оставил, сырой текст документов больше не шлём —
			// экономим контекст на всех последующих раундах.
			const docNotes =
				typeof msg.docNotes === "string" ? msg.docNotes.trim() : "";
			if (docNotes) {
				userText +=
					'\n\nYour own digest of the documents the user supplied earlier (the full text is NOT sent again — this digest is your only record of it):\n"""\n' +
					docNotes.slice(0, 8000) +
					'\n"""';
			} else if (Array.isArray(msg.userFiles) && msg.userFiles.length) {
				// Первое знакомство: документ идёт целиком (потолок только
				// страховочный), дальше его заменит "notes" агента.
				// В ревью без выжимки — только начало.
				const { docs, errors } = await extractFiles(
					sanitizeUserFiles(msg.userFiles),
					isReview ? 6000 : 200_000,
				);
				for (const doc of docs) {
					if (doc.isSvg) {
						// В ревью разметка не нужна — результат сверяют со скриншотом.
						if (isReview) continue;
						userText +=
							"\n\nAttached SVG file «" +
							doc.name +
							"» — vector markup supplied by the user (a logo, icon or illustration). " +
							'To use it in the design insert it as {"type":"icon","svg":"<the markup below, copied exactly>","w":N,"h":N} ' +
							'with the sizes you need (keep its proportions: see viewBox); colors can be changed via the "color" field only for currentColor icons. ' +
							"If the user wants to recreate or modify it, you may also redraw it. Markup:\n" +
							doc.text;
						continue;
					}
					const part = doc.truncated
						? " (first " +
							doc.text.length +
							" of " +
							doc.chars +
							" characters)"
						: "";
					userText +=
						"\n\nAttached document «" +
						doc.name +
						"»" +
						part +
						' — the brief/content source supplied by the user:\n"""\n' +
						doc.text +
						'\n"""';
				}
				for (const e of errors) {
					userText +=
						"\n\n(The user attached «" +
						e.name +
						"», but it could not be read: " +
						e.error +
						'. Tell them in "summary".)';
				}
			}
			// Скриншот выделенного блока — сразу после референсов пользователя.
			const selectionShot =
				!isReview &&
				typeof msg.selectionImage === "string" &&
				msg.selectionImage.length > 0 &&
				msg.selectionImage.length < 8_000_000
					? { data: msg.selectionImage, mimeType: "image/png" }
					: null;
			const images = [
				...userImages,
				...(selectionShot ? [selectionShot] : []),
				...shots.map(({ data, mimeType }) => ({ data, mimeType })),
			];
			if (selectionShot)
				userText += `\n\nImage #${userImages.length + 1} is a screenshot of the user's selection (the first selected node). It shows how the selected block looks right now — compare it with the serialized tree above.`;

			// Ответ на инструмент "photos": превью кандидатов идут
			// image-блоками, выбор — через "photo":"<id>" в спеке.
			if (msg.photos === true) {
				const pending = pendingPhotos;
				pendingPhotos = null;
				if (pending?.items?.length) {
					userText +=
						`\n\nPhoto search results for "${pending.query}" — ${pending.items.length} candidate thumbnails are attached as the LAST image blocks, in this order: ` +
						pending.items.map((i) => i.id).join(", ") +
						`. For each image node pick the best one and reference it as "photo":"<id>" — the full-size photo will be downloaded for the chosen id. If none fit, request {"photos":"<better query>"} again or use a "query" directly. Now output the final answer.`;
					for (const it of pending.items)
						images.push({
							data: it.thumb.data,
							mimeType: it.thumb.mime,
						});
				} else if (pending) {
					userText += `\n\nPhoto search for "${pending.query}" returned no results — try {"photos":"<different query>"} or use a "query" directly. Now output the final answer.`;
				}
			}

			userText += checklistText(msg.checklist, msg.checked);

			// Системный промпт + правила пользователя из настроек.
			// Хвост — стабильный контекст файла (шрифты, стили, компоненты): он
			// кэшируется с системным промптом, а Devin получает его при изменении.
			const system = systemPromptWith(msg.rules) + stableBlock(msg);

			// Транскрипт чата — контекст агентов без памяти. Полный транскрипт
			// (follow-up вроде «дальше» опирается на него); последняя реплика —
			// текущий запрос (он же продублирован выше).
			const chatHist = Array.isArray(msg.history) ? msg.history : [];
			let chatSummary =
				typeof msg.summary === "string" ? msg.summary : "";
			let sendsHistory = stateless || claudeFresh || devinFresh;
			const devinNative = model.startsWith("devin:");
			const windowTokens = windowOf(model, devinContextOf);
			const sizeOf = (block) =>
				promptEstimate({
					chars: system.length + userText.length + block.length,
					images: images.length,
					last: lastRound.get(model),
				});
			// Нативная память Devin переполнилась — новая сессия, а контекст
			// ей передаём выжимкой и последними репликами.
			if (
				!sendsHistory &&
				devinNative &&
				needsCompaction(sizeOf(""), windowTokens)
			) {
				devinClient?.kill();
				devinClient = null;
				devinSessionId = null;
				devinSessionModel = null;
				sendsHistory = true;
			}
			let historyBlock = sendsHistory
				? historyText(chatSummary, chatHist)
				: "";
			// Окно модели: запрос не влезает с запасом — старую часть истории
			// сжимаем в выжимку (17–20k токенов), последние реплики остаются.
			if (
				historyBlock &&
				needsCompaction(sizeOf(historyBlock), windowTokens)
			) {
				const older = olderCount(chatHist);
				if (older > 0) {
					try {
						const r = await compactChat(
							chatHist,
							chatSummary,
							older,
							devinNative,
						);
						if (cancelled) return;
						chatSummary = r.summary;
						historyBlock = historyText(
							chatSummary,
							chatHist.slice(older),
						);
						send(ws, {
							type: "summary",
							text: r.summary,
							covers: r.covers,
							removed: r.removed,
							added: r.added,
							by: r.by,
						});
					} catch (err) {
						if (cancelled) return;
						console.warn(
							"history summary:",
							String(err?.message || err),
						);
						send(ws, { type: "summary", failed: true });
					}
				}
			}
			userText += historyBlock;
			const promptChars = system.length + userText.length;
			// Кольцо контекста обновляем сразу при отправке раунда (оценка от реального
			// расхода прошлого раунда), после ответа придёт точное значение.
			send(ws, { type: "ctx", tokens: sizeOf(""), window: windowTokens });
			const onChunk = (chunk, isThought) => {
				if (isThought) {
					out({ type: "thought", text: chunk });
				} else {
					appendAgentText(chunk);
				}
			};
			async function runProvider() {
				let job = null;
				if (acp) {
					// Свой ACP-агент из agents.json: одноразовый процесс на запрос.
					const agent = AGENTS.get(acp.agent);
					if (!agent) {
						throw new Error(
							`ACP-агент «${acp.agent}» не подключён: добавьте его в server/agents.json`,
						);
					}
					job = acpGenerate(agentConfig(agent), {
						model: acp.model,
						system,
						user: userText,
						images,
						onChunk,
					});
					activeDevin = job;
					await job.promise;
				} else if (model.startsWith("devin:")) {
					// Devin ACP: постоянная сессия на модель — память нативная,
					// как у Claude. Таймаут молчания перезапускают чанки.
					const devinModel = model.slice("devin:".length);
					const devinNew =
						!devinClient ||
						!devinSessionId ||
						devinSessionModel !== devinModel;
					await ensureDevinSession(devinModel);
					// Промпт копится в памяти сессии: полный — на новой сессии и
					// раз в FULL_SYSTEM_EVERY раундов, между ними — напоминание.
					const fullSystem =
						needsFullSystem({
						isNew: devinNew,
						sent: devinSystemSent,
						system,
						rounds: devinRounds,
						every: FULL_SYSTEM_EVERY,
					});
					devinRounds = fullSystem ? 1 : devinRounds + 1;
					if (fullSystem) devinSystemSent = system;
					const devinText =
						devinNew && !sendsHistory
							? userText + historyText(chatSummary, chatHist)
							: userText;
					const res = await devinClient.request(
						"session/prompt",
						{
							sessionId: devinSessionId,
							prompt: [
								{
									type: "text",
									text: fullSystem ? system : SYSTEM_REMINDER,
								},
								{ type: "text", text: devinText },
								...images.map((img) => ({
									type: "image",
									data: img.data,
									mimeType: img.mimeType || "image/png",
								})),
							],
						},
						300_000,
						{ resetOnActivity: true },
					);
					promptResult = res;
					const meta = Object.fromEntries(
						Object.entries(res || {}).filter(
							([k, v]) => v !== undefined && v !== null,
						),
					);
					if (Object.keys(meta).length)
						console.log(
							"Devin prompt result:",
							JSON.stringify(meta),
						);
				} else {
					// Claude-мост: модель фиксируется на сессию — при смене делаем новую.
					if (
						!sessionId ||
						sessionModel !== model ||
						sessionEffort !== effort ||
						sessionFast !== fast
					) {
						const created = await claude.request("session/new", {
							cwd: WORKDIR,
							model,
							effort,
							fast,
						});
						sessionId = created.sessionId;
						sessionModel = model;
						sessionEffort = effort;
						sessionFast = fast;
					}
					// Таймаут молчания: стримящиеся чанки/мысли его
					// перезапускают, зависшая сессия отвалится за 5 минут.
					const res = await claude.request(
						"session/prompt",
						{
							sessionId,
							prompt: [
								{ type: "text", text: system },
								{ type: "text", text: userText },
								// Скриншоты нод — ACP image-блоки, мост конвертирует
								// их в формат Anthropic.
								...images.map((img) => ({
									type: "image",
									data: img.data,
									mimeType: img.mimeType || "image/png",
								})),
							],
						},
						300_000,
						{ resetOnActivity: true },
					);
					// Что вернул мост помимо текста: usage/cached токены —
					// по ним видно, работает ли кэш ввода.
					promptResult = res;
					const meta = Object.fromEntries(
						Object.entries(res || {}).filter(
							([k, v]) => v !== undefined && v !== null,
						),
					);
					if (Object.keys(meta).length)
						console.log(
							"claude prompt result:",
							JSON.stringify(meta),
						);
				}
				return promptResult;
			}
			for (let attempt = 0; ; attempt++) {
				agentText = "";
				promptResult = null;
				let reason = "";
				try {
					await runProvider();
				} catch (err) {
					if (cancelled || oversized) return;
					if (!isTransientError(err)) throw err;
					reason = String(err?.message || err).slice(0, 160);
				}
				if (cancelled || oversized) return;
				if (!reason && isTransientReply(agentText))
					reason = agentText.trim().slice(0, 160);
				if (!reason) break;
				if (attempt >= RETRY_DELAYS.length) {
					const err = new Error(
						`Провайдер временно недоступен: ${reason}`,
					);
					err.provider_unavailable = true;
					throw err;
				}
				const wait = RETRY_DELAYS[attempt];
				out({
					type: "retry",
					attempt: attempt + 1,
					of: RETRY_DELAYS.length,
					wait,
					reason,
				});
				await waitForRetry(wait);
				if (cancelled) return;
			}

			// Пользователь остановил генерацию — оборванный ответ
			// молча выбрасываем, в чат ничего не шлём.
			if (cancelled) return;
			if (oversized) return;

			// Расход раунда (токены/стоимость) — UI суммирует за прогон.
			const usage = usageOf(promptResult);
			if (usage)
				send(ws, { type: "usage", ...usage, window: windowTokens });
			// Замер кэша: system/user в символах и доля прочитанного из кэша.
			if (usage) {
				const total = usage.input + usage.cached;
				console.log(
					`round[${model}] system=${system.length} user=${userText.length} images=${images.length} in=${usage.input} cached=${usage.cached} out=${usage.output}${total ? ` cacheRate=${Math.round((usage.cached / total) * 100)}%` : ""}`,
				);
			}
			if (usage && usage.input + usage.cached > 0)
				lastRound.set(model, {
					tokens: usage.input + usage.cached,
					chars: promptChars,
					images: images.length,
				});

			const { spec, prose } = extractJson(agentText);
			// Варианты направления: эскизы собираем в одну рамку «Directions».
			let variantLabels = null;
			const wrapped = variantsWrapper(spec);
			if (wrapped) {
				for (const k of Object.keys(spec)) delete spec[k];
				Object.assign(spec, wrapped.wrapper);
				variantLabels = wrapped.labels;
			}
			// Иконки Lucide -> svg, эмодзи из текстов прочь; image-ноды
			// получают скачанные стоковые фото (data/mime).
			if (spec && typeof spec === "object") {
				// chart/table → обычные ноды (с meta для правки данных).
				await prefetchOsm(spec);
				const blocks = expandBlocks(spec);
				if (blocks.failed.length)
					console.warn("blocks: нет данных для", blocks.failed.join(", "));
				for (const w of blocks.warnings) console.warn(w);
				expandPatternFills(spec);
				const report = processDesign(spec);
				if (report.unresolved.length)
					console.warn(
						"icons: не найдены в Lucide:",
						report.unresolved.join(", "),
					);
				try {
					const img = await resolveImages(spec, photoCache);
					if (img.failed.length)
						console.warn(
							"images: не удалось скачать:",
							img.failed.join("; "),
						);
				} catch (err) {
					console.warn("images:", String(err));
				}
			}
			// Если модель не заполнила "summary", но написала текст рядом с
			// JSON — используем его как реплику агента (убираем обрывки фенсов).
			const proseSummary =
				prose.replace(/```/g, "").trim().slice(0, 800) || null;
			// "notes" — рабочая выжимка агента (по документам и контексту);
			// уходит клиенту и возвращается следующими запросами вместо
			// полного текста документов.
			const notes =
				spec &&
				typeof spec === "object" &&
				typeof spec.notes === "string"
					? spec.notes.slice(0, 4000)
					: null;
			if (spec && typeof spec === "object") delete spec.notes;
			// "plan" — список частей большой задачи; UI хранит его и
			// возвращает в каждом раунде, чтобы модель шла по порядку.
			if (spec && typeof spec === "object" && Array.isArray(spec.plan)) {
				const plan = spec.plan
					.filter((p) => typeof p === "string" && p.trim())
					.slice(0, 16)
					.map((p) => p.trim().slice(0, 80));
				delete spec.plan;
				if (plan.length) send(ws, { type: "plan", plan });
			}
			// "checklist" — требования задачи, "checked" — номера выполненных.
			const checklist = cleanChecklist(spec?.checklist);
			if (spec && typeof spec === "object") delete spec.checklist;
			if (checklist.length) send(ws, { type: "checklist", items: checklist });
			if (spec && typeof spec === "object" && Array.isArray(spec.checked)) {
				const size = checklist.length || cleanChecklist(msg.checklist).length;
				const checked = cleanChecked(spec.checked, size);
				delete spec.checked;
				if (checked.length) send(ws, { type: "checked", done: checked });
			}
			// "next" — следующие шаги для кнопок под «Итогом».
			const next = cleanNext(spec?.next);
			if (spec && typeof spec === "object") delete spec.next;
			// "planDone" — номера готовых частей плана (с 1), накопительно.
			if (
				spec &&
				typeof spec === "object" &&
				Array.isArray(spec.planDone)
			) {
				const done = spec.planDone
					.map(Number)
					.filter((n) => Number.isInteger(n) && n > 0 && n <= 16);
				delete spec.planDone;
				if (done.length) send(ws, { type: "plan_done", done });
			}
			// Маршрут ответа: inspect/search разрешены и в раунде ревью.
			const route = routeReply(spec, {
				isReview,
				noInspect: msg.noInspect === true,
				noPhotos: msg.noPhotos === true,
				noAsk: msg.noAsk === true,
			});
			if (route === "ask") {
				// Бриф: карточка вопросов в UI, ответы вернутся следующим раундом.
				const questions = sanitizeQuestions(spec.ask);
				if (questions.length)
					send(ws, {
						type: "ask",
						questions,
						summary:
							typeof spec.summary === "string" ? spec.summary : "",
						notes,
					});
				else
					send(ws, {
						type: "error",
						message: "Модель прислала некорректные вопросы — повторите запрос",
					});
			} else if (route === "ask_limit") {
				send(ws, {
					type: "error",
					message:
						"Модель снова задаёт вопросы вместо работы — уточните запрос или отключите уточнения в настройках",
				});
			} else if (route === "schema") {
				// Модель просит подробную схему редкого типа — вернётся следующим раундом.
				send(ws, {
					type: "schema",
					name: String(spec.schema).trim().toLowerCase(),
					reason:
						typeof spec.reason === "string" && spec.reason
							? spec.reason
							: proseSummary || "",
					notes,
				});
			} else if (route === "inspect_limit") {
				// Лимит просмотров исчерпан, а модель всё равно просит ещё —
				// не зацикливаем клиента.
				send(ws, {
					type: "error",
					message:
						"Модель продолжает запрашивать просмотр вместо финального ответа — попробуйте уточнить запрос",
				});
			} else if (route === "search") {
				// Агент ищет ноды по имени — плагин вернёт список
				// совпадений и запрос повторится с ними в контексте.
				const num = Number(spec.limit);
				send(ws, {
					type: "search",
					query: spec.search.trim().slice(0, 80),
					in:
						typeof spec.in === "string"
							? spec.in.slice(0, 40)
							: undefined,
					text: spec.text === true || undefined,
					nodeType:
						typeof spec.type === "string"
							? spec.type.slice(0, 30)
							: undefined,
					limit:
						Number.isFinite(num) && num > 0
							? Math.min(num, 100)
							: undefined,
					offset:
						Number.isFinite(Number(spec.offset)) && Number(spec.offset) > 0
							? Math.min(Math.round(Number(spec.offset)), 10000)
							: undefined,
					reason:
						typeof spec.reason === "string" && spec.reason
							? spec.reason
							: proseSummary || "",
					notes,
				});
			} else if (route === "inspect") {
				// Агент просит визуальный просмотр нод — плагин вернёт
				// PNG и повторит запрос с картинками.
				const ids = spec.inspect.slice(0, 4).map((v) => String(v));
				send(ws, {
					type: "inspect",
					ids,
					reason:
						typeof spec.reason === "string" && spec.reason
							? spec.reason
							: proseSummary || "",
					notes,
				});
			} else if (route === "photos_limit") {
				// Лимит поисков фото исчерпан, а модель всё равно просит ещё.
				send(ws, {
					type: "error",
					message:
						"Модель продолжает запрашивать поиск фото вместо финального ответа — попробуйте уточнить запрос",
				});
			} else if (route === "photos") {
				// Предпросмотр стоковых фото: сервер ищет кандидатов и шлёт
				// их превью модели следующим промптом (через UI-петлю).
				const query = String(spec.photos).trim().slice(0, 120);
				let found = [];
				try {
					found = await searchPhotos(query, 6);
				} catch (err) {
					console.warn("photos:", String(err?.message || err));
				}
				pendingPhotos = {
					query,
					items: found.map((f) => {
						const id = `p${++photoSeq}`;
						photoCache.set(id, { url: f.url, query });
						return { id, thumb: f.thumb };
					}),
				};
				// Кэш кандидатов ограничиваем — старые вытесняются новыми.
				while (photoCache.size > 40)
					photoCache.delete(photoCache.keys().next().value);
				send(ws, {
					type: "photos",
					query,
					count: pendingPhotos.items.length,
					reason:
						typeof spec.reason === "string" && spec.reason
							? spec.reason
							: proseSummary || "",
					notes,
				});
			} else if (route === "review_ok") {
				// Ревью одобрено: модель ответила {"ok":true}, либо
				// просто текстом без JSON, либо объектом без спеки/правок
				// (например {"ok":false,...}) — текст показываем как реплику.
				send(ws, {
					type: "done",
					ok: true,
					review: true,
					summary:
						spec && typeof spec.summary === "string"
							? spec.summary
							: proseSummary,
					remaining: remainingOf(spec),
					next: next.length ? next : undefined,
					// Модель сообщила, что остаток сделать невозможно — не продолжать
					blocked: spec?.blocked === true || undefined,
					notes,
				});
			} else if (route === "edits") {
				// Точечные правки существующих нод — плагин применит
				// операции без пересборки блока.
				send(ws, {
					type: "done",
					edits: spec.edits,
					summary:
						typeof spec.summary === "string"
							? spec.summary
							: proseSummary,
					remaining: remainingOf(spec),
					next: next.length ? next : undefined,
					// Модель сообщила, что остаток сделать невозможно — не продолжать
					blocked: spec?.blocked === true || undefined,
					notes,
					review: isReview,
				});
			} else if (route === "say") {
				// Отчёт без спеки ({"ok":true,"summary":...} вне ревью):
				// модель считает работу законченной — показываем реплику
				// и мягко завершаем прогон.
				send(ws, {
					type: "done",
					say: true,
					summary:
						typeof spec.summary === "string"
							? spec.summary
							: proseSummary || "Готово",
					remaining: remainingOf(spec),
					next: next.length ? next : undefined,
					// Модель сообщила, что остаток сделать невозможно — не продолжать
					blocked: spec?.blocked === true || undefined,
					notes,
				});
			} else if (route === "invalid") {
				if (!spec && proseSummary) {
					// Модель ответила просто текстом — вопрос, пояснение
					// или отказ. Показываем реплику и мягко завершаем прогон.
					send(ws, {
						type: "done",
						say: true,
						summary: proseSummary,
					});
				} else {
					// Пишем ответ в консоль — по нему видно, что модель
					// вернула вместо спеки (другой формат, обрыв JSON).
					console.warn(
						"spec: невалидный ответ модели:",
						agentText.slice(0, 1500),
					);
					send(ws, {
						type: "error",
						message:
							"Модель не вернула валидную JSON-спеку (ожидался корневой frame)",
						raw: agentText.slice(0, 4000),
					});
				}
			} else {
				// "replace":"<id>" — агент решил заменить существующую
				// ноду, а не создавать новый фрейм.
				const replace =
					typeof spec.replace === "string" ? spec.replace : null;
				if (replace) delete spec.replace;
				// "summary" — короткая реплика агента, показываем в чате.
				const summary =
					typeof spec.summary === "string"
						? spec.summary
						: proseSummary;
				if (summary) delete spec.summary;
				const remaining = remainingOf(spec);
				delete spec.remaining;
				send(ws, {
					type: "done",
					spec,
					variants: variantLabels || undefined,
					replace,
					summary,
					remaining,
					next: next.length ? next : undefined,
					notes,
					review: isReview,
				});
			}
		} catch (err) {
			// Остановка пользователем обрывает процесс — это не ошибка.
			if (!cancelled && !oversized) {
				send(ws, {
					type: "error",
					message: String(err?.message || err),
					provider_unavailable: err?.provider_unavailable === true,
				});
			}
		} finally {
			activeDevin = null;
			busy = false;
		}
	};

	conn.isBusy = () => busy;
	conn.flush = () => {
		for (const message of conn.outbox.splice(0)) send(conn.socket, message);
	};
	const dispose = () => {
		if (conn.disposed) return;
		conn.disposed = true;
		mcpRelay.remove(mcpPlugin);
		clearTimeout(conn.graceTimer);
		cancelled = true;
		if (activeDevin) activeDevin.cancel();
		if (sessionId) claude.notify("session/cancel", { sessionId });
		claude.kill();
		devinClient?.kill();
		if (clientId && connections.get(clientId) === conn)
			connections.delete(clientId);
	};
	conn.bind = (next) => {
		ws = next;
		conn.socket = next;
		next.on("message", onMessage);
		next.on("close", () => {
			if (conn.socket !== next) return;
			conn.socket = null;
			if (clientId) {
				conn.graceTimer = setTimeout(dispose, 60_000);
			} else dispose();
		});
	};
	conn.bind(socket);
});

httpServer.listen(PORT, "127.0.0.1", () => {
	console.log(`figma-agent server: ws://localhost:${PORT}`);
	console.log(`Claude bridge: ${CLAUDE_BRIDGE}`);
});
