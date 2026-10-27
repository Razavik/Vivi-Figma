Adapted from Hallmark (MIT, Nutlope / Together AI).

# Taste: quality gates and self-review

Goal: looks made, not generated. Three tiers. Lint `issues`/`hints` from figma_create/figma_edit are the objective part (overflow, contrast, off-grid, tiny text, default names); everything below is judged by LOOKING at figma_screenshot and reading figma_node. Passing lint does not make a design good.

## Self-review protocol

1. Style first: figma_styles (colors, texts), then use `style:<name>` everywhere.
2. Build the nav + hero ONLY. figma_screenshot it. Name 3 concrete defects in writing (what, where, which fix), fix them with figma_edit, re-screenshot. Only then add the rest with `parent`.
3. Build the remaining sections. After the page: figma_screenshot with `tiles:N` for long pages, `region:[x,y,w,h]` to zoom into text, photos, small type.
4. Scroll the page one 1440x900 screen at a time. Each screen needs something big enough to be its reason. A heading plus a line adrift on an empty canvas, a narrow column beside an empty half, a section head under 40 px: add mass (bigger visual, wider body, statement) or merge sections. Never add words.
5. Squint test: blur the words in your head; every section still has a shape and the page a rhythm of heavy and light.
6. Walk the tiers below. FLOOR items are fixed, never excused. REFLEX items stay only with a real reason you can say in one sentence about THIS design. FINISH items are answered or fixed.
7. Look at the screenshot cold, as if someone else made it: what would a stranger call generic? Budget: one inspection pass, one fix batch, at most one confirming screenshot.

Before building, score the plan 1-5 on tone, hierarchy, execution, specificity (could it belong to no other product), restraint, variety. Anything under 3: revise the plan first.

## FLOOR (never waivable)

Honesty
- No invented metrics, testimonials, logo walls, case-study counts, ratings, "trusted by" numbers. Use what the user gave, or an honest text placeholder (see patterns.md), or nothing. Sample data in a product mockup must read as a sample, never as proof.
- No form or button that "confirms" something nothing did ("Sent", "You're on the list", "Reserved") unless the user's flow offers it. Draw success states only as a named state frame when asked.

Tells that are banned outright
- No eyebrow: a short inert line announcing the heading under it (stacked, beside, pill, numbered "01", category tag over a card, "TRUSTED BY" over logos). Test: delete the line; if only a name for what comes next is lost, it was an eyebrow. Open the section another way (see layout.md). Legal: figure captions, table column heads, form labels, nav/tab labels, a byline or date, a unit after its figure.
- No tracked-caps labels. Labels, captions, table heads, tags, chips and nav links are the body font one step smaller, sentence case, letterSpacing 0. Do not use textCase "upper" or letterSpacing above 3% on text 15 px or smaller. Legal: a wordmark; controls on a page whose display type is itself uppercase (tracking at most 4%).
- No middle-dot-joined meta strings ("A · B · C"), no arrows glued to link text ("Learn more →"), no decorative status dots before labels, no "WORD - fragment" labels. Use line breaks, columns, hairlines, a verb as the label. Legal: one dot in a byline, a dot that shows a live state.
- No purple-to-blue, purple-to-pink or cyan-on-dark gradient anywhere, including on text. One anchor hue, solid ink.
- No card inside a card. One containment layer; inside a card use spacing and hairlines.
- No emoji as icons. Use figma_icons / icon nodes, one icon set per design.
- No hand-drawn browser bar (traffic lights, URL pill) or OS window chrome. Show a real screenshot via image.path, or no chrome.
- No one italic word inside a roman heading.
- Uppercase display heading that can wrap: lineHeight at least 1.0 x size.
- Copy tells: placeholder names (Jane Doe, Acme, Nexus), buzzwords (seamless, robust, empower, supercharge, elevate, effortless, unlock, unleash, next-generation, world-class, best-in-class, industry-leading, mission-critical, future-proof), the rebuttal cadence "Not a feature. A platform." (three or more times), "quietly trusted by", filler openers ("Built for the modern team", "In today's landscape"), em or en dashes in copy, a stock second action beside the primary ("Learn more", "Get started", "Book a demo").

