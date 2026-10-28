/// <reference types="@figma/plugin-typings" />
// Библиотека компонентов: верхнеуровневый фрейм «Components» (общий для componentize и правок).

// Верхнеуровневый фрейм «Components» на странице: главные компоненты живут только в нём,
// в дизайне остаются экземпляры. Нет фрейма — создаём справа от всего содержимого.
export function ensureLibrary(): FrameNode {
	const found = figma.currentPage.children.find((n) => n.type === "FRAME" && n.name === "Components") as FrameNode | undefined;
	if (found && !found.removed) return found;
	let right = 0;
	let top = Infinity;
	for (const n of figma.currentPage.children) {
		right = Math.max(right, n.x + n.width);
		top = Math.min(top, n.y);
	}
	const lib = figma.createFrame();
	lib.name = "Components";
	lib.layoutMode = "HORIZONTAL";
	lib.layoutWrap = "WRAP";
	lib.itemSpacing = 40;
	lib.counterAxisSpacing = 40; // между строками
	lib.paddingTop = lib.paddingBottom = lib.paddingLeft = lib.paddingRight = 40;
	lib.primaryAxisSizingMode = "FIXED";
	lib.counterAxisSizingMode = "AUTO";
	lib.resize(1600, 100);
	lib.fills = [{ type: "SOLID", color: { r: 0.97, g: 0.96, b: 0.95 } }];
	lib.x = right + 200;
	lib.y = Number.isFinite(top) ? top : 0;
	figma.currentPage.appendChild(lib);
	return lib;
}

// Главный компонент уезжает в «Components», на его месте остаётся экземпляр с теми же размерами/позицией.
export function liftToLibrary(component: ComponentNode, lib: FrameNode): InstanceNode | null {
	const origin = component.parent as (BaseNode & ChildrenMixin) | null;
	if (!origin || origin === lib || !("insertChild" in origin)) return null;
	const index = origin.children.indexOf(component);
	const inst = component.createInstance();
	origin.insertChild(index, inst);
	const inAuto = "layoutMode" in origin && (origin as FrameNode).layoutMode !== "NONE";
	if (inAuto && "layoutSizingHorizontal" in component && "layoutSizingHorizontal" in inst) {
		inst.layoutSizingHorizontal = component.layoutSizingHorizontal;
		inst.layoutSizingVertical = component.layoutSizingVertical;
	}
	if ("layoutPositioning" in component && component.layoutPositioning === "ABSOLUTE") inst.layoutPositioning = "ABSOLUTE";
	if (!inAuto || component.layoutPositioning === "ABSOLUTE") {
		inst.x = component.x;
		inst.y = component.y;
	}
	if ("rotation" in component && component.rotation) inst.rotation = component.rotation;
	inst.name = component.name;
	lib.appendChild(component);
	return inst;
}
