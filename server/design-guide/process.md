Adapted from Hallmark (MIT, Nutlope / Together AI).

PROCESS for a NEW design (a page, a screen set, a landing). Complements edits.md (tool workflow) and craft.md (D1-D15). Order: pre-flight, ask once, shape, direction, picks, build, sweep, close. Existing nodes are never part of this flow: changing them is figma_edit, not a new build.

## 0. Pre-flight: read the file before asking anything
- figma_status, figma_outline, figma_design_system, figma_fonts, figma_tokens (and figma_search for a logo/brand frame). Selected nodes and attached references are material.
- Existing styles, variables and components are a LOCKED SYSTEM: they override every pick below (direction, palette, fonts). Pages share the system; they differ in shape only. Use `style:<name>`, instances, existing fonts.
- A real brand is named (a company, "our site, we're Arc"): never theme it from memory. A recalled brand hex is confidently wrong. Take colours and fonts from the file (styles, logo frame, screenshots the user gave) or ask once: "I will not guess brand colours from memory. Paste the primary hex (and fonts), or say 'no brand lock' to build free." Proceed only on supplied or confirmed values; otherwise make no brand claims. Never redraw a real logo.
- Report in one block what you found and what you keep vs introduce.

## 1. Ask once
One message, even for a five-word prompt. Skip it when the prompt already answers it:
1. Material (the one that matters most): what can the design show? Photos, screenshots, real numbers (customers, prices, uptime), a quote with the name of who said it, logos they may use. Paste or give file paths (image.path); without photos you place stock stand-ins (image.query) that theirs replace later.
2. Audience: who uses this, what do they care about?
3. Use: the ONE action the design should drive.
4. Tone: pick an extreme (editorial, brutalist, soft, utilitarian, luxury, playful, technical, austere); "clean and modern" is not a tone. Plus the vibe in 4-8 words and an anchor colour if any.
- "Go ahead" (or a skipped field): infer, state the inferences in one line at the top of the reply, no follow-up questions.
- Facts are never invented: a number, quote, logo, testimonial count or case study not given is ABSENT. A picture not given is a stand-in in a named slot. Same for prices, dates, addresses, person names.
- Genre silently (genres.md): AI/generative/music/video/dark -> atmospheric; SaaS/enterprise/API/dev tool/B2B -> modern-minimal; playful/friendly/soft/kids/games/community -> playful; else editorial.

