// Направление дизайна: раздача тем (deal) и выбор формы страницы (draw).
// Детерминировано: сид = prompt + reroll, журнал прошлых сборок разводит соседние результаты.
// Адаптировано из Hallmark (MIT, Nutlope / Together AI).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const THEMES_DIR = join(HERE, 'design-guide', 'themes');
const LOG_MAX = 12;
export const GENRES = ['atmospheric', 'modern-minimal', 'playful', 'editorial'];

let cache = null;
export function loadThemes() {
	if (cache) return cache;
	try {
		const j = JSON.parse(readFileSync(join(THEMES_DIR, 'index.json'), 'utf8'));
		cache = Array.isArray(j) ? j : j.themes || [];
	} catch (e) {
		throw new Error(`Theme index not readable (${join(THEMES_DIR, 'index.json')}): ${e.message}`);
	}
	return cache;
}

export function readTheme(slug) {
	const s = String(slug || '');
	if (!/^[a-z0-9-]+$/.test(s)) throw new Error(`Invalid theme slug "${s}"`);
	const file = join(THEMES_DIR, `${s}.md`);
	if (!existsSync(file)) throw new Error(`Theme card "${s}" not found (expected ${file})`);
	return readFileSync(file, 'utf8');
}

// Жанр по ключевым словам запроса (шаг 1 SKILL.md); иначе editorial
const GENRE_WORDS = [
	['atmospheric', ['ai tool', 'ai ', 'generative', 'music', 'video', 'voice', 'dark', 'atmospheric']],
	['modern-minimal', ['saas', 'enterprise', 'api', 'platform', 'developer tool', 'developer', 'infra', 'b2b', 'billing', 'dashboard']],
	['playful', ['playful', 'fun', 'friendly', 'soft', 'kids', 'game', 'games', 'community']],
];
export function routeGenre(prompt) {
	const p = ` ${String(prompt || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ')} `;
	const hit = (w) => new RegExp(`(^|[^a-z0-9])${w.trim().replace(/\s+/g, '\\s+')}([^a-z0-9]|$)`).test(p);
	for (const [genre, ws] of GENRE_WORDS) if (ws.some(hit)) return genre;
	return 'editorial';
}

const triple = (t) => `${t.paper.band}/${t.display.class}/${t.accent.band}`;
const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
const STOP = new Set(['build', 'make', 'create', 'design', 'need', 'want', 'please', 'page', 'site', 'website', 'landing', 'called', 'for', 'and', 'the', 'with', 'that', 'this', 'our', 'your', 'figma', 'screen', 'screens', 'frame']);
const promptWords = (s) => words(s).filter((w) => !STOP.has(w));
const stem = (w) => { let x = w.replace(/(?:ing|ed)$/, ''); if (x.length < 3) x = w; return x.endsWith('ss') ? x : x.replace(/s$/, ''); };
const low = (x) => String(x || '').toLowerCase();

function seededRand(key) {
	let h = createHash('sha256').update(key).digest();
	let i = 0;
	return () => {
		if (i >= h.length - 4) { h = createHash('sha256').update(h).digest(); i = 0; }
		const v = h.readUInt32BE(i); i += 4;
		return v / 0xffffffff;
	};
}

// Берём лучшую, затем вторую с другой бумагой (если не хуже на 2), затем всё с разными осями
function pickFrom(pool, n, exclude) {
	const avail = pool.filter((s) => !exclude.has(s.t.slug));
	const picked = [];
	if (!avail.length) return picked;
	picked.push(avail[0]);
	const rest = () => avail.filter((s) => !picked.includes(s));
	if (n >= 2 && rest().length) {
		const best = rest()[0];
		const other = rest().find((s) => s.t.paper.band !== picked[0].t.paper.band && s.fit >= best.fit - 2 && triple(s.t) !== triple(picked[0].t));
		picked.push(other || rest().find((s) => triple(s.t) !== triple(picked[0].t)) || best);
	}
	while (picked.length < n && rest().length) {
		picked.push(rest().find((s) => picked.every((p) => triple(p.t) !== triple(s.t))) || rest()[0]);
	}
	return picked;
}

