// Провайдер Devin: общается с `devin.exe acp` по настоящему ACP.
// Сессия живёт на соединение, рабочая папка пустая, конфиг чистый (без
// правил/MCP/скиллов пользователя — см. CLEAN_DEVIN_CONFIG).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { acpGenerate } from "./acp-agent.mjs";

export function resolveDevinExe() {
	const candidates = [];
	if (process.env.DEVIN_CLI) candidates.push(process.env.DEVIN_CLI);
	if (process.platform === "win32") {
		for (const root of [
			process.env.ProgramFiles,
			process.env["ProgramFiles(x86)"],
			process.env.LOCALAPPDATA
				? join(process.env.LOCALAPPDATA, "Programs")
				: null,
		]) {
			if (root) {
				candidates.push(
					join(
						root,
						"Devin/resources/app/extensions/windsurf/devin/bin/devin.exe",
					),
				);
			}
		}
		candidates.push(
			"D:\\Programs\\Devin\\resources\\app\\extensions\\windsurf\\devin\\bin\\devin.exe",
		);
	} else {
		candidates.push(
			"/opt/devin/resources/app/extensions/windsurf/devin/bin/devin",
			join(process.env.HOME || "", ".local/share/devin/bin/devin"),
		);
	}
	return candidates.find((p) => p && existsSync(p)) || null;
}

// Ключ для authenticate: WINDSURF_API_KEY или credentials.toml профиля Devin.
// Возвращает { key, source }: source "env" — ключ задан явно в окружении
// (authenticate нужен), "creds" — прочитан из credentials.toml (Devin сам
// его подхватит, authenticate можно пропустить и не жечь ~10с на таймаут
// team settings каждый запрос).
function devinApiKey() {
	const fromEnv = (process.env.WINDSURF_API_KEY || "").trim();
	if (fromEnv) return { key: fromEnv, source: "env" };
	const credsPath =
		process.platform === "win32"
			? join(process.env.APPDATA || "", "devin", "credentials.toml")
			: join(
					process.env.HOME || "",
					".config",
					"devin",
					"credentials.toml",
				);
	try {
		const text = readFileSync(credsPath, "utf-8");
		const key = text.match(/windsurf_api_key\s*=\s*"([^"]+)"/)?.[1] || null;
		return key ? { key, source: "creds" } : null;
	} catch {
		return null;
	}
}

// Чистый конфиг Devin для наших сессий: без импорта правил, скиллов и
// MCP-серверов из Windsurf/Claude/Cursor и т. п. Иначе в контекст дизайн-
// агента подмешиваются чужие правила пользователя («не трогай git», «не
// делай билд») и инструменты его MCP. Подменяет только пользовательский
// config.json (через --config), учётные данные Devin остаются прежними.
// Отключить: FIGMA_AGENT_DEVIN_USER_CONFIG=1.
export const CLEAN_DEVIN_CONFIG = {
	version: 1,
	subagents_enabled: false,
	respect_workspace_trust: false,
	read_config_from: {
		agents_standard: false,
		cursor: false,
		windsurf: false,
		claude: false,
		copilot: false,
		opencode: false,
		zed: false,
	},
};

let cleanConfigPath = null;

export function cleanConfigArgs() {
	if (process.env.FIGMA_AGENT_DEVIN_USER_CONFIG === "1") return [];
	try {
		if (!cleanConfigPath) {
			const file = join(tmpdir(), "figma-agent-devin-config.json");
			writeFileSync(file, JSON.stringify(CLEAN_DEVIN_CONFIG, null, 2));
			cleanConfigPath = file;
		}
		return ["--config", cleanConfigPath];
	} catch {
		// Не удалось записать файл — работаем с обычным конфигом
		return [];
	}
}

// Конфиг Devin для универсального ACP-провайдера: `devin acp`, авторизация
// ключом, режим ask. null — Devin CLI не найден.
export function devinConfig() {
	const exe = resolveDevinExe();
	if (!exe) return null;
	const apiKey = devinApiKey();
	return {
		name: "devin",
		label: "Devin",
		command: exe,
		args: [...cleanConfigArgs(), "acp"],
		env: process.env,
		modeId: "ask",
		// authenticate — всегда, когда ключ есть. Строгая политика ACP
		// (срабатывает, когда remote config Devin не отвечает) принимает
		// только креды от хоста и игнорирует credentials.toml — без
		// authenticate сессия там вообще не создаётся.
		auth: apiKey
			? { methodId: "devin-browser", apiKey: apiKey.key }
			: undefined,
	};
}

