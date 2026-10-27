Adapted from Hallmark (MIT, Nutlope / Together AI).

GENRES and the CUSTOM route. A genre is a register: palette, type, surface and copy tendencies. A chosen direction or a locked file system overrides it where they disagree; the user's own words override both.

## Routing (silent, from the prompt)
- atmospheric: AI tool, generative, music, video, voice, dark, moody, cinematic, nocturnal.
- modern-minimal: SaaS, enterprise, API, platform, developer tool, infra, B2B, dashboards, billing; also a named brand colour with a restrained prompt.
- playful: playful, fun, friendly, soft, kids, games, community.
- editorial: everything else; the default; holds most consumer and family prompts (a consumer prompt without a playful ask stays editorial). Content-led: portfolios, manifestos, type specimens, agencies, magazines, podcasts, brand stories.
- Once a direction is chosen, its genre wins. Two non-default genres fire: ask one either-or in the single ask message, or on "go ahead" pick and say so.

## atmospheric
A canvas first, then a tool.
- Palette: dark, deep tinted surfaces (not pure black); ONE hue, used for the canvas treatment, focus/active states and small tags; never for display text. Raise cards by lightness steps of the surface (page, raised, raised more), not hairline borders. A light-paper exception is possible if the direction says so; never light sections sneaking into a dark build.
- Type: display up to ~96 px when the type is the visual; centred hero is normal when type carries it; with a visual, the visual stands beside the text.
- Surfaces: at most two soft radial glows (ellipse with radial gradient or layerBlur) each 20-30% of the canvas, static; one glass licence: the nav pill with backgroundBlur over the canvas; pill controls with an accent fill.
- Copy: direct, slightly poetic, specific ("Make a house song about quitting your job").
- Refuse: a coloured glow shadow, a spotlight behind the hero, a mesh gradient, a third hue, glass cards/panels, gradient text.
- Chrome: floating pill nav, edge-aligned bar, a statement footer. Dense link furniture fights the register.

## editorial (default)
Content-led, left-biased.
- Palette: warm or cool tinted paper and ink, never pure white/black; one accent hue held to a small footprint.
- Type: serif or characterful display set large enough to hold its screen; italics allowed inside running body copy (not one italic word in a roman heading); asymmetric column ratios (2:5, 3:7).
- Surfaces: hairline rules (1 px strokeSides), fleurons, drop caps, double rules; photographs captioned with facts; edge-aligned headlines; a single highlight band behind a phrase.
- Copy: specific, hand-set, slightly literary; verbs over adjectives.
- Refuse: gradient-filled pills, a centred-everything hero (unless the material is a centred bill), glass (the medium is paper), pure black/white.
- Chrome: masthead, quiet edge-aligned bar, colophon, letter close. A marquee footer or floating blur pill fights the register.

## modern-minimal
Minimalism with conviction, not the absence of choice.
- Palette: pure white paper and zero-chroma neutrals are allowed; accent is ink, or one hue on the focus ring and one control; colour floods only when the direction declares it.
- Type: large tight-set display (letterSpacing about -2%), one clean sans family; refuse an italic serif body, monospace label voice, and a code/terminal register as decoration when the product is not a developer tool.
- Surfaces: two-column heroes (title and line beside a big visual slot), wide product visuals, thin visible 1 px borders (not hairline-everything), 8 px radius, very subtle border; pill controls with an ink-filled primary beside an outlined secondary.
- Copy: declarative, specific, technical; "Built for X" only when X is concrete.
- Refuse: asymmetric prose columns, drop caps, ornament, gradient text, glass.
- Chrome: dense balanced bar, floating pill, mega-menu, search pill, or vast space between a wordmark and one action.

## playful
Alive rather than tidy.
- Palette: soft, low-chroma by default; a declared full-palette or drenched direction may use 3-4 named hue roles, each with a job. Refuse saturated consumer pinks and violets without such a declaration.
- Type: rounded or friendly faces from figma_fonts; no comic-style faces.
- Surfaces: rounded (12 px cards, 8 px inputs, pills), soft offset shadows ({x:0,y:6,blur:0..16}), tinted alternating bands; a hard-offset shadow only when the direction declares it as its material; one character moment (sticker, mascot, rotated photo); an emoji only inside a sentence, never as icon.
- Copy: warm, direct, specific; no quirk for its own sake.
- Refuse: glass, gradient text, sticker-style pills on every element, decorative status dots.
- Chrome: heavy slab bar, dense bar with rounded knobs, banner, marquee footer; a solid pill is fine, a masthead is not.

## CUSTOM route: a world of one's own
Taken ONLY when the user asks ("custom", "bespoke", "no theme", "derive it", "a world of its own"). Silence deals a direction. Does not apply when the user names a theme (then that theme plus a mood note), when the file has a locked system or a real brand (inherit it), for a single component, or in fast mode.
- Everything is yours: no preset look, no shape list, no palette recipe. The rules of taste/hierarchy/craft (craft.md, taste.md) still bind.
- Aim for the design a lead brings to a client who rejected every template. Unique is specific: every large decision belongs to THIS client (subject, place, materials, numbers, how its people talk). Put the nearest competitor's name on it; if it still works, keep going. Clean is exact, not empty: a visible system (a few type sizes far apart, one spacing rhythm, aligned edges), nothing without a job, one strong thing per screen. Full is the floor: a whole page (6-9 sections), each built around something worth looking at, never a section that is a heading and a paragraph.
- Derive it:
  1. Learn the subject: what only this client has: the name and its meaning, the place and how it looks, what it does in one verb, real numbers, rituals, what its world makes or wears, its customers' words.
  2. Set aside the page you would make anyway and its obvious twist: split hero with picture right, three numbered steps, label/value rows between hairlines, a closing band with a form, a dark footer under a huge wordmark, small grey labels, pale ground with one careful accent. Two of those in one plan = the plan is the template.
  3. Sketch three directions as far apart as possible, two lines each (idea, how it is built, how it looks). Build the one a design lead would fight for, not the safest.
  4. One idea the whole page grows from, true of this client only; it can live in type, colour, structure, or how the product is shown. An idea that stops at the hero is a template with a good hero.
  5. Let the content build the structure: decide what a visitor must see, understand, do, in what order, then give each part the form that shows it best.
- Spent (refuse on sight): cream/beige paper + high-contrast serif + clay accent; near-black with one neon accent; pale ground with one timid accent; purple into blue; a hue picked for the category (blue for software, green for health); the fonts you reach for first; centred head over three cards, or hero-features-CTA-footer; a subject painted on instead of known (paper grain, stamps, dials, bevels, engravings as ornament); eyebrow, tracked capitals, one coloured word in a heading.
- Pictures only when the subject has something to show; each passes the deletion test (remove it and the page loses a fact). A service or an idea can be carried by type and colour alone.
- Words: the owner's own nouns, a fact in every headline, no line a competitor could use unchanged, about 80 words a screen; read the headlines alone: they should tell this client's story. Avoid two clipped fragments in a row.
- Mechanics in Figma: figma_fonts, pick a display face that is not your reflex choice (two families, three with an outlier for one role); define all colours and text styles with figma_styles first; Picks block rows become Idea (one sentence) and Look (ground, ink, accent, faces, each with where it came from). Remember the idea and look in the conversation so the next build differs.