// Три темы. log — массив записей (новые первыми); по умолчанию читаем журнал на диске
export function dealThemes({ prompt = '', genre, log, reroll = 0 } = {}) {
	const g = GENRES.includes(genre) ? genre : routeGenre(prompt);
	const n = 3;
	const themes = loadThemes();
	const entries = Array.isArray(log) ? log : readLog();
	const recent = entries.slice(0, 3);
	const bySlug = new Map(themes.map((t) => [t.slug, t]));
	const recentSlugs = new Set(recent.map((r) => low(r.theme)));
	const recentThemes = recent.map((r) => bySlug.get(r.theme)).filter(Boolean);
	const lastAxes = recentThemes[0] && recent[0].theme === recentThemes[0].slug ? triple(recentThemes[0]) : null;
	const occupied = new Set(recentThemes.map(triple));
	const lastPosture = recentThemes[0]?.posture;
	const bw = new Set(promptWords(prompt).map(stem));
	const rand = seededRand(`deal·${promptWords(prompt).join('-')}·${createHash('sha1').update(low(prompt).trim()).digest('hex').slice(0, 8)}`);

	const df = new Map();
	for (const t of themes) for (const k of new Set((t.keywords || []).map(low))) df.set(k, (df.get(k) || 0) + 1);
	const scored = themes.map((t) => {
		let fit = 0; const hits = [];
		for (const k of t.keywords || []) {
			const kw = low(k).split(/\s+/).map(stem);
			if (kw.every((w) => bw.has(w))) { const d = df.get(low(k)); fit += d <= 2 ? 3 : d <= 4 ? 2 : 1; hits.push(k); }
		}
		fit += t.genre === g ? 2 : -1;
		const blocked = recentSlugs.has(t.slug) || (lastAxes && lastAxes === triple(t));
		if (!blocked && occupied.has(triple(t))) fit -= 1;
		if (!blocked && lastPosture && t.posture === lastPosture) fit -= 1;
		return { t, fit, hits, blocked, r: rand() };
	});
	const pool = scored.filter((s) => !s.blocked).sort((a, b) => b.fit - a.fit || a.r - b.r);
	const previously = new Set();
	for (let r = 0; r < Math.max(0, reroll | 0); r++) for (const p of pickFrom(pool, n, previously)) previously.add(p.t.slug);
	const picked = pickFrom(pool, n, previously);
	if (!picked.length) throw new Error(`Nothing left to deal at reroll ${reroll}; use a lower reroll`);
	return picked.map((s) => ({
		slug: s.t.slug, name: s.t.name, genre: s.t.genre, posture: s.t.posture, axes: triple(s.t),
		material: s.t.material, photo: s.t.photo, pictured: s.t.pictured,
		fit: s.fit, why: s.hits.length ? `fits: ${s.hits.slice(0, 4).join(', ')}` : s.t.genre === g ? 'genre fit' : 'adjacent genre',
	}));
}

