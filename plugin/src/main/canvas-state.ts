/// <reference types="@figma/plugin-typings" />

// Общая изменяемая стейт-площадка для code.ts и его модулей.
export const state = {
	warnings: [] as string[],
	// Сообщения для пользователя об итогах операций (не ошибки): экспорт, разметка…
	infos: [] as string[],
	nodeCount: 0,
	serializedNodes: 0,
	lastBuiltRootId: null as string | null,
	// Компоненты, построенные в текущей спеке: имя → нода. Инстансы
	// резолвят "component" по имени, а не только по id.
	namedComponents: new Map<string, ComponentNode | ComponentSetNode>(),
	// Ноды, построенные раньше своей очереди (фреймы с компонентами):
	// в основном проходе их просто переставляем на нужную позицию.
	prebuilt: new Map<AnySpec, SceneNode>(),
	// Ноды с right/bottom: ставятся, когда размеры родителей окончательны.
	anchors: [] as { node: SceneNode; right?: number; bottom?: number }[],
};

export type AnySpec = {
	[key: string]: unknown;
	type?: string;
	children?: AnySpec[];
};
export type Container = BaseNode & ChildrenMixin;
