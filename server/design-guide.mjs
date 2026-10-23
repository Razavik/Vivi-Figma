// Гайд по созданию дизайна для агента: тексты из design-guide/*.md.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "design-guide");
export const GUIDE_TOPICS = ["spec", "craft", "components", "edits"];

export function guideText(topic) {
	const names = !topic ? ["spec", "edits"] : topic === "all" ? GUIDE_TOPICS : GUIDE_TOPICS.includes(topic) ? [topic] : null;
	if (!names) return null;
	return names.map((n) => readFileSync(join(dir, `${n}.md`), "utf-8")).join("\n\n");
}
