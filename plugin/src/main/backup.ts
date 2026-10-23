// Копии прогонов, оставшиеся от полной версии плагина (страница «⟲ Vivi history»):
// помечены в pluginData — в выдаче MCP их скрываем.
export const BACKUP_KEY = "viviBackup";

export function isBackup(node: BaseNode): boolean {
	return !!node.getPluginData(BACKUP_KEY);
}
