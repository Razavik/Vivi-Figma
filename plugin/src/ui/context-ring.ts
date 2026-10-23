// Индикатор контекста рядом с выбором модели: кольцо заполненности окна,
// подсказка над ним при наведении, клик — сжать историю (компакт).
import { S } from "./ui-state";
import { formatContext } from "./settings-core";

const R = 6;
const LEN = 2 * Math.PI * R;

const wrap = document.createElement("div");
wrap.className = "ctx-ring-wrap";
wrap.innerHTML = `<button class="ctx-ring" type="button" aria-label="Контекст">
	<svg width="16" height="16" viewBox="0 0 16 16"><circle class="track" cx="8" cy="8" r="${R}"/><circle class="bar" cx="8" cy="8" r="${R}" stroke-dasharray="${LEN}" stroke-dashoffset="${LEN}" transform="rotate(-90 8 8)"/></svg>
</button><div class="ctx-tip" role="tooltip"><div class="ctx-tip-main"></div><div class="ctx-tip-hint"></div></div>`;
const btn = wrap.querySelector(".ctx-ring") as HTMLButtonElement;
const bar = wrap.querySelector(".bar") as SVGCircleElement;
const tipMain = wrap.querySelector(".ctx-tip-main") as HTMLElement;
const tipHint = wrap.querySelector(".ctx-tip-hint") as HTMLElement;

let onCompact: () => void = () => {};
let compacting = false;

export function initContextRing(fn: () => void): void {
	onCompact = fn;
	document.getElementById("model-dd")?.after(wrap);
	btn.onclick = () => {
		if (!canCompact()) return;
		onCompact();
	};
	renderRing();
}

// Окно выбранной модели: из каталога, иначе — что сообщил сервер.
function windowTokens(): number {
	const m = S.merged.find((x) => x.id === S.currentModel);
	const ctx = m?.family?.context ?? m?.context;
	return ctx && ctx > 0 ? ctx : S.ctxWindow;
}

function canCompact(): boolean {
	return !compacting && !S.busy && S.ctxTokens > 0;
}

export function setCompacting(on: boolean): void {
	compacting = on;
	renderRing();
}

export function renderRing(): void {
	const win = windowTokens();
	const used = S.ctxTokens;
	const ratio = win > 0 ? Math.min(1, used / win) : 0;
	bar.style.strokeDashoffset = String(LEN * (1 - ratio));
	wrap.classList.toggle("warn", ratio >= 0.6 && ratio < 0.8);
	wrap.classList.toggle("full", ratio >= 0.8);
	wrap.classList.toggle("busy", compacting);
	btn.disabled = !canCompact();
	const pct = Math.round(ratio * 100);
	tipMain.textContent = win
		? `${pct}% (${formatContext(used) || "0"} / ${formatContext(win)}) контекста занято`
		: `${formatContext(used) || "0"} токенов контекста`;
	tipHint.textContent = compacting
		? "Сжимаю историю…"
		: S.busy
			? "Сжать можно после ответа"
			: used > 0
				? "Нажмите, чтобы сжать историю"
				: "Контекст ещё пуст";
}
