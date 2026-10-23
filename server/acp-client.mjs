// Общий клиент newline-delimited JSON-RPC поверх stdio для ACP-совместимых агентов.
// Используется и для Claude-моста (node index.mjs), и для Devin (devin.exe acp).
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export class NdJsonClient {
	constructor(command, args, options = {}) {
		this.proc = spawn(command, args, {
			stdio: ["pipe", "pipe", "inherit"],
			...options,
		});
		this.nextId = 1;
		this.pending = new Map();
		this.onSessionUpdate = null; // (sessionId, textChunk) => void
		this.lines = createInterface({ input: this.proc.stdout });
		this.lines.on("line", (line) => this.handleLine(line));
		this.proc.on("exit", () => {
			for (const { reject } of this.pending.values()) {
				reject(new Error(`${command} exited`));
			}
			this.pending.clear();
		});
		// Без слушателей любая ошибка процесса/потоков роняет весь сервер:
		// запись в stdin уже мёртвого ребёнка приходит асинхронным EPIPE,
		// try/catch вокруг write его не ловит. "exit" выше и так реджектит
		// висячие запросы — здесь просто не даём событию стать uncaught.
		this.proc.on("error", () => {});
		this.proc.stdin.on("error", () => {});
		this.proc.stdout.on("error", () => {});
	}

	handleLine(line) {
		if (!line.trim()) return;
		let message;
		try {
			message = JSON.parse(line);
		} catch {
			return;
		}
		// Ответ на наш запрос
		if (
			message.id !== undefined &&
			(message.result !== undefined || message.error !== undefined) &&
			this.pending.has(message.id)
		) {
			const { resolve, reject } = this.pending.get(message.id);
			this.pending.delete(message.id);
			if (message.error)
				reject(new Error(message.error.message || "ACP error"));
			else resolve(message.result);
			return;
		}
		// Стрим чанков ответа агента (и reasoning-чанков, если агент их шлёт)
		if (message.method === "session/update") {
			// Любой апдейт — признак жизни: перезапускаем таймауты молчания.
			this.touch();
			const update = message.params?.update;
			const kind = update?.sessionUpdate;
			if (
				(kind === "agent_message_chunk" ||
					kind === "agent_message" ||
					kind === "agent_thought_chunk") &&
				update.content?.type === "text" &&
				typeof update.content.text === "string" &&
				this.onSessionUpdate
			) {
				this.onSessionUpdate(
					message.params.sessionId,
					update.content.text,
					kind === "agent_thought_chunk",
				);
			}
			return;
		}
		// Запрос от агента к клиенту (fs/*, session/request_permission и т.п.):
		// мы ничего не разрешаем — отвечаем ошибкой, чтобы агент не завис.
		if (message.method && message.id !== undefined) {
			this.notifyResponse(message.id);
		}
	}

	notifyResponse(id) {
		try {
			this.proc.stdin.write(
				JSON.stringify({
					jsonrpc: "2.0",
					id,
					error: {
						code: -32000,
						message: "Permission denied by FigmaAgent host",
					},
				}) + "\n",
			);
		} catch {
			/* процесс уже умер */
		}
	}

	request(method, params, timeoutMs = 0, opts = {}) {
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const entry = { id, method, timeoutMs, timer: null };
			// resetOnActivity — таймаут молчания: каждый session/update
			// (см. touch) перезапускает отсчёт. Так длинная генерация со
			// стримом живёт, а зависший агент всё равно отваливается.
			entry.resetOnActivity = !!opts.resetOnActivity;
			const arm = () => {
				if (timeoutMs <= 0) return;
				entry.timer = setTimeout(() => {
					this.pending.delete(id);
					reject(new Error(`ACP request timed out: ${method}`));
				}, timeoutMs);
			};
			entry.resolve = (v) => {
				if (entry.timer) clearTimeout(entry.timer);
				resolve(v);
			};
			entry.reject = (e) => {
				if (entry.timer) clearTimeout(entry.timer);
				reject(e);
			};
			this.pending.set(id, entry);
			arm();
			this.proc.stdin.write(
				JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
			);
		});
	}

	// Агент что-то прислал (чанк/мысль) — живой. Перезапускаем таймауты
	// запросов с resetOnActivity. Здесь один pending на процесс, поэтому
	// маппить активность на конкретный запрос не нужно.
	touch() {
		for (const entry of this.pending.values()) {
			if (!entry.resetOnActivity || !entry.timer) continue;
			clearTimeout(entry.timer);
			entry.timer = setTimeout(() => {
				this.pending.delete(entry.id);
				entry.reject(
					new Error(`ACP request timed out: ${entry.method}`),
				);
			}, entry.timeoutMs);
		}
	}

	notify(method, params) {
		try {
			this.proc.stdin.write(
				JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n",
			);
		} catch {
			/* процесс уже умер */
		}
	}

	kill() {
		try {
			this.proc.kill();
		} catch {
			/* уже мёртв */
		}
	}
}
