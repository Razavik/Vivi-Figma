import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { query } from "@anthropic-ai/claude-agent-sdk";

const sessions = new Map();
const input = createInterface({ input: process.stdin, terminal: false });

function send(message) {
	process.stdout.write(JSON.stringify(message) + "\n");
}

function sendResult(id, result) {
	send({ jsonrpc: "2.0", id, result });
}

function sendError(id, message) {
	send({ jsonrpc: "2.0", id, error: { code: -32000, message } });
}

function update(sessionId, text, thought = false) {
	send({
		jsonrpc: "2.0",
		method: "session/update",
		params: {
			sessionId,
			update: {
				sessionUpdate: thought
					? "agent_thought_chunk"
					: "agent_message_chunk",
				content: { type: "text", text },
			},
		},
	});
}

async function promptSession(id, params, session) {
	const prompt = params?.prompt;
	if (
		!Array.isArray(prompt) ||
		prompt.length < 2 ||
		prompt[0]?.type !== "text" ||
		typeof prompt[0].text !== "string"
	) {
		sendError(id, "Claude bridge requires a text system block first");
		return;
	}
	if (session.query) {
		sendError(id, "Claude session is busy");
		return;
	}
	const systemText = prompt[0].text;
	// Остальные блоки — контент юзера: текст и ACP image-блоки
	// ({type:"image", data: base64, mimeType}) конвертируем в формат
	// Anthropic ({type:"image", source:{type:"base64", ...}}).
	const userContent = [];
	for (const block of prompt.slice(1)) {
		if (block?.type === "text" && typeof block.text === "string") {
			userContent.push({ type: "text", text: block.text });
		} else if (block?.type === "image" && typeof block.data === "string") {
			userContent.push({
				type: "image",
				source: {
					type: "base64",
					media_type: block.mimeType || "image/png",
					data: block.data,
				},
			});
		}
	}
	if (!userContent.length) {
		sendError(id, "Claude bridge requires user content");
		return;
	}
	let answer = "";
	let usage = null;
	let costUsd = null;
	const userPrompt = async function* () {
		yield {
			type: "user",
			message: {
				role: "user",
				content: userContent,
			},
			parent_tool_use_id: null,
		};
	};
	try {
		const runningQuery = query({
			prompt: userPrompt(),
			options: {
				systemPrompt: systemText,
				model: session.model,
				// Дизайн генерируется только из промпта — инструменты не нужны.
				tools: [],
				allowedTools: [],
				canUseTool: async () => ({
					behavior: "deny",
					message: "Инструменты недоступны",
				}),
				permissionMode: "dontAsk",
				settingSources: [],
				cwd: session.cwd,
				env: process.env,
				// Без display:"summarized" thinking-блоки приходят пустыми.
				thinking: { type: "adaptive", display: "summarized" },
				// Дизайн-задачи не требуют глубоких рассуждений: «high» по умолчанию
				// раздувает размышления. Меняется через FIGMA_AGENT_EFFORT.
				effort: ["low", "medium", "high", "xhigh", "max"].includes(
					session.effort ?? process.env.FIGMA_AGENT_EFFORT,
				)
					? (session.effort ?? process.env.FIGMA_AGENT_EFFORT)
					: "medium",
				// Fast-режим включается только по запросу пользователя
				...(session.fast ? { settings: { fastMode: true } } : {}),
				includePartialMessages: true,
			},
		});
		session.query = runningQuery;
		for await (const message of runningQuery) {
			if (message.type === "stream_event") {
				const delta = message.event?.delta;
				if (
					delta?.type === "text_delta" &&
					typeof delta.text === "string" &&
					delta.text
				) {
					answer += delta.text;
					update(params.sessionId, delta.text);
				} else if (
					delta?.type === "thinking_delta" &&
					typeof delta.thinking === "string" &&
					delta.thinking
				) {
					// Размышления — только показываем, в итоговый ответ не входят.
					update(params.sessionId, delta.thinking, true);
				}
				continue;
			}
			if (
				message.type === "assistant" &&
				Array.isArray(message.message?.content)
			) {
				for (const block of message.message.content) {
					if (
						block.type === "text" &&
						typeof block.text === "string" &&
						block.text.length > answer.length
					) {
						const chunk = block.text.startsWith(answer)
							? block.text.slice(answer.length)
							: block.text;
						answer = block.text;
						if (chunk) update(params.sessionId, chunk);
					}
				}
			}
			if (message.type === "result") {
				if (message.ok === false || message.is_error === true) {
					const reason =
						typeof message.result === "string"
							? message.result
							: Array.isArray(message.errors)
								? message.errors.join("; ")
								: message.subtype || "";
					sendError(
						id,
						reason
							? `Claude provider failed: ${reason}`.slice(0, 500)
							: "Claude provider failed",
					);
					return;
				}
				usage = message.usage || null;
				costUsd =
					typeof message.total_cost_usd === "number"
						? message.total_cost_usd
						: null;
			}
		}
		sendResult(id, {
			stopReason: "end_turn",
			usage: {
				inputTokens: usage?.input_tokens || 0,
				outputTokens: usage?.output_tokens || 0,
				cachedReadTokens: usage?.cache_read_input_tokens || 0,
				cachedWriteTokens: usage?.cache_creation_input_tokens || 0,
			},
			...(costUsd !== null ? { costUsd } : {}),
		});
	} catch (err) {
		const reason = String(err?.message || err || "");
		sendError(
			id,
			reason
				? `Claude provider failed: ${reason}`.slice(0, 500)
				: "Claude provider failed",
		);
	} finally {
		session.query = null;
	}
}

