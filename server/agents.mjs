// Реестр ACP-агентов, которые пользователь подключил на сервере.
// Файл server/agents.json (рядом с index.mjs) — НЕ через интерфейс плагина:
// запуск произвольной команды по сообщению из WebSocket дал бы выполнение
// кода любому локальному клиенту, поэтому команды задаются только здесь.
//
// {
//   "agents": {
//     "gemini": {
//       "label": "Gemini CLI",
//       "command": "gemini",
//       "args": ["--experimental-acp"],
//       "modelConfigId": "model",          // необязательно
//       "modeId": "ask",                   // необязательно; null — не менять режим
//       "authMethodId": "api-key",         // необязательно, вместе с apiKeyEnv
//       "apiKeyEnv": "GEMINI_API_KEY"      // имя переменной окружения с ключом
//     }
//   }
// }
//
// В интерфейсе такой агент появляется провайдером; id модели — "acp:<имя>:<модель>".
import { existsSync, readFileSync } from "node:fs";

const NAME = /^[a-z0-9][a-z0-9_-]{0,30}$/i;

// Разбирает содержимое agents.json. Некорректные записи пропускает и
// возвращает их причины в errors — сервер пишет их в консоль.
export function parseAgents(json) {
	const agents = new Map();
	const errors = [];
	let data;
	try {
		data = typeof json === "string" ? JSON.parse(json) : json;
	} catch (err) {
		return { agents, errors: [`agents.json: невалидный JSON (${err.message})`] };
	}
	for (const [name, cfg] of Object.entries(data?.agents || {})) {
		if (!NAME.test(name)) {
			errors.push(`агент «${name}»: имя должно быть латиницей/цифрами/-/_`);
			continue;
		}
		if (!cfg || typeof cfg.command !== "string" || !cfg.command.trim()) {
			errors.push(`агент «${name}»: не задан command`);
			continue;
		}
		if (cfg.args !== undefined && !Array.isArray(cfg.args)) {
			errors.push(`агент «${name}»: args должен быть массивом строк`);
			continue;
		}
		agents.set(name.toLowerCase(), {
			name: name.toLowerCase(),
			label: typeof cfg.label === "string" && cfg.label.trim() ? cfg.label.trim() : name,
			command: cfg.command.trim(),
			args: (cfg.args || []).map(String),
			modelConfigId:
				typeof cfg.modelConfigId === "string" ? cfg.modelConfigId : undefined,
			// null — не трогать режим сессии; по умолчанию "ask".
			modeId: cfg.modeId === null ? null : typeof cfg.modeId === "string" ? cfg.modeId : undefined,
			authMethodId: typeof cfg.authMethodId === "string" ? cfg.authMethodId : undefined,
			apiKeyEnv: typeof cfg.apiKeyEnv === "string" ? cfg.apiKeyEnv : undefined,
		});
	}
	return { agents, errors };
}

export function loadAgents(path) {
	if (!existsSync(path)) return { agents: new Map(), errors: [] };
	return parseAgents(readFileSync(path, "utf-8"));
}

// Конфиг для acpGenerate: ключ берём из переменной окружения на лету.
export function agentConfig(agent, env = process.env) {
	const apiKey = agent.apiKeyEnv ? (env[agent.apiKeyEnv] || "").trim() : "";
	return {
		name: agent.name,
		label: agent.label,
		command: agent.command,
		args: agent.args,
		env,
		modeId: agent.modeId,
		modelConfigId: agent.modelConfigId,
		auth: apiKey && agent.authMethodId ? { methodId: agent.authMethodId, apiKey } : undefined,
	};
}

// Разбор id модели: "acp:<агент>:<модель>" -> { agent, model }.
export function parseAcpModel(id) {
	const m = /^acp:([^:]+):(.*)$/.exec(String(id));
	return m ? { agent: m[1].toLowerCase(), model: m[2] } : null;
}