export function devinGenerate({ model, system, user, images, onChunk }) {
	const config = devinConfig();
	if (!config) {
		return {
			promise: Promise.reject(
				new Error(
					"Devin CLI не найден (ни в PATH, ни в Devin Desktop)",
				),
			),
			cancel: () => {},
		};
	}
	return acpGenerate(config, { model, system, user, images, onChunk });
}

// Разбор вывода `devin models list --format json`: семейства -> варианты.
// model_uid — то, что принимает session/set_config_option; в описание кладём
// семейство и цену, чтобы в списке настроек было видно, что это за модель.
// Цены за 1M токенов из cost_summary («$4 / 1M Input · $0.2 / 1M Cached input · $20 / 1M Output»).
export function parsePrice(summary) {
	const grab = (re) => {
		const m = re.exec(String(summary || ""));
		return m ? Number(m[1]) : undefined;
	};
	const price = {
		input: grab(/\$([\d.]+)\s*\/\s*1M Input/i),
		cached: grab(/\$([\d.]+)\s*\/\s*1M Cached/i),
		output: grab(/\$([\d.]+)\s*\/\s*1M Output/i),
	};
	const clean = Object.fromEntries(
		Object.entries(price).filter(([, v]) => v !== undefined),
	);
	return Object.keys(clean).length ? clean : undefined;
}

// Только «чистые» Sonnet 5 / Opus 5 / Fable 5 (не 5.1, 5.5) через Devin не предлагаем: они есть в мосте Claude.
const HIDDEN_DEVIN_MODEL =
	/\b(?:sonnet|opus|fable)[\s_-]*5(?![.\d]|[\s_-]\d)\b/i;
export function isHiddenDevinFamily(family) {
	const names = [family?.family_label, family?.family_uid, family?.slug];
	if (names.some((n) => HIDDEN_DEVIN_MODEL.test(String(n || "")))) return true;
	const variants = family?.variants || [];
	return (
		variants.length > 0 &&
		variants.every((v) =>
			HIDDEN_DEVIN_MODEL.test(`${v?.model_uid || ""} ${v?.label || ""}`),
		)
	);
}

export function parseDevinModels(json) {
	const out = [];
	const seen = new Set();
	for (const family of json?.families || []) {
		if (isHiddenDevinFamily(family)) continue;
		for (const v of family?.variants || []) {
			const id = v?.model_uid;
			if (typeof id !== "string" || !id || seen.has(id)) continue;
			seen.add(id);
			const flags = [v.is_new ? "новая" : "", v.is_beta ? "beta" : ""]
				.filter(Boolean)
				.join(", ");
			out.push({
				id,
				label: typeof v.label === "string" && v.label ? v.label : id,
				...(Number.isFinite(v.max_context_tokens)
					? { context: v.max_context_tokens }
					: {}),
				// null — в каталоге цены нет, модель бесплатная
				price: parsePrice(v.cost_summary) ?? null,
				description: [family.family_label, v.cost_summary, flags]
					.filter(Boolean)
					.join(" · "),
			});
		}
	}
	return out;
}

// Уровни размышления в порядке возрастания. "default" — у варианта нет
// суффикса уровня (одиночная модель или базовый вариант семейства).
export const THINKING_LEVELS = [
	"none",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
];

const LABEL_LEVELS = [
	[/\bno thinking\b/i, "none"],
	[/\bxhigh\b/i, "xhigh"],
	[/\bmax\b/i, "max"],
	[/\bhigh\b/i, "high"],
	[/\bmedium\b/i, "medium"],
	[/\blow\b/i, "low"],
	[/\bminimal\b/i, "minimal"],
];

