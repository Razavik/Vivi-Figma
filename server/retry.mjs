export const RETRY_DELAYS = [5_000, 15_000, 30_000];

const TRANSIENT =
	/\b(529|503|502|504|429)\b|overloaded|rate.?limit|too many requests|timed? ?out|таймаут|ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|feature not available in your country|service unavailable|internal server error/i;

export function isTransientError(err) {
	return TRANSIENT.test(String(err?.message || err));
}

export function isTransientReply(text) {
	const reply = String(text || "").trim();
	return reply.length < 400 && !reply.includes("{") && TRANSIENT.test(reply);
}
