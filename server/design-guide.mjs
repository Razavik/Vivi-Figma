// Гайд по созданию дизайна для агента: тексты из design-guide/*.md.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "design-guide");
const CORE = ["spec", "craft", "components", "edits"];
const TASTE = ["process", "taste", "typography", "layout", "imagery", "patterns", "anatomy", "shapes", "genres", "trends", "composition"];
export const GUIDE_TOPICS = [...CORE, ...TASTE];

export function guideText(topic) {
	const names = !topic ? ["spec", "edits"] : topic === "all" ? CORE : GUIDE_TOPICS.includes(topic) ? [topic] : null;
	if (!names) return null;
	return names.map((n) => readFileSync(join(dir, `${n}.md`), "utf-8")).join("\n\n");
}
