// Проверки текстов макета: валюты, даты, подписи кнопок, заглушки, опечатки
// набора, язык и «слишком гладкие» числа. Чистые функции над списком текстов —
// без Figma; результат — те же замечания, что у lint (Issue).
import type { Issue } from "./lint";

export type TextItem = {
	id: string;
	name: string;
	text: string;
	button?: boolean;
};

const MAX_CONTENT_ISSUES = 14;

const issue = (it: TextItem, kind: string, detail: string): Issue => ({
	id: it.id,
	name: it.name,
	kind,
	detail,
});

// Язык запроса по алфавиту: "ru" | "en" | "" (непонятно).
export function langOf(text: string): "ru" | "en" | "" {
	const cyr = (text.match(/[а-яё]/gi) || []).length;
	const lat = (text.match(/[a-z]/gi) || []).length;
	if (cyr + lat < 6) return "";
	return cyr >= lat ? "ru" : "en";
}

const CURRENCIES: [string, RegExp][] = [
	["₽", /₽|руб\.?|\bRUB\b/i],
	["$", /\$|\bUSD\b/],
	["€", /€|\bEUR\b/],
	["£", /£/],
];

function currencyOf(text: string): string {
	if (!/\d/.test(text)) return "";
	for (const [sym, re] of CURRENCIES) if (re.test(text)) return sym;
	return "";
}

const MONTHS =
	"января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря|Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
const DATE_FORMATS: [string, RegExp][] = [
	["ДД.ММ.ГГГГ", /\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/],
	["ГГГГ-ММ-ДД", /\b\d{4}-\d{2}-\d{2}\b/],
	["ДД месяц", new RegExp(`\\b\\d{1,2}\\s+(?:${MONTHS})`, "i")],
	["месяц ДД", new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2}\\b`, "i")],
];

function dateFormatOf(text: string): string {
	for (const [name, re] of DATE_FORMATS) if (re.test(text)) return name;
	return "";
}

const SYNONYMS: string[][] = [
	["купить", "в корзину", "добавить в корзину", "buy", "buy now", "add to cart"],
	["регистрация", "зарегистрироваться", "создать аккаунт", "sign up", "register"],
	["войти", "вход", "log in", "login", "sign in"],
	[
		"начать",
		"начать бесплатно",
		"попробовать бесплатно",
		"get started",
		"start free",
		"try for free",
	],
	["узнать больше", "подробнее", "читать далее", "learn more", "read more"],
	["связаться", "связаться с нами", "написать нам", "contact us", "get in touch"],
];

const normLabel = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]/gu, "")
		.replace(/\s+/g, " ")
		.trim();

const PLACEHOLDER =
	/lorem|ipsum|^(text|title|button|label|heading|subtitle|name|description|название|текст|заголовок|кнопка|подзаголовок|описание)(\s*\d*)?$/i;

// Нарушители в группе: при ничьей все, иначе только те, кто реже большинства.
function minority(items: { it: TextItem; key: string }[]): TextItem[] {
	const counts = new Map<string, number>();
	for (const { key } of items) counts.set(key, (counts.get(key) || 0) + 1);
	if (counts.size < 2) return [];
	const top = Math.max(...counts.values());
	const winners = [...counts.values()].filter((c) => c === top).length;
	return items
		.filter(({ key }) => winners > 1 || (counts.get(key) as number) < top)
		.map(({ it }) => it);
}

const ONLY_NUMBER = /^[^\p{L}\d]*\d[\d\s.,]*[^\p{L}\d]*$/u;

// Числа подряд с одним шагом и круглые — выглядят выдуманными.
function artificialNumbers(items: TextItem[]): TextItem[] {
	const nums = items
		.filter((it) => ONLY_NUMBER.test(it.text.trim()))
		.map((it) => ({
			it,
			v: Number(it.text.replace(/[^\d.,]/g, "").replace(",", ".")),
		}))
		.filter(({ v }) => Number.isFinite(v));
	if (nums.length < 4) return [];
	const round = nums.every(({ v }) => v > 0 && v % 100 === 0);
	const step = nums[1].v - nums[0].v;
	const arithmetic =
		step !== 0 &&
		nums.every(({ v }, i) => i === 0 || v - nums[i - 1].v === step);
	return round && arithmetic ? nums.map(({ it }) => it) : [];
}

// Фраза целиком в одном алфавите (без примесей другого).
function langOnly(text: string, lang: "ru" | "en"): boolean {
	return lang === "ru" ? !/[a-z]/i.test(text) : !/[а-яё]/i.test(text);
}

export function contentIssues(
	items: TextItem[],
	requestLang: "ru" | "en" | "" = "",
): Issue[] {
	const out: Issue[] = [];

	// Заглушки и пустые слои.
	for (const it of items) {
		const t = it.text.trim();
		if (!t)
			out.push(issue(it, "empty-text", "пустой текстовый слой — удали или заполни"));
		else if (PLACEHOLDER.test(t))
			out.push(
				issue(it, "placeholder-text", `заглушка «${t.slice(0, 30)}» вместо реального текста`),
			);
	}

	// Опечатки набора.
	for (const it of items) {
		const t = it.text;
		if (!t.trim()) continue;
		if (/ {2,}/.test(t)) out.push(issue(it, "typography", "двойной пробел"));
		else if (/\s[,;:!?]/.test(t) || /\s\.(?!\.)/.test(t))
			out.push(issue(it, "typography", "пробел перед знаком препинания"));
		else if (/(^|\s)--(\s|$)/.test(t))
			out.push(issue(it, "typography", "«--» вместо тире «—»"));
	}

	// Разные валюты в одном макете.
	const cur = items
		.map((it) => ({ it, key: currencyOf(it.text) }))
		.filter((x) => x.key);
	const curList = [...new Set(cur.map((c) => c.key))].join(", ");
	for (const it of minority(cur).slice(0, 6))
		out.push(issue(it, "currency-mix", `в макете смешаны валюты (${curList}) — оставь одну`));

	// Разные форматы дат.
	const dates = items
		.map((it) => ({ it, key: dateFormatOf(it.text) }))
		.filter((x) => x.key);
	const dateList = [...new Set(dates.map((d) => d.key))].join(", ");
	for (const it of minority(dates).slice(0, 6))
		out.push(issue(it, "date-format", `разные форматы дат (${dateList}) — приведи к одному`));

	// Одно действие — разные подписи кнопок.
	const buttons = items.filter((it) => it.button && it.text.trim());
	for (const group of SYNONYMS) {
		const hits = buttons.filter((b) => group.includes(normLabel(b.text)));
		const labels = [...new Set(hits.map((b) => normLabel(b.text)))];
		if (labels.length > 1)
			for (const it of hits.slice(0, 4))
				out.push(
					issue(it, "button-label", `одно действие названо по-разному (${labels.join(" / ")}) — выбери одну подпись`),
				);
	}

	// Язык: целые фразы (3+ слов) не на языке запроса.
	if (requestLang)
		for (const it of items) {
			if (it.text.trim().split(/\s+/).length < 3) continue;
			const l = langOf(it.text);
			if (l && l !== requestLang && langOnly(it.text, l))
				out.push(
					issue(
						it,
						"language",
						`фраза на ${l === "en" ? "английском" : "русском"}, а запрос на ${requestLang === "ru" ? "русском" : "английском"}`,
					),
				);
		}

	// Выдуманно гладкие данные.
	for (const it of artificialNumbers(items))
		out.push(
			issue(it, "data-artificial", "числа идут ровным шагом и круглые — сделай правдоподобный разброс"),
		);

	return out.slice(0, MAX_CONTENT_ISSUES);
}