## 2. Shape: design the page, then name it
- Material inventory in one line: REAL (every concrete thing supplied: name, claims, numbers, places, dates, images), PICTURES (what is shown and where each comes from: the user's, built product mockup, image.query stock), ABSENT (proofs it will not have: logos, quotes, metrics). A design with pictures leads with them; a design about words leads with type and facts.
- The job: what the visitor comes to do (subscribe, book, visit, attend, buy, try, sign up, hire, join, listen). Read that job in anatomy.md: where the action sits, the category's own sections, how it ends. Build from that anatomy, never from the default run of figure row + three steps + email band.
- Then design the page: its shape (shapes.md is a vocabulary, not a menu; design first, then name the shape), how it opens, each section's content and composition, nav, footer, what carries the hero.
- Mirror test and signature: see shapes.md.

## 3. Direction
First match wins:
1. The user named a theme/look or a reference -> build that.
2. The user asked for custom ("bespoke", "no theme", "a world of its own") -> genres.md, section CUSTOM.
3. Otherwise decide the direction yourself from the brief, the genre (genres.md) and the current look of the subject's category (trends.md): palette, two type families, radius, surface. Prefer what a real business in this category would ship and a client would accept; an unusual look needs a reason in the brief. Say which and why in the Picks. A direction is a material (palette balance, type voice, surfaces), not a plan: it never sets what the page contains or in what order. Where it conflicts with the user's words, the user wins.
- The drawn nav/footer/hero are starting points: swap one that does not fit the subject (a search-led bar for a small shop becomes a plain link row) and say so in the Picks.
- Fonts missing in figma_fonts: map by class (grotesk-sans -> Inter or the nearest sans from the list, roman-serif -> a serif from the list, mono -> a mono from the list) and say so.

## 4. The Picks block (post once to the user, before building)
The run's only recital of decisions and the user's redirect window. Short:
- Shape: name + job + where the action sits
- Look: name, palette in words, type voice, radius
- Hero: what it leads with, layout
- Signature: the one thing a visitor remembers, shown on the first screen
- Sections: the list in order
- Material: real / pictures / absent
Then build without waiting, unless something blocks. Do not restate the plan twice.

## 5. Build
- Styles first: figma_styles (colors, texts, variables) from the chosen tokens, then `style:<name>` everywhere. Save direction and tokens in "notes" (D1c).
- Hero first: nav + hero only in one figma_create. figma_screenshot it and review cold: is the headline, one sentence and the primary action visible on the first screen (desktop frame ~1440x900)? Does the signature show? Fix before continuing.
- Then section by section, each with `parent` = the page frame id, one section per call (edits.md). Screenshot after each or every two.
- One idea per screen, set big. Hero: headline of 7 words or fewer, one sentence of 12 words or fewer, 1-2 actions. 6-9 sections including hero and footer (5 on a thin prompt), about 80 words per screen, about 450 visible words in total. Each section is a piece of the category's own content in a composition with mass (D8a). Fullness comes from scale and pictures, never from more words.
- Make sections unusual wherever the content allows, as many as fit, each invented from its own content, never a repeated arrangement: composition.md (the idea, no recipe).
- Show, do not describe: the user's pictures first, then the product built from frames (mockup), then image.query photos. Pictures take at most a third of the page below the hero; never two photo-led sections in a row. No drawn illustration filler, no empty gradient wash, no invented figure.
- Page invariants: one primary button style, one container width, one column gap below the hero, one radius per nesting level, no more centred heading groups than left-aligned ones.
- Type and colour: the chosen faces, two families at most (three with one outlier role); body 16+; headings one weight and one colour (no single italic or coloured word inside a roman heading); labels are the body face a step smaller, sentence case, no eyebrow, no tracked capitals as label style.
- Never: a purple-to-blue gradient, a card inside a card, an emoji as icon, a drawn browser/OS window, middle-dot-joined meta strings, arrows glued to link text, decorative status dots.
- Missing facts (hours, address, dates): at most two visible slots, named in the close; never made up.

## 6. Component scope
The prompt names one element (button, input, card, modal, nav, footer, tab strip, chip, "just the X"; two signals = component; ambiguous like "a pricing section": ask "one card or the whole page?", default component). Then: keep pre-flight, the ask (once), existing tokens (else a dealt direction), the two-family rule. Skip shape, nav/footer, hero, imagery, multi-section build. Build ONE frame, as a component (figma_componentize) with variants when states are asked (default, hover, focus, active, disabled, loading, error, success as component variants; see components.md).
## 7. App screens
A dashboard, admin, settings, tool: a screen someone works in. No hero, no shape from shapes.md, no stand-in photos, no word budget. The tool disappears into the task.
- The direction lends palette, faces, radius, surfaces; never layout or ornament. One family is often right; a fixed type scale at ratio 1.125-1.2; no display face on labels, buttons or data.
- Colour restrained: accent marks the primary action, the current selection and state only; a second neutral carries sidebars/toolbars/panels.
- Shell: a top bar; a sidebar only past ~7 destinations. Standard patterns (tabs, breadcrumbs, command palette) beat invented ones; a modal is the last answer.
- Density is the design: controls 32-40 high (44 for touch), tables before cards, one container recipe.
- Every region that loads data has four states: loading (skeleton in the shape of what comes), empty (what belongs here + the action that fills it), error (what broke, what to do), full. Draw the full state and at least empty for lists; extra states as separate named frames (D12).
- A stat is a figure and a label (tabular, no icon tile, no gradient, no trend arrow nobody measured). Figures are the product's own.
- Signature still owed: the one object the tool is known by (the ledger, timeline, queue), not a greeting above four stat cards.

## 8. Fast mode
The prompt says quick, rough, prototype: treat as "go ahead", narration of three lines at most, fewer sections (4-5), skip review rounds beyond one screenshot check. Not relaxed: real facts, contrast, styles, no overflow.

## 8a. Components (before the sweep)
- Every block that appears 2+ times (cards, list rows, chips, buttons, FAQ items, reviews, steps, stat blocks) becomes ONE main component in the top-level "Components" frame plus instances in the design: figma_componentize on the repeated frames (components.md). The design contains instances only.
- Build repeats with identical structure so they can be componentized; a last item that drops a divider or a state changes the structure, so give that difference as an override or a variant instead.
- Interactive elements are Component Sets with states (one figma_variants call each), never loose frames: buttons (Type x State=Default/Hover/Pressed), tabs and segmented switches (Active/Inactive), accordion rows such as FAQ (Closed/Open), toggles, chips, form fields. Name the variants with property pairs ("Type=Primary, State=Hover"), name the text layers ("Label", "Title", "Answer") and use them as overrides, combine_variants with Default first, then set_interactions (hover and press return on release, click is persistent). Replace every loose copy on the page with an instance of the matching variant.
- After componentizing: check the instances (height "hug" for content-sized blocks, names kept, a different colour variant such as a dark review card is a variant or a local override) and screenshot again.

## 9. Sweep
1. figma_screenshot: long pages with `tiles:N` (read each slice), details with `region:[x,y,w,h]`. Look for: clipped or overflowing text, empty areas, misaligned edges, a section that repeats the previous composition, weak hierarchy, text on photos without overlay.
2. Read the "issues" lint list from every figma_create/figma_edit: fix real problems (overflow, contrast, text under 12, off-grid spacing, default names, tap targets), accept deliberately otherwise.
3. Tiers (taste.md): fix every hard-floor item; fix or consciously accept every reflex item; answer finish items. Do not claim a pass you did not verify.
4. Budget: one batched inspection, one fix batch, at most one confirming round. Then stop.

## 10. Close
Reply with: the Picks (short, updated if the build changed them), what was left as slots (each slot with its size and what belongs there), and the ONE piece of material that would most improve the design (a real photo, a number, a quote with a name). Remember in the conversation which shape, theme and hero you used, so the next build in this chat differs: do not repeat the same shape + theme + hero + nav combination.

## 11. REDESIGN / AUDIT of an existing frame
Only on an explicit request (redesign, audit, restyle, polish). A redesign is a build whose material is the design that exists.
- Look: figma_node and figma_screenshot of the target (and neighbours), then give a read in four lines: what it is for (audience, one action); what works and stays (at least one thing); what reads as generated (worst tells); what is broken.
- AUDIT: report only, change nothing. List findings by tier with node ids, the read, the lightest depth that settles them, what only a deeper one would.
- Keep: every fact, claim, name, price, date and quote; links/destinations (links -> n/a in Figma: just keep labels and targets as text); the brand when one exists (read its values from the file, never from memory); existing components and styles. Keep what exists unless asked. Nothing is added: no section, claim or picture the design lacked, beyond what the user hands over. Figures and quotes found are the user's: carry them as found and list them for verification.
- Words: wording that breaks a copy rule is tightened from facts already present; list every changed line before and after. An eyebrow is not just deleted: the plain label becomes the heading.
- Depth (name it in the Picks): full (content stays; system and composition change), restyle (layout stays; colour, type, radius, shadow change; only when asked "keep the layout"/"reskin"), polish (system and layout stay; fix only what the rules name). Depths do not blend; a polish that finds the concept wrong says so and recommends full.
- Ask once instead of step 1: what must stay; what is wrong, in their words, and the feeling wanted; anything new to show. Or "go ahead" = full.
- Rebuild: figma_create with `replace:<id>` (or `after:<id>` to put the new version beside the old, safer when unsure), or figma_edit for restyle/polish. More than one screen: lock the system once (figma_styles) and share it.
- Hand off: Before, After, Kept, Changed, Dropped (none, or listed with reason), Yours (claims kept as found, lines reworded).
