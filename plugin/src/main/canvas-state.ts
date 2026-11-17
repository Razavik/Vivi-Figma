/// <reference types="@figma/plugin-typings" />

// Диагностика прогона: предупреждения (ошибки операций) и заметки (экспорт, разметка).
// Наружу уходят как warnings/infos (строки) — формат ответов не меняется.
export class Diagnostics {
	private w: string[] = [];
	private i: string[] = [];
	get warnings(): string[] { return this.w; }
	get infos(): string[] { return this.i; }
	warn(text: string): void { this.w.push(text); }
	info(text: string): void { this.i.push(text); }
	reset(): void { this.w.length = 0; this.i.length = 0; }
	// Срез для ответа: дальнейшие записи прогона его не меняют.
	take(): { warnings: string[]; infos: string[] } { return { warnings: [...this.w], infos: [...this.i] }; }
}

export const diag = new Diagnostics();

// Общая изменяемая стейт-площадка для code.ts и его модулей.
export const state = {
	warnings: diag.warnings,
	// Сообщения для пользователя об итогах операций (не ошибки): экспорт, разметка…
	infos: diag.infos,
	nodeCount: 0,
	serializedNodes: 0,
	// id веток, обрезанных лимитом maxNodes при сериализации (для droppedIds в ответе)
	dropped: [] as string[],
	lastBuiltRootId: null as string | null,
	// Компоненты, построенные в текущей спеке: имя → нода. Инстансы
	// резолвят "component" по имени, а не только по id.
	namedComponents: new Map<string, ComponentNode | ComponentSetNode>(),
	// Ноды, построенные раньше своей очереди (фреймы с компонентами):
	// в основном проходе их просто переставляем на нужную позицию.
	prebuilt: new Map<AnySpec, SceneNode>(),
	// Позиция и constraints применяются после окончательного размера родителей.
	anchors: [] as { node: SceneNode; right?: number; bottom?: number; constraints?: Partial<Constraints> }[],
};

export type AnySpec = {
	[key: string]: unknown;
	type?: string;
	children?: AnySpec[];
};
export type Container = BaseNode & ChildrenMixin;
