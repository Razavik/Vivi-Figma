// План работы агента: кнопка в правом верхнем углу (видна, когда у
// отображаемой беседы есть план) и выпадающая карточка с шагами.
const btn = document.getElementById("plan-btn") as HTMLButtonElement;
const pop = document.getElementById("plan-pop") as HTMLElement;
const list = pop.querySelector(".plan-list") as HTMLOListElement;
const progress = pop.querySelector(".plan-progress") as HTMLElement;
const checkHead = pop.querySelector(".check-head") as HTMLElement;
const checkList = pop.querySelector(".check-list") as HTMLOListElement;
const checkProgress = pop.querySelector(".check-progress") as HTMLElement;

// Сколько пунктов плана и требований показано: кнопка видна, если есть хоть что-то.
let planCount = 0;
let checkCount = 0;
function syncButton(): void {
	btn.hidden = planCount + checkCount === 0;
	if (btn.hidden) closePlan();
}

export function initPlan(): void {
	btn.onclick = (e) => {
		e.stopPropagation();
		pop.hidden ? openPlan() : closePlan();
	};
	pop.onclick = (e) => e.stopPropagation();
	document.addEventListener("click", closePlan);
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") closePlan();
	});
}

function openPlan(): void {
	pop.hidden = false;
	btn.classList.add("active");
}

export function closePlan(): void {
	pop.hidden = true;
	btn.classList.remove("active");
}

// План отображаемой беседы; пустой — кнопку прячем. done — номера (с 1)
// частей, которые агент отметил готовыми.
export function showPlan(plan: string[] | undefined, done: number[] = []): void {
	const steps = plan?.filter((s) => typeof s === "string" && s.trim()) || [];
	const ready = new Set(done);
	list.innerHTML = "";
	steps.forEach((step, i) => {
		const li = document.createElement("li");
		li.textContent = step;
		if (ready.has(i + 1)) li.className = "done";
		list.appendChild(li);
	});
	const count = steps.filter((_, i) => ready.has(i + 1)).length;
	progress.textContent = steps.length ? `${count} / ${steps.length}` : "";
	btn.classList.toggle("complete", steps.length > 0 && count === steps.length);
	planCount = steps.length;
	syncButton();
}

// Чек-лист требований прогона (вторая секция карточки); пустой — секция скрыта.
export function showChecklist(items: string[], done: number[] = []): void {
	const ready = new Set(done);
	checkList.innerHTML = "";
	items.forEach((item, i) => {
		const li = document.createElement("li");
		li.textContent = item;
		if (ready.has(i + 1)) li.className = "done";
		checkList.appendChild(li);
	});
	const count = items.filter((_, i) => ready.has(i + 1)).length;
	checkProgress.textContent = items.length ? `${count} / ${items.length}` : "";
	checkHead.hidden = checkList.hidden = items.length === 0;
	checkCount = items.length;
	syncButton();
}