// ---- Таблицы выбора формы (draw) ----
// 21 макроструктура: общий словарь; пулы по материалу выбирают подходящие
export const SHAPES = ['Bento Grid', 'Long Document', 'Marquee Hero', 'Stat-Led', 'Workbench', 'Conversational FAQ', 'Manifesto', 'Photographic', 'Quote-Led', 'Specimen', 'Catalogue', 'Letter', 'Index-First', 'Narrative Workflow', 'Split Studio', 'Feature Stack', 'Type Specimen', 'Portfolio Grid', 'Map / Diagram', 'Ecosystem Index', 'Component Playground'];
const SHAPE_NOTES = {
	'Bento Grid': 'irregular grid of tiles in mixed sizes, rhythm from size not uniform cards',
	'Long Document': 'a memo or journal entry: continuous prose, inline section heads, no marketing structure',
	'Marquee Hero': 'the first screen is one huge statement or visual; below it the page becomes a list, grid or prose',
	'Stat-Led': 'the lead is a figure the user gave, with the line that says what it means',
	'Workbench': 'real product screens are the content; a guided tour with short captions',
	'Conversational FAQ': 'bold questions, direct answers, like an interview with the product',
	'Manifesto': 'polemical large type: what to believe before what to buy',
	'Photographic': 'one huge image per screen height; text is small annotation',
	'Quote-Led': 'the lead is a supplied quote with attribution',
	'Specimen': 'large serif display, asymmetric spans, hairlines (type, publishing, writing only)',
	'Catalogue': 'uniform grid of variations of one thing, a visual index of inventory',
	'Letter': 'first person, opens with a greeting, a personal note from the founder',
	'Index-First': 'the page is a list of links; navigation as design, no hero image',
	'Narrative Workflow': 'numbered stages telling how the product is used over time',
	'Split Studio': 'diptych: every block divides in two, text on one side, proof on the other',
	'Feature Stack': 'one heading pane beside a run of captures, paced like film (build as stacked rows with the heading column repeated or pinned in the same position)',
	'Type Specimen': 'the typeface is the design (foundries, design systems)',
	'Portfolio Grid': 'cards of projects; the work is the product',
	'Map / Diagram': 'one large spatial diagram organises the page',
	'Ecosystem Index': 'several browse surfaces: featured, latest, by category, by people',
	'Component Playground': 'blocks that each show a component and how it is used',
};
const POOLS = {
	photo: ['Photographic', 'Marquee Hero', 'Split Studio', 'Catalogue', 'Narrative Workflow', 'Bento Grid', 'Conversational FAQ', 'Letter', 'Feature Stack'],
	product: ['Workbench', 'Feature Stack', 'Bento Grid', 'Narrative Workflow', 'Marquee Hero', 'Split Studio', 'Conversational FAQ', 'Map / Diagram', 'Stat-Led'],
	words: ['Long Document', 'Manifesto', 'Letter', 'Index-First', 'Conversational FAQ', 'Marquee Hero', 'Narrative Workflow'],
};
// Позы первого экрана (кадр 1440x900); дубли в пуле повышают вес
const HERO_NOTES = {
	Settled: 'fills the screen under the nav; text on six columns, visual on the other six, centred vertically',
	Stage: 'fills the screen; text on five columns, a visual on seven at 60-75% of the frame height, may bleed off the outer edge',
	Banner: '50-60% of the frame height so the first section shows in the first screen; for references and utilities',
	Ledge: 'fills the screen; a tall field above, the heading resting at the base',
	Corridor: 'fills the screen; one centred column of about 44 characters, heading larger than usual',
	Poster: 'full-bleed photograph or canvas at 92-100% of the frame, content on its calmest part, low and left or centred',
	Counter: 'the action is the visual: subscribe field with the latest issue, booking times, buy box, download beside the screen; set large beside a shorter heading',
	Index: 'the content is the visual: lineup, menu, list of issues or projects set large as the lead, small heading above',
};
const HEROES = { photo: ['Poster', 'Stage', 'Ledge', 'Settled', 'Poster', 'Stage'], product: ['Stage', 'Settled', 'Banner', 'Corridor', 'Stage'], words: ['Corridor', 'Ledge', 'Banner', 'Settled'] };
const NAVS = ['edge-aligned (wordmark and one or two links or an action at opposite edges)', 'floating pill (rounded bar inset from the frame edge)', 'masthead (large centred wordmark over a rule)', 'slab (heavy full-width bar)', 'search-led bar (visible command pill)', 'banner over a bar (announcement strip above a slim bar)'];
const FOOTERS = ['mast (the wordmark large over the links)', 'statement (one closing sentence large, links beneath)', 'colophon block (credits and address as one paragraph)', 'newsletter-first (the form leads; subscribe pages only)', 'letter close (a sign-off and a date)', 'index columns (a hub with a real sitemap)'];
const OPENERS = ['Split', 'Showcase', 'Grid', 'Bento', 'Rows', 'Table', 'Steps', 'Statement', 'Rail', 'Pinned', 'Switcher', 'Index', 'Schedule', 'Offer'];
export const COMPOSITIONS = {
	Split: 'text block beside a visual, 440px tall or more, 4:3 to 4:5; mirror the side once at most',
	Showcase: 'head block, then one visual across all twelve columns at 16:9-21:9, 560px tall or more',
	Grid: 'three or four items across, equal heights, aligned tops, 240px or taller, each with picture or large figure',
	Bento: 'four to six tiles in mixed spans, rows 280-360px, one clear lead tile',
	Rows: 'three to five full-width rows parted by hairlines, 72-120px each, title left, line or figure right',
	Table: 'full width, four or five rows of 56-72px, tabular numerals, name column one step heavier',
	Figures: 'three or four real numbers at display size, labels beneath, parted by vertical hairlines; only figures the user gave',
	Steps: 'three or four stages across, each a numeral, title and line, with a visual where there is one',
	Statement: 'one sentence over eight to ten columns in two or three lines; once a page',
	Band: 'edge-to-edge change of background holding what the job wants there; short, under 360px',
	Rail: 'a horizontal run of five or more items running past the frame edge, the next one cut off',
	Pinned: 'one visual on six or seven columns with three or four short panels beside it, each changing what the visual shows (drawn as stacked states)',
	Switcher: 'one area with two to five states shown as a segmented control plus the first state; extra states as variants or separate frames on request',
	Index: 'dense scannable list of the prompt\'s own items with facts in columns, 6-20 rows, lead row larger',
	Schedule: 'time against place or day: columns of acts and times, a week of classes, opening hours as a strip',
	Offer: 'the thing for sale with options, price, action and one line of delivery or terms; often the hero on a buy page',
};
const JOBS = {
	subscribe: { sections: ['an example issue set as it arrives (a sample)', 'the archive as an Index of past issues (sample titles)', 'who writes it, with a picture slot', 'the contents of one issue, as rows'], close: ['a second subscribe field under the archive', 'the archive itself, ending on the latest issue'], open: ['Index', 'Rail', 'Statement', 'Split'], heroes: ['Counter', 'Corridor', 'Index', 'Banner'], action: ['the subscribe field in the hero, beside the latest issue', 'the subscribe field in the hero and once more under the issues'] },
	book: { sections: ['the menu as a Switcher by lunch and dinner (sample dishes, no prices unless given)', 'the room as a full-bleed photograph with no head', 'hours and the address as a section of their own', 'the next free times as buttons'], close: ['hours, the address and the booking again', 'the booking beside one last photograph'], open: ['Switcher', 'Index', 'Schedule', 'Split', 'Showcase'], heroes: ['Counter', 'Poster', 'Stage', 'Index'], action: ['a persistent booking bar pinned to the frame bottom', 'the booking times in the hero', 'the booking beside the menu or the rooms'] },
	visit: { sections: ['what is on now as the lead picture', 'what is coming as dated rows', 'the shelves or the rooms as a Rail', 'getting there, with the hours'], close: ['visit information and the address', 'what is on next'], open: ['Showcase', 'Schedule', 'Rail', 'Split'], heroes: ['Poster', 'Ledge', 'Stage'], action: ['hours and the address in the hero', 'hours, the map and the way in at the close', 'a slim bar with today\'s hours'] },
	attend: { sections: ['the days as a Schedule', 'the lineup as an Index, set large', 'ticket tiers as rows', 'the place and how to get there', 'questions as rows'], close: ['tickets again', 'the questions', 'the mailing list for the next edition'], open: ['Schedule', 'Index', 'Rail', 'Showcase'], heroes: ['Index', 'Poster', 'Counter', 'Ledge'], action: ['tickets in the hero', 'tickets beside the lineup', 'a ticket bar pinned to the frame bottom'] },
	buy: { sections: ['the range as an Offer or a Rail (sample names; no prices unless given)', 'the thing in use, close and large', 'how it is made, as a Pinned run', 'delivery and care as plain facts'], close: ['the offer again', 'delivery and the guarantee as plain facts'], open: ['Offer', 'Rail', 'Showcase', 'Switcher'], heroes: ['Counter', 'Stage', 'Poster'], action: ['the offer as the hero', 'a buy bar pinned to the frame bottom', 'the offer after the product close up'] },
	try: { sections: ['features as named moments in screens (Pinned or Switcher)', 'a before and after', 'the platforms and what it needs'], close: ['the download beside one last screen'], open: ['Pinned', 'Switcher', 'Showcase', 'Rail'], heroes: ['Counter', 'Stage', 'Settled'], action: ['the download beside the screen in the hero', 'the download in the hero and at the close'] },
	'sign up': { sections: ['the product at work as a Pinned run', 'a code sample or the integration', 'pricing as a table with its period switch', 'questions as rows'], close: ['the hero\'s action in a short band', 'the code sample'], open: ['Pinned', 'Switcher', 'Showcase', 'Bento', 'Table'], heroes: ['Stage', 'Settled', 'Banner', 'Counter'], action: ['sign up in the hero', 'sign up in the hero and beside the price'] },
	hire: { sections: ['the work as an Index of projects with pictures', 'one project opened as a case', 'what the studio does, as a short list', 'where it is'], close: ['contact details per office', 'a plain email and phone'], open: ['Index', 'Rail', 'Showcase', 'Statement'], heroes: ['Index', 'Poster', 'Corridor', 'Ledge'], action: ['the enquiry after the work', 'a contact line in the nav and at the close'] },
	join: { sections: ['what a session is like, shown', 'when and where as a Schedule', 'membership options as rows', 'first-visit guidance'], close: ['the first visit', 'the membership options'], open: ['Schedule', 'Grid', 'Split', 'Showcase'], heroes: ['Counter', 'Poster', 'Corridor'], action: ['join in the hero', 'join beside the schedule'] },
	listen: { sections: ['the record with its tracks as an Index (sample titles unless given)', 'dates as rows with ticket links', 'earlier work as covers in a Rail', 'a live photograph or the video'], close: ['the dates', 'more of the catalogue', 'the mailing list'], open: ['Index', 'Rail', 'Showcase', 'Schedule'], heroes: ['Poster', 'Index', 'Counter', 'Ledge'], action: ['the player or the record in the hero', 'listen in the hero and the dates beside it'] },
};
export const JOB_NAMES = Object.keys(JOBS);
const LEADS = {
	photo: ['the place', 'the thing itself, close', 'the making', 'the offer and its price', 'the season or the date', 'the people at work'],
	product: ['the job it does', 'the screen at work', 'the speed or the limit', 'the material it handles', 'the price', 'the before and after'],
	words: ['the claim', 'the question', 'the first line of the argument', 'the date and the place', 'the list itself'],
};

