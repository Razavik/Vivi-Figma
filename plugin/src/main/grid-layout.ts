/// <reference types="@figma/plugin-typings" />
import type { AnySpec } from "./canvas-state";
import { state } from "./canvas-state";
import { paddingOf } from "./paint";
import type { FrameSpec } from "../spec";

export function gridSpecOf(frame: FrameNode) {
	const track = (value: GridTrackSize) => ({ type: value.type.toLowerCase() as "fixed" | "flex" | "hug", ...(value.type !== "HUG" ? { value: value.value ?? 1 } : {}) });
	return { columns: frame.gridColumnSizes.map(track), rows: frame.gridRowSizes.map(track), columnGap: frame.gridColumnGap, rowGap: frame.gridRowGap };
}

export function gridCellOf(node: SceneNode) {
	if (!("gridRowAnchorIndex" in node)) return undefined;
	const align = { MIN: "start", CENTER: "center", MAX: "end", AUTO: "start" } as const;
	return { row: node.gridRowAnchorIndex, column: node.gridColumnAnchorIndex, rowSpan: node.gridRowSpan, columnSpan: node.gridColumnSpan, horizontalAlign: align[node.gridChildHorizontalAlign], verticalAlign: align[node.gridChildVerticalAlign] };
}

// Строим grid после детей: сначала освобождаем все ячейки, затем выставляем
// якоря и span. Иначе автопозиция следующего ребёнка занимает чужую ячейку.
export function applyGridLayout(frame: FrameNode | ComponentNode, spec: AnySpec, pairs: { node: SceneNode; spec: AnySpec }[]): void {
	const grid = spec.grid as FrameSpec["grid"];
	if (!grid?.columns?.length || !grid.rows?.length) throw new Error("grid: нужны columns и rows");
	frame.layoutMode = "GRID";
	for (const { node } of pairs) if ("layoutPositioning" in node) node.layoutPositioning = "ABSOLUTE";
	frame.gridAutoTracks = "NONE";
	frame.gridColumnCount = grid.columns.length;
	frame.gridRowCount = grid.rows.length;
	frame.gridColumnGap = grid.columnGap ?? 0;
	frame.gridRowGap = grid.rowGap ?? 0;
	const p = paddingOf(spec.padding as number | number[] | undefined);
	frame.paddingTop = p.t; frame.paddingRight = p.r; frame.paddingBottom = p.b; frame.paddingLeft = p.l;
	for (const [tracks, values] of [[frame.gridColumnSizes, grid.columns], [frame.gridRowSizes, grid.rows]] as const) {
		values.forEach((track, index) => {
			tracks[index].type = track.type.toUpperCase() as GridTrackSize["type"];
			if (typeof track.value === "number" && track.type !== "hug") tracks[index].value = track.value;
		});
	}
	const align = { start: "MIN", center: "CENTER", end: "MAX" } as const;
	let automatic = 0;
	for (const { node, spec: child } of pairs) {
		if (!("layoutPositioning" in node) || child.position === "absolute") continue;
		const cell = (child.gridCell || { row: Math.floor(automatic / grid.columns.length), column: automatic % grid.columns.length }) as NonNullable<FrameSpec["gridCell"]>;
		automatic++;
		try {
			node.layoutPositioning = "AUTO";
			node.setGridChildPosition(cell.row, cell.column);
			node.gridRowSpan = cell.rowSpan ?? 1;
			node.gridColumnSpan = cell.columnSpan ?? 1;
			node.gridChildHorizontalAlign = align[cell.horizontalAlign ?? "start"];
			node.gridChildVerticalAlign = align[cell.verticalAlign ?? "start"];
			if (node.type === "TEXT" && child.w === "fill") node.textAutoResize = "HEIGHT";
			if ("layoutSizingHorizontal" in node) {
				node.layoutSizingHorizontal = child.w === "fill" ? "FILL" : child.w === "hug" ? "HUG" : "FIXED";
				node.layoutSizingVertical = child.h === "fill" ? "FILL" : child.h === "hug" ? "HUG" : "FIXED";
			}
		} catch (err) { state.warnings.push(`${node.name}: grid cell — ${String(err)}`); }
	}
}
