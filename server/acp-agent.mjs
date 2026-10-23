// Универсальный ACP-провайдер: одноразовый процесс агента на запрос.
//   процесс -> initialize -> [authenticate] -> session/new -> [set_mode]
//   -> [set_config_option(model)] -> session/prompt -> текст ответа.
// Devin и любые агенты из agents.json идут через эту функцию; различаются
// только конфигом (команда, аргументы, способ авторизации).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NdJsonClient } from "./acp-client.mjs";

// Таймаут молчания, а не всего ответа: каждый чанк/мысль его перезапускает
// (resetOnActivity). Длинная генерация со стримом может идти сколько угодно,
// зависший агент отваливается через 5 минут без сигналов.
const REQUEST_TIMEOUT_MS = 300_000;

// config: {
//   name,                 — для сообщений об ошибках и имени временной папки
//   command, args,        — как запускать агента
//   env?,                 — переменные окружения (по умолчанию process.env)
//   auth?: { methodId, apiKey },   — если нужен authenticate
//   modeId?,              — режим сессии ("ask": только ответы без инструментов)
//   modelConfigId?,       — id опции выбора модели (по умолчанию "model")
// }
// Возвращает { promise, cancel }: cancel шлёт session/cancel и убивает процесс.
export function acpGenerate(config, { model, system, user, images, onChunk }) {
	const workdir = mkdtempSync(
		join(tmpdir(), `figma-agent-${config.name || "acp"}-`),
	);
	let client;
	try {
		client = new NdJsonClient(config.command, config.args || [], {
			cwd: workdir,
			env: config.env || process.env,
		});
	} catch (err) {
		return {
			promise: Promise.reject(err),
			cancel: () => {},
		};
	}
	let sessionId = null;
	let text = "";
	let spawnError = null;
	client.proc.on("error", (err) => {
		spawnError = err;
	});
	client.onSessionUpdate = (_sid, chunk, isThought) => {
		// Мысли не входят в итоговый текст ответа — только показываем клиенту.
		if (isThought) {
			onChunk?.(chunk, true);
			return;
		}
		text += chunk;
		onChunk?.(chunk, false);
	};

	const label = config.label || config.name || "ACP-агент";
	const promise = (async () => {
		try {
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
				// Authenticate нефатален: упал по сети — у агента могут быть
				// сохранённые креды (Devin: credentials.toml), пробуем дальше.
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
							`${config.name}: authenticate не удался (${String(err?.message || err)}) — пробуем сохранённые креды`,
						),
					);
			}
			const session = await client.request(
				"session/new",
				{ cwd: workdir, mcpServers: [], mode: config.modeId || "ask" },
				30_000,
			);
			sessionId = session.sessionId;
			// Режим без инструментов: модель только отвечает текстом.
			if (config.modeId !== null) {
				await client
					.request(
						"session/set_mode",
						{ sessionId, modeId: config.modeId || "ask" },
						15_000,
					)
					.catch(() => {});
			}
			if (model) {
				await client
					.request(
						"session/set_config_option",
						{
							sessionId,
							configId: config.modelConfigId || "model",
							value: model,
						},
						15_000,
					)
					.catch(() => {});
			}
			// Скриншоты и картинки пользователя идут отдельными image-блоками.
			const prompt = [
				{ type: "text", text: system },
				{ type: "text", text: user },
				...(images || []).map((img) => ({
					type: "image",
					data: img.data,
					mimeType: img.mimeType || "image/png",
				})),
			];
			const res = await client.request(
				"session/prompt",
				{ sessionId, prompt },
				REQUEST_TIMEOUT_MS,
				{ resetOnActivity: true },
			);
			// Пишем, что вернул агент помимо текста: если там есть
			// usage/cached токены — видно, работает ли кэш ввода.
			const meta = Object.fromEntries(
				Object.entries(res || {}).filter(
					([k, v]) => v !== undefined && v !== null,
				),
			);
			if (Object.keys(meta).length)
				console.log(`${label} prompt result:`, JSON.stringify(meta));
			if (!text) throw new Error(`${label} вернул пустой ответ`);
			return { text };
		} catch (err) {
			if (spawnError) {
				throw new Error(
					`${label}: не удалось запустить «${config.command}» (${spawnError.message})`,
				);
			}
			throw err;
		} finally {
			client.kill();
		}
	})();

	return {
		promise,
		cancel() {
			if (sessionId) client.notify("session/cancel", { sessionId });
			client.kill();
		},
	};
}

// Модели из ответа session/new. Протокол допускает два варианта: список
// session.models.availableModels и опция выбора модели в session.configOptions
// (значения могут быть сгруппированы). Агент может не отдавать ничего — тогда [].
export function modelsFromSession(session) {
	const out = [];
	const seen = new Set();
	const add = (id, label, description) => {
		if (typeof id !== "string" || !id || seen.has(id)) return;
		seen.add(id);
		out.push({
			id,
			label:
				typeof label === "string" && label.trim() ? label.trim() : id,
			description: typeof description === "string" ? description : "",
		});
	};
	for (const m of session?.models?.availableModels || []) {
		add(m?.modelId ?? m?.id, m?.name, m?.description);
	}
	for (const opt of session?.configOptions || []) {
		if (opt?.id !== "model" && opt?.category !== "model") continue;
		for (const entry of opt.options || []) {
			// Группа: { group/name, options: [...] }; обычное значение: { value, name }.
			if (Array.isArray(entry?.options)) {
				for (const inner of entry.options)
					add(inner?.value, inner?.name, inner?.description);
			} else {
				add(entry?.value, entry?.name, entry?.description);
			}
		}
	}
	return out;
}

// Запрашивает у агента список моделей: процесс -> initialize -> [authenticate]
// -> session/new -> читаем модели -> процесс закрывается. Запрос модели не
// отправляется.
export async function acpListModels(config) {
	const workdir = mkdtempSync(
		join(tmpdir(), `figma-agent-${config.name || "acp"}-`),
	);
	const client = new NdJsonClient(config.command, config.args || [], {
		cwd: workdir,
		env: config.env || process.env,
	});
	let spawnError = null;
	client.proc.on("error", (err) => {
		spawnError = err;
	});
	try {
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
			// Как и в acpGenerate: падение authenticate не блокирует —
			// у агента могут быть сохранённые креды.
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
						`${config.name}: authenticate не удался (${String(err?.message || err)}) — пробуем сохранённые креды`,
					),
				);
		}
		const session = await client.request(
			"session/new",
			{ cwd: workdir, mcpServers: [], mode: config.modeId || "ask" },
			30_000,
		);
		if (process.env.FIGMA_AGENT_DEBUG_ACP) {
			const shape = (v) =>
				Array.isArray(v)
					? `array(${v.length})`
					: v && typeof v === "object"
						? Object.keys(v)
						: typeof v;
			console.error(
				"[acp debug]",
				config.name,
				"session/new:",
				JSON.stringify({
					keys: shape(session),
					models: shape(session?.models),
					configOptions: (session?.configOptions || []).map((o) => ({
						id: o?.id,
						category: o?.category,
						options: Array.isArray(o?.options)
							? o.options.length
							: shape(o?.options),
					})),
				}),
			);
		}
		return modelsFromSession(session);
	} catch (err) {
		if (spawnError) {
			throw new Error(
				`${config.label || config.name}: не удалось запустить «${config.command}» (${spawnError.message})`,
			);
		}
		throw err;
	} finally {
		client.kill();
	}
}