// Уровень и Fast-режим варианта: по суффиксам model_uid (…-high, …-high-fast,
// …-medium-priority), а если суффикса нет — по названию («… Max», «… Thinking Fast»).
export function variantTraits(uid, label = "") {
	let rest = String(uid);
	let fast = false;
	if (/-(fast|priority)$/.test(rest)) {
		fast = true;
		rest = rest.replace(/-(fast|priority)$/, "");
	}
	let level = "default";
	const m = rest.match(/-(none|minimal|low|medium|high|xhigh|max)$/);
	if (m) {
		level = m[1];
	} else {
		for (const [re, name] of LABEL_LEVELS) {
			if (re.test(label)) {
				level = name;
				break;
			}
		}
	}
	if (!fast && /\bfast\b/i.test(label)) fast = true;
	return { level, fast };
}

// Семейства моделей: все варианты одного семейства (уровни размышления и
// Fast) объединяются в одну модель. Возвращаются только семейства, где есть
// из чего выбирать (больше одной комбинации уровень/Fast).
export function parseDevinFamilies(json) {
	const out = [];
	for (const family of json?.families || []) {
		if (isHiddenDevinFamily(family)) continue;
		const variants = [];
		const seen = new Set();
		const price = (family?.variants || [])
			.map((v) => parsePrice(v?.cost_summary))
			.find(Boolean);
		const context = (family?.variants || []).find((v) =>
			Number.isFinite(v?.max_context_tokens),
		)?.max_context_tokens;
		for (const v of family?.variants || []) {
			const id = v?.model_uid;
			if (typeof id !== "string" || !id) continue;
			const { level, fast } = variantTraits(id, v.label || "");
			const key = `${level}|${fast}`;
			if (seen.has(key)) continue;
			seen.add(key);
			variants.push({
				id,
				level,
				fast,
				label: typeof v.label === "string" && v.label ? v.label : id,
				// Цена варианта; null — в каталоге цены нет, вариант бесплатный
				price: parsePrice(v.cost_summary) ?? null,
			});
		}
		const familyId = family?.family_uid || family?.slug;
		if (variants.length > 1 && typeof familyId === "string" && familyId) {
			out.push({
				id: familyId,
				label: family.family_label || familyId,
				context,
				...(price ? { price } : {}),
				variants,
			});
		}
	}
	return out;
}

// Lightning-варианты (swe-2-high-lightning) лежат в каталоге отдельными
// моделями вне семейства: присоединяем их как Fast-вариант своего уровня.
export function attachLightning(models, families) {
	for (const m of models) {
		const hit =
			/^(.+)-(none|minimal|low|medium|high|xhigh|max)-lightning$/.exec(
				m.id,
			);
		if (!hit) continue;
		const [, base, level] = hit;
		const family = families.find((f) =>
			f.variants.some((v) => v.id === `${base}-${level}`),
		);
		if (!family || family.variants.some((v) => v.id === m.id)) continue;
		family.variants.push({
			id: m.id,
			level,
			fast: true,
			label: m.label || m.id,
			price: m.price ?? null,
		});
	}
	return families;
}

// Полный список моделей аккаунта: команда `devin models list --format json`.
// ACP-сессия отдаёт только текущую модель, поэтому основной источник — CLI.
export function devinModelsFromCli(timeoutMs = 60000) {
	const exe = resolveDevinExe();
	if (!exe) {
		return Promise.reject(
			new Error("Devin CLI не найден (ни в PATH, ни в Devin Desktop)"),
		);
	}
	return new Promise((resolve, reject) => {
		execFile(
			exe,
			["models", "list", "--format", "json"],
			{
				timeout: timeoutMs,
				maxBuffer: 20 * 1024 * 1024,
				windowsHide: true,
			},
			(err, stdout) => {
				if (err)
					return reject(
						new Error(`devin models list: ${err.message}`),
					);
				// Логи CLI идут в stderr, но на всякий случай берём JSON с первой «{».
				const start = stdout.indexOf("{");
				try {
					const json = JSON.parse(stdout.slice(start));
					const models = parseDevinModels(json);
					if (!models.length) throw new Error("пустой список");
					resolve({
						models,
						families: attachLightning(
							models,
							parseDevinFamilies(json),
						),
					});
				} catch (e) {
					reject(
						new Error(
							`devin models list: не удалось разобрать ответ (${e.message})`,
						),
					);
				}
			},
		);
	});
}