const normJob = (j) => low(j).trim().replace(/download|app/, 'try').replace(/software|saas/, 'sign up').replace(/newsletter|waitlist/, 'subscribe').replace(/watch|read/, 'listen');

// Форма страницы. Детерминировано: те же material/job/theme/log дают то же; другой job или log — другое.
// "Зеркальный тест": соседний запрос той же категории не должен получить ту же комбинацию.
export function drawShape({ material = 'photo', job = '', theme = '', log } = {}) {
	if (!POOLS[material]) throw new Error('material must be photo, product or words');
	const entries = Array.isArray(log) ? log : readLog();
	const jobName = normJob(job);
	const jd = JOBS[jobName] || null;
	const t = loadThemes().find((x) => x.slug === theme);
	const pictured = low(t?.pictured).split(/,\s*/).map((x) => x.replace(/ hero$/, '')).filter(Boolean);
	const rand = seededRand(`draw·${material}·${jobName}·${theme}·${entries.slice(0, 3).map((e) => [e.shape, e.hero, e.nav, e.footer].join('/')).join('|')}`);
	const recent = (k, n) => entries.slice(0, n).map((r) => low(r[k]));
	const near = (opts, n, k, extra = []) => {
		const bad = [...recent(k, n), ...extra].filter(Boolean);
		const ok = opts.filter((o) => !bad.some((b) => b.includes(low(o))));
		return ok.length ? ok : opts;
	};
	const take = (opts, m = 1) => { const pool = [...new Set(opts)]; const out = []; while (out.length < m && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]); return out; };

	const [shape] = take(near(POOLS[material], 3, 'shape', pictured));
	const heroPool = jd ? [...jd.heroes, ...jd.heroes, ...HEROES[material].filter((h) => !/settled|stage/i.test(h) || jd.heroes.includes(h))] : HEROES[material];
	const [hero] = take(near(heroPool, 1, 'hero', pictured));
	const [nav] = take(near(NAVS, 3, 'nav'));
	const [footer] = take(near(FOOTERS.filter((f) => !f.startsWith('newsletter-first') || jobName === 'subscribe'), 3, 'footer'));
	const [opener] = take((jd ? jd.open : OPENERS));
	const [action] = jd ? take(jd.action) : [null];
	const skip = take(['Split', 'Grid', 'Band', 'Statement', 'Steps', 'Figures'].filter((o) => o !== opener), 2);
	const [leadsWith] = take(LEADS[material]);
	const native = jd ? take(jd.sections, 3) : [];
	const [close] = jd ? take(jd.close) : [null];
	return {
		shape, shapeNote: SHAPE_NOTES[shape], hero, heroNote: HERO_NOTES[hero], nav, footer,
		firstSection: opener, firstSectionNote: COMPOSITIONS[opener], action,
		avoid: skip, leadsWith, job: jobName || null, sections: native, close,
	};
}

// ---- Журнал последних сборок ----
const logPath = () => join(homedir(), '.vivi-figma', 'direction-log.json');
export function readLog() {
	try {
		const j = JSON.parse(readFileSync(logPath(), 'utf8'));
		return (Array.isArray(j) ? j : []).filter((e) => e && typeof e === 'object').slice(0, LOG_MAX);
	} catch { return []; }
}
export function appendLog(entry) {
	const e = {};
	for (const k of ['shape', 'theme', 'hero', 'nav', 'footer', 'prompt']) if (entry?.[k] != null) e[k] = String(entry[k]).slice(0, 300);
	e.ts = entry?.ts || new Date().toISOString();
	const next = [e, ...readLog()].slice(0, LOG_MAX);
	const file = logPath();
	mkdirSync(dirname(file), { recursive: true });
	const tmp = `${file}.${process.pid}.tmp`;
	writeFileSync(tmp, JSON.stringify(next, null, 1) + '\n');
	renameSync(tmp, file);
	return next;
}