// Список моделей, доступных этому Claude (с учётом ключа/прокси). Поток ввода
// пустой — сообщение модели не отправляется, SDK только отдаёт свой список.
async function listModels() {
	const idle = (async function* () {
		await new Promise(() => {});
	})();
	const q = query({
		prompt: idle,
		options: {
			tools: [],
			settingSources: [],
			env: process.env,
			cwd: process.cwd(),
		},
	});
	const timeout = new Promise((_, reject) =>
		setTimeout(() => reject(new Error("таймаут списка моделей")), 30000),
	);
	try {
		const models = await Promise.race([q.supportedModels(), timeout]);
		return models.map((m) => ({
			value: String(m.value),
			displayName: String(m.displayName || m.value),
			description: typeof m.description === "string" ? m.description : "",
			supportsFastMode: m.supportsFastMode === true,
			supportedEffortLevels: Array.isArray(m.supportedEffortLevels) ? m.supportedEffortLevels : undefined,
		}));
	} finally {
		try {
			q.close();
		} catch {
			/* уже закрыт */
		}
	}
}

async function handle(message) {
	const { id, method, params } = message;
	if (method === "initialize") {
		sendResult(id, {
			protocolVersion: 1,
			agentCapabilities: {
				promptCapabilities: { image: true, embeddedContext: false },
			},
			authMethods: [],
			agentInfo: {
				name: "figma-agent-claude-bridge",
				title: "Claude",
				version: "0.1.0",
			},
		});
		return;
	}
	if (method === "models/list") {
		try {
			sendResult(id, { models: await listModels() });
		} catch (err) {
			sendError(id, String(err?.message || err));
		}
		return;
	}
	if (method === "session/new") {
		if (
			typeof params?.cwd !== "string" ||
			typeof params?.model !== "string" ||
			!params.model
		) {
			sendError(id, "Claude session configuration is invalid");
			return;
		}
		const sessionId = randomUUID();
		sessions.set(sessionId, {
			cwd: params.cwd,
			model: params.model,
			effort: params.effort,
			fast: params.fast === true,
			query: null,
		});
		sendResult(id, { sessionId });
		return;
	}
	if (method === "session/prompt") {
		const session = sessions.get(params?.sessionId);
		if (!session) {
			sendError(id, "Claude session is unavailable");
			return;
		}
		await promptSession(id, params, session);
		return;
	}
	if (method === "session/cancel") {
		const session = sessions.get(params?.sessionId);
		if (session?.query) {
			try {
				await session.query.interrupt();
				session.query.close();
			} catch {
				session.query.close();
			}
		}
		if (id !== undefined) sendResult(id, {});
		return;
	}
	if (id !== undefined) sendError(id, "Method is unavailable");
}

input.on("line", (line) => {
	if (!line.trim()) return;
	let message;
	try {
		message = JSON.parse(line);
	} catch {
		return;
	}
	if (message && typeof message === "object") void handle(message);
});
