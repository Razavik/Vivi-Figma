import { timingSafeEqual } from "node:crypto";

export const MAX_PAYLOAD = 48 * 1024 * 1024;
export const MAX_AGENT_TEXT = 1_500_000;

export function sanitizeUserFiles(list) {
	if (!Array.isArray(list)) return [];
	return list
		.filter(
			(file) =>
				file &&
				typeof file.name === "string" &&
				file.name.length <= 200 &&
				typeof file.data === "string" &&
				file.data.length <= 14_000_000 &&
				typeof file.mimeType === "string",
		)
		.slice(0, 8)
		.map(({ name, data, mimeType }) => ({ name, data, mimeType }));
}

// Скриншоты из плагина: только PNG/JPEG, у каждого data-строка и необязательная подпись.
export function sanitizeImages(list, max = 8) {
	if (!Array.isArray(list)) return [];
	// Рендеры inspect приходят без mimeType — это PNG.
	const mimeOf = (img) => img.mimeType || "image/png";
	return list
		.filter(
			(img) =>
				img &&
				typeof img.data === "string" &&
				img.data.length > 0 &&
				img.data.length < 8_000_000 &&
				["image/png", "image/jpeg"].includes(mimeOf(img)),
		)
		.slice(0, max)
		.map((img) => ({
			data: img.data,
			mimeType: mimeOf(img),
			...(typeof img.label === "string" && img.label
				? { label: img.label.slice(0, 160) }
				: {}),
		}));
}

export function checkToken(urlString, expected) {
	if (!expected) return true;
	try {
		const token =
			new URL(urlString, "ws://localhost").searchParams.get("token") ||
			"";
		const actualBuffer = Buffer.from(token);
		const expectedBuffer = Buffer.from(expected);
		return (
			actualBuffer.length === expectedBuffer.length &&
			timingSafeEqual(actualBuffer, expectedBuffer)
		);
	} catch {
		return false;
	}
}
