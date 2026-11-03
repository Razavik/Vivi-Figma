// Smoke-проверка перед publish: пакет собирается, в нём всё на месте,
// MCP поднимается и отвечает. Должна поймать «опубликован битый пакет» (как 0.4.3).
// Запуск: node scripts/smoke.mjs
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (msg) => {
	console.error("smoke: " + msg);
	process.exit(1);
};
const note = (msg) => console.log("smoke: " + msg);

// 1. Синтаксис всех серверных модулей.
for (const f of readdirSync(join(ROOT, "server")).filter((f) => f.endsWith(".mjs"))) {
	const r = spawnSync(process.execPath, ["--check", join(ROOT, "server", f)]);
	if (r.status !== 0) fail(`server/${f}: ${String(r.stderr).slice(0, 200)}`);
}
note("синтаксис server/*.mjs ок");

// 2. Пакет: собрать, распаковать в temp, поставить зависимости.
const tmp = mkdtempSync(join(tmpdir(), "vivi-smoke-"));
try {
	// Внутри publish-lifecycle npm передаёт свои флаги вниз через env (npm_config_*):
	// dry-run от publish делал бы вложенный pack/install пустышкой. Снимаем их.
	const env = { ...process.env };
	for (const k of Object.keys(env)) if (k.startsWith("npm_config_") || k.startsWith("npm_lifecycle_")) delete env[k];
	execFileSync("npm", ["pack", "--pack-destination", tmp], { cwd: ROOT, stdio: "pipe", shell: true, env });
	const tgz = readdirSync(tmp).find((f) => f.endsWith(".tgz"));
	if (!tgz) fail(`npm pack не дал tgz (tmp: ${readdirSync(tmp).join(",")})`);
	// bsdtar на Windows не любит обратные слэши и «C:» — пути с прямыми слэшами
	const posix = (p) => p.replaceAll("\\", "/");
	execFileSync("tar", ["--force-local", "-xzf", posix(join(tmp, tgz)), "-C", posix(tmp)], { stdio: "pipe" });
	const pkg = join(tmp, "package");
	for (const need of ["server/mcp.mjs", "server/cli.mjs", "server/design-guide/spec.md", "plugin/dist/code.js", "plugin/dist/ui.html", "plugin/dist/build-id.txt", "server/icons/lucide.json"])
		if (!existsSync(join(pkg, need))) fail(`в пакете нет ${need}`);
	note("состав пакета ок");

	execFileSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund"], { cwd: pkg, stdio: "pipe", shell: true, env });
	note("зависимости пакета поставлены");

	// 3. Список инструментов из распакованного пакета.
	const { MCP_TOOL_NAMES } = await import(join(pkg, "server", "mcp-tools.mjs").replaceAll("\\", "/").replace(/^([a-zA-Z]:)/, "file:///$1"));
	if (!Array.isArray(MCP_TOOL_NAMES) || MCP_TOOL_NAMES.length < 15) fail("MCP_TOOL_NAMES не читается или короткий");
	note(`инструментов: ${MCP_TOOL_NAMES.length}`);

	// 4. MCP по stdio: initialize → tools/list → локальные вызовы.
	const probe = `
import { createRequire } from "node:module";
const require = createRequire(${JSON.stringify(join(pkg, "server/") + "/")});
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const t = new StdioClientTransport({ command: process.execPath, args: [${JSON.stringify(join(pkg, "server", "mcp.mjs"))}], cwd: ${JSON.stringify(pkg)}, env: { ...process.env, MCP_NO_AUTOSTART: "1" }, stderr: "pipe" });
const c = new Client({ name: "smoke", version: "1" });
await c.connect(t);
const tools = await c.listTools();
const names = tools.tools.map((x) => x.name).sort();
if (!names.includes("figma_create") || !names.includes("figma_variants") || !names.includes("figma_review")) { console.error("нет части инструментов: " + names.join(",")); process.exit(1); }
for (const [tool, args] of [["figma_schema", { name: "shapes" }], ["figma_icons", { query: "heart" }], ["figma_guide", { topic: "spec" }]]) {
	const r = await c.callTool({ name: tool, arguments: args }, undefined, { timeout: 30000 });
	if (r.isError) { console.error(tool + " упал: " + r.content?.[0]?.text?.slice(0, 150)); process.exit(1); }
}
// плагин опционален: нет его — предупреждение, не падение
const st = await c.callTool({ name: "figma_status", arguments: {} }, undefined, { timeout: 15000 });
console.log(st.isError ? "PLUGIN:off" : "PLUGIN:on");
await c.close();
`;
	const r = spawnSync(process.execPath, ["--input-type=module", "-e", probe], { stdio: "pipe", timeout: 120000 });
	if (r.status !== 0) fail(`MCP-прогон: ${String(r.stderr).slice(0, 300)}`);
	note(String(r.stdout).trim() === "PLUGIN:on" ? "плагин подключён, всё ок" : "плагин не подключён (ок: write-инструменты не проверялись)");
	note("smoke: ок");
} finally {
	rmSync(tmp, { recursive: true, force: true });
}
