import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const BRIDGE_PROTOCOL = "vivi-bridge-v1";
const TOKEN_FORMAT = /^[a-f0-9]{64}$/;

export function bridgeTokenPath(port) {
	return join(homedir(), ".vivi-figma", `bridge-${port}.token`);
}

export function createBridgeToken(port) {
	const token = randomBytes(32).toString("hex");
	mkdirSync(join(homedir(), ".vivi-figma"), { recursive: true, mode: 0o700 });
	const path = bridgeTokenPath(port);
	const temporary = `${path}.${process.pid}.tmp`;
	writeFileSync(temporary, token, { flag: "wx", mode: 0o600 });
	try {
		renameSync(temporary, path);
	} finally {
		rmSync(temporary, { force: true });
	}
	return token;
}

export function readBridgeToken(port) {
	const token = readFileSync(bridgeTokenPath(port), "utf8");
	if (!TOKEN_FORMAT.test(token)) throw new Error("Invalid Vivi bridge pairing code");
	return token;
}

export function bridgeRole(request, port, token) {
	const { host, origin, "sec-websocket-protocol": offered } = request.headers;
	if (host !== `localhost:${port}` && host !== `127.0.0.1:${port}`) return;
	const url = new URL(request.url || "/", "http://localhost");
	if (url.pathname !== "/") return;
	const role = url.searchParams.get("role") ?? "plugin";
	if (role !== "plugin" && role !== "mcp") return;
	if (role === "mcp" && origin !== undefined) return;
	const protocols = typeof offered === "string" ? offered.split(",").map((value) => value.trim()) : [];
	const [credential, protocol] = protocols;
	if (protocols.length !== 2 || protocol !== BRIDGE_PROTOCOL || !TOKEN_FORMAT.test(credential)) return;
	if (token && timingSafeEqual(Buffer.from(credential), Buffer.from(token))) return role;
}