Legibility and structure
- Contrast: body text 4.5:1, large text/icons/field edges 3:1; white text only on dark enough fills; no grey text on a coloured surface (use that surface's own ink). Text on a photo always has an overlay.
- No text under another element; no clipped or overflowing text; no button label or nav link wrapping (shorten it instead).
- Pure #000000 / #FFFFFF as text or surface colour: tint toward the anchor hue (a white page tinted slightly warm/cool is fine; a minimal design may keep white paper).
- Hero fold: in the first 1440x900 the hero's headline, one sentence and the primary action are visible together with the visual's focal point. Hero text = headline + one sentence + one or two actions, nothing else.
- Screen budget: about 80 words on any one 1440x900 screen (labels and table cells count). One idea per screen; a visitor takes one idea per screen or leaves.
- Container capped and centred (see layout.md): content stays the same width in a wider frame; margins grow, not the measure.
- Colours and fonts go through figma_styles (`style:<name>`), no stray literals.

## REFLEX (model defaults; keep only with a real, specific reason)

Colour and surface
- Accent colour covering more than about 5% of the screen without a deliberately chosen "committed" or "drenched" look. The accent is a signal: primary action, active item, the one chart series that argues. If the whole page is the accent, decide it on purpose.
- Glow and wash: aurora/mesh blobs behind text, floating blurred orbs, chromatic halos, coloured zero-offset glows on dark. Depth on dark comes from lighter surfaces, not glow. Exception: an atmospheric/AI-product direction may have at most two large soft blooms, each 20-30% of the canvas.
- Gradient text in any hue; gradients past three stops. A single-hue ramp as a background is fine.
- Pure black/white surfaces; zero-saturation greys when there is an anchor hue.
- The named look: cream paper + high-contrast serif display + terracotta/clay accent. Allowed only when the brief pins it; otherwise move one axis (accent first, paper second, display last).
- The stock swatch: indigo-500 / violet-600 / slate-900 defaults. Mix a colour for this design.

Type
- Inter/Roboto/Open Sans/Poppins/Lato/system font as the display face (see typography.md for choosing).
- More than three font families; more than three weights in running use.
- Accented word: one word or phrase in a heading set apart by colour, weight, highlight or underline. A heading is one weight, one style, one colour; get stress from a line break or a second line at a second size.
- An italic display system; mono as costume (monospace on labels, meta, table heads when the content is not code, figures or measurements).
- Prose lines wider than about 75 characters; text under 12 px; multi-line prose with lineHeight under 1.3 x size.

Structure and layout
- Card tells: three equal columns of icon-above-heading tiles; an icon in a rounded coloured tile above a heading; a thick coloured stripe on a card edge. Vary widths and heights, put icons inline, use hairlines or no border.
- The AI template: hero, three features, call to action, footer. Or the same skeleton as the previous design in this file. Build the sections the content calls for.
- Every section separated the same way with the same gap. Vary: whitespace, hairline, tinted band, card.
- Hero with all of title, lede, action and mark on one centred axis. Prefer at most two centred elements with one breaking the alignment. Centred is a default, not a choice.
- Hero content off-centre in its screen: lots of nothing below it, or the visual pinned to an edge far from the text. The hero fills its screen and only its screen.
- Gap between sections under 120 px at 1440 (64 where the background changes), or every gap identical.
- Crowded heads: a heading nearer the content above than its own (space above at least twice the space below).
- Cramped boxes: text in a filled box closer than 12-16 px to its sides.
- Thin sections: a body under three quarters of the container width that is not a statement, or a section with no mass (no 300+ px visual, no set of three across, no list or table of three rows, no statement at section size). A head plus a paragraph is not a section.
- Section heads under 40 px at 1440.
- Dead band: over 160 px of nothing under the hero's last content.
- Drawn illustration: a figure of an object, plant, person, product, building or scene made from shapes. Use a photo, the product built from frames, or type at scale. (Charts, maps and diagrams of real data are fine.)
- Empty picture: a grey/gradient rectangle 300x200+ with nothing in it. Put a photo or the product in it, or remove it.
- Counting device: 24+ identical marks (dots, bars, ticks) standing for a quantity. Set the number in type.
- Photo wall: below the hero, photographs cover more than about a third of the page (45% on a photography portfolio), or two photograph-led sections in a row.
- Fake product: mocking up a product that exists and could be screenshotted by the user. Ask for a screenshot (image.path) first.
- Stock close: an email sign-up as the closer when the job is not a mailing-list job.
- Wireframe page: more than five empty placeholder frames on a page, or four+ blank frames in one row (blank portraits, blank bottles). Set the set in type.
- The echo: one fact (price, date, count) printed in four or more sections; a section's last line restating its heading.

Chrome and copy
- Chrome by reflex: the AI nav (logo left, links, button right, hairline) or AI footer (four link columns, social row, copyright) without a decision (layout.md).
- A bare number as the hero's only headline (unless the user supplied it, it carries its unit and source, and the page is built around it).
- Phone/laptop/terminal/editor frames beyond one, or imitation material: a "product UI" of styled boxes standing as proof with invented figures, many-vertex shapes faking a photo edge, a decorative grid/stripe background with nothing under it.
- Decoration text: rotated vertical text with nothing to say, scroll cues, "v2.0 / BETA" pills in the hero, weather/locale strips, caps strips under the hero, credit lines under stand-ins, "01 / 4" counts on tiles. Keep only a text that carries a fact.
- Two icon sets in one design.
- Control height outside 44-52 on marketing designs (app UI 32-40).

## FINISH (craft; fix or answer each)

- Straight quotes and "..." in copy: use curly quotes and a real ellipsis.
- No heading ending on a one-word stub, no paragraph with a lone word on its last line (adjust w/maxW or rewrite).
- More than one filled primary button style on the page; two filled buttons side by side. Secondary = outlined or text, never louder than the primary.
- Figures that compare (prices, stats, table numbers) set with tabular figures where the font has them, right-aligned in columns.
- A grid or wrapping row leaving a single item alone on its last row under a fuller row: change the count.
- Page invariants broken (layout.md).
- Border and wide soft shadow on one surface: pick one.
- Pricing: see patterns.md.
- Mobile frames (when asked): see layout.md.

## Copy quality (judged)

- Write as the owner would say it across a counter: the user's own nouns, a real place, a number the user gave, the verb a customer would use.
- Swap test: a headline that would work on a competitor's page gets rewritten with a noun only this brief has. "Software that works for you" fits anyone; "Invoices that chase themselves" fits one product.
- Budget: headline 7 words or fewer; section head 6 or fewer; section intro one line; paragraph two short sentences; lists of 4 items (3-word label + 10-word line), 5 for steps; tables 5 rows; 450 visible words per page at most. Read only headings and the hero: if they tell the story, the rest is the right length.
- Section heads say what the visitor will see or get ("Three loaves a morning"), never a category label ("Features", "Our story", "Why us").
- Also refuse: "Reimagine", "Whether you're X or Y", "It's not just X, it's Y", "Say goodbye to", "game-changer", "journey", a colon title ("Focus: the app for"), "Click here", "Enter your email below", a version string in marketing copy.
- Buttons name the action ("Book a fitting"). Error and empty-state copy: patterns.md. Words the user insists on are used verbatim.

## AI-slop tells (the catalogue; if you see one, fix it)

Purple-blue/purple-pink gradients; gradient text; glowing blurred orbs behind the hero; a pill/eyebrow/tracked-caps label above every heading; cards inside cards; three identical icon-over-title tiles; icons in tinted rounded squares; thick coloured left-edge stripe on cards; everything centred; the same section skeleton repeated (label + title + three cards); hero + three features + CTA band + footer; emoji as icons; fake browser bars and traffic lights; invented metrics ("10,000+ teams", "99.9% uptime"), invented testimonials with stock faces, invented logo walls; "Trusted by" strips; buzzword copy; em dashes; "Learn more" beside "Get started"; middle-dot meta strings; arrows in link labels; status dots before labels; bare "01 / 02 / 03" labels over step heads; rotated side text, scroll cues, BETA pills; drawn illustrations of objects; empty grey picture boxes; rows of 24+ dots standing for a number; photo walls; email sign-up as the closer; Inter-everywhere with indigo-500; cream + serif + terracotta; flat grey on pure white; accent colour on every surface; stat rows of three round numbers; hero with only a giant number; mockup of a product the user could screenshot; a "success" message for something that sent nothing.
