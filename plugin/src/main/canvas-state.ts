/// <reference types="@figma/plugin-typings" />

// Общий счётчик сериализации (лимит нод в одном дереве).
export const state = {
	serializedNodes: 0,
};

export type AnySpec = {
	[key: string]: unknown;
	type?: string;
	children?: AnySpec[];
};
