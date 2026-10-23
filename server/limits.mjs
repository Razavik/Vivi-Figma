import { timingSafeEqual } from "node:crypto";

// Предел размера сообщения (ответы плагина с картинками бывают крупными).
export const MAX_PAYLOAD = 48 * 1024 * 1024;

// Токен моста из ?token=… сравнивается с ожидаемым за постоянное время;
// без ожидаемого токена принимаются все.
export function checkToken(urlString, expected) {
	if (!expected) return true;
	try {
		const token = new URL(urlString, "ws://localhost").searchParams.get("token") || "";
		const actual = Buffer.from(token);
		const wanted = Buffer.from(expected);
		return actual.length === wanted.length && timingSafeEqual(actual, wanted);
	} catch {
		return false;
	}
}
