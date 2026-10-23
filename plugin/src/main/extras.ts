// Для сериализатора: что видит внешний агент в аннотациях ноды.
export function extrasOf(node: SceneNode): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if ("annotations" in node) {
		const open = node.annotations.filter((a) => a.label).map((a) => String(a.label).slice(0, 120));
		if (open.length) out.annotations = open.slice(0, 5);
	}
	return out;
}
