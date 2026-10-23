// Бриф: карточка с уточняющими вопросами агента. Прогон на время ответа
// не завершается — ответы уходят следующим раундом (см. ui.ts, case "ask").
import { appendToFeed, pushStep } from "./chat";
import { answerOf, type BriefAnswer, type BriefQuestion } from "./brief-core";


let card: HTMLElement | null = null;

// Карточка на экране (для кнопки «Стоп» и конца прогона).
export function briefOpen(): boolean {
	return !!card;
}

export function dismissBrief(): void {
	card?.remove();
	card = null;
}

// onDone(answers) — ответили; onDone(null) — «Пропустить — реши сам».
export function showBrief(
	questions: BriefQuestion[],
	summary: string,
	onDone: (answers: BriefAnswer[] | null) => void,
): void {
	dismissBrief();
	const root = document.createElement("div");
	root.className = "brief";
	if (summary) {
		const head = document.createElement("div");
		head.className = "brief-head";
		head.textContent = summary;
		root.appendChild(head);
	}
	const picks = new Map<string, Set<string>>();
	const customs = new Map<string, HTMLInputElement>();
	for (const q of questions) {
		const set = new Set<string>();
		picks.set(q.id, set);
		const block = document.createElement("div");
		block.className = "brief-q";
		const title = document.createElement("div");
		title.className = "brief-title";
		title.textContent = q.q;
		const chips = document.createElement("div");
		chips.className = "brief-chips";
		for (const opt of q.options) {
			const chip = document.createElement("button");
			chip.type = "button";
			chip.className = "brief-chip";
			chip.textContent = opt;
			chip.onclick = () => {
				if (set.has(opt)) set.delete(opt);
				else {
					if (!q.multi) set.clear();
					set.add(opt);
				}
				for (const c of Array.from(chips.children))
					c.classList.toggle(
						"on",
						set.has((c as HTMLElement).textContent || ""),
					);
			};
			chips.appendChild(chip);
		}
		const own = document.createElement("input");
		own.type = "text";
		own.className = "brief-own";
		own.placeholder = "Свой вариант";
		own.maxLength = 200;
		customs.set(q.id, own);
		block.append(title, chips, own);
		root.appendChild(block);
	}
	const actions = document.createElement("div");
	actions.className = "brief-actions";
	const skip = document.createElement("button");
	skip.type = "button";
	skip.className = "brief-skip";
	skip.textContent = "Пропустить — реши сам";
	const ok = document.createElement("button");
	ok.type = "button";
	ok.className = "brief-ok";
	ok.textContent = "Готово";
	skip.onclick = () => {
		dismissBrief();
		pushStep("Вопросы пропущены — агент решает сам", { status: "info" });
		onDone(null);
	};
	ok.onclick = () => {
		const answers = questions
			.map((q) => ({
				id: q.id,
				q: q.q,
				answer: answerOf(
					[...(picks.get(q.id) ?? [])],
					customs.get(q.id)?.value ?? "",
				),
			}))
			.filter((a) => a.answer);
		dismissBrief();
		if (!answers.length) {
			pushStep("Вопросы пропущены — агент решает сам", {
				status: "info",
			});
			onDone(null);
			return;
		}
		pushStep(
			`Ответы: ${answers.map((a) => a.answer).join(" · ")}`,
			{ status: "info" },
		);
		onDone(answers);
	};
	actions.append(skip, ok);
	root.appendChild(actions);
	card = root;
	appendToFeed(root);
}
