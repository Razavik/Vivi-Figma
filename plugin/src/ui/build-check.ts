// Сверка версий плагина и моста (см. build-id.mjs).
export const PROTOCOL = 1;

// Текст проблемы или "" — если всё совпадает (или мост не прислал данных).
export function staleProblem(
	myProtocol: number,
	serverProtocol: number | undefined,
	myBuild: string,
	serverBuild: string | undefined,
): string {
	if (serverProtocol !== undefined && serverProtocol !== myProtocol)
		return "Мост и плагин разных версий — перезапустите мост (cd server && npm start)";
	if (serverBuild && myBuild && serverBuild !== myBuild)
		return "Плагин устарел — выполните cd plugin && npm run build (Figma подхватит сборку сама)";
	return "";
}
