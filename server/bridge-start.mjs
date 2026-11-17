// Общий фоновый запуск для CLI и MCP: отдельный процесс без окна, проверка
// готовности и лог в постоянной папке пользователя (вне кэша npx).
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { get } from "node:http";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));

export function inspectBridge(port, timeout = 500) {
	return new Promise((resolve) => {
		const request = get({ hostname: "127.0.0.1", port, path: "/health", timeout }, (res) => {
			let text = "";
			res.setEncoding("utf8");
			res.on("data", (chunk) => {
				text += chunk;
				if (text.length > 4096) { res.destroy(); resolve({ state: "other" }); }
			});
			res.on("end", () => {
				try {
					const data = JSON.parse(text);
					if (res.statusCode === 200 && data.service === "vivi-figma-bridge") return resolve({ state: "ready", ...data });
				} catch { /* старый мост отвечает текстом */ }
				if (res.statusCode === 426 && text.startsWith("Vivi MCP bridge:")) return resolve({ state: "ready", legacy: true });
				resolve({ state: "other" });
			});
			res.on("error", () => resolve({ state: "other" }));
		});
		request.on("timeout", () => { request.destroy(); resolve({ state: "other" }); });
		request.on("error", (err) => resolve({ state: err.code === "ECONNREFUSED" ? "absent" : "other" }));
	});
}

export async function ensureBridge({ env = process.env, serverDir = SERVER_DIR, logDir = join(homedir(), ".vivi-figma"), startupTimeout = 15_000 } = {}) {
	const bridgeEnv = { ...env };
	try {
		for (const line of readFileSync(join(serverDir, ".env"), "utf8").split(/\r?\n/)) {
			const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
			if (m && !(m[1] in bridgeEnv)) bridgeEnv[m[1]] = m[2].replace(/^["']|["']$/g, "");
		}
	} catch { /* .env необязателен */ }
	const port = Number(bridgeEnv.PORT || 8787);
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT должен быть целым числом от 1 до 65535");
	const logFile = join(logDir, "bridge.log");
	const before = await inspectBridge(port);
	if (before.state === "ready") return { ...before, started: false, port, logFile };
	if (before.state === "other") throw new Error(`Порт ${port} занят другой программой или мост не отвечает. Освободите порт и повторите запуск.`);
	mkdirSync(logDir, { recursive: true });
	const fd = openSync(logFile, "a");
	let child;
	try {
		child = spawn(process.execPath, [join(serverDir, "index.mjs")], { cwd: serverDir, env: bridgeEnv, detached: true, windowsHide: true, stdio: ["ignore", fd, fd] });
	} finally { closeSync(fd); }
	let failure;
	let exited = false;
	child.on("error", (err) => { failure = err; });
	child.on("exit", () => { exited = true; });
	child.unref();
	const deadline = Date.now() + startupTimeout;
	do {
		const status = await inspectBridge(port);
		if (status.state === "ready") return { ...status, started: status.pid === child.pid, port, logFile };
		if (failure || exited) break;
		await new Promise((r) => setTimeout(r, 150));
	} while (Date.now() < deadline);
	// Завершаем только процесс этого запуска, если он так и не стал готов.
	if (!exited) child.kill();
	throw new Error(`Не удалось запустить мост${failure ? `: ${failure.message}` : ""}. Лог: ${logFile}`);
}
