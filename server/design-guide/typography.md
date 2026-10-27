Adapted from Hallmark (MIT, Nutlope / Together AI).

# Typography, colour, charts

Complements craft.md (D2, D5, D6). Sizes are Figma px at a 1440 frame.

## Fonts

- Call figma_fonts before choosing. Only listed families exist; a missing family silently becomes a fallback. Say in your reply which family you substituted.
- At most two families: a display face and a body face (one family may do both). A third is one outlier with exactly one role (wordmark, headline figure, or mono for code and measured figures). Weights: three at most across the page, picked as extremes (regular beside bold, or light beside heavy).
- Inter, Roboto, Open Sans, Poppins, Lato, Montserrat, system fonts are the first answer of every model: fine for body or app UI, a reflex as the display face. Choose the display face by the class the idea calls for, from the list figma_fonts returns:
  - roman serif (editorial, culture, food, craft); high-contrast serif (fashion, luxury); slab (workshop, print);
  - grotesk sans (product, tools, modern); geometric sans (friendly tech); rounded sans (kids, community);
  - condensed/heavy (sport, posters, events); mono as display (developer tools only);
  - pixel/handwritten only when the brief is that world.
- Class mapping when the ideal face is missing: grotesk-sans -> Inter or the closest grotesk in the list; roman serif -> a serif from the list (Playfair/Lora/Merriweather/Source Serif style); high-contrast serif -> the most contrasty serif available; mono -> a mono from the list (JetBrains Mono, IBM Plex Mono, Roboto Mono, Space Mono). Never fake bold or italic: pick a family that has the weight you need; use "regular|medium|semibold|bold" only.
- Pairing: contrast in class: serif display + grotesk body, or one family at two extremes. Two similar sans look like a mistake.
- The wordmark/logo in nav and footer may take another face than the body (the outlier's one role); a wordmark in the body face at semibold is the undesigned default.

## Scale and hierarchy

- Build the scale on about 1.25 steps from a 16 body. At 1440: hero head 84 (long headline 60), section head 52, item title 25, lead (the one line under a head) 21, body 16, label/caption 14. A section head under 40 is the most common reason a page looks unfinished. Hero head about 1.5x the section head, section head about 2x the item title.
- Hierarchy beyond size comes from weight and colour (ink, body, muted). Heads: one weight, one colour.
- Display: letterSpacing "-2%" to "-4%" on a regular-width face, 0 to "-1.5%" on a condensed or very heavy one (letters must not touch); lineHeight 1.0-1.15 x size, tighter as it grows (1.2 on a display head reads as default). An uppercase head that can wrap: at least 1.0.
- Headline length: 20 characters or fewer, full display size (a single word may go larger); 21-50, display; 51-90, the long-head size (60) or split at the sense break with \n; over 90, rewrite. Check the break in the screenshot; on mobile frames it often lands badly.
- Heading measure: set w or maxW so heads wrap near 20ch (H1), 30ch (H2), 40ch (H3); never let a head run the whole 1312 column.
- Body: 16 minimum, lineHeight 24-26 (1.5-1.65), measure 45-75 characters: numeric w about 480-640 for 16-18 px text. Prose pages: lineHeight 1.65-1.75, 60-75 characters. Never all caps, never tracked past 5%.
- Space above a head at least twice the space below it (other gaps: layout.md).
- Labels, captions, table heads, tags, chips, nav links: body face, one step smaller (14, or 12-13 for dense UI), sentence case, letterSpacing 0, never textCase "upper" (see taste.md). Mono only for code, figures, measurements, or when mono is the design's material. Minimum sizes: running text 12, functional text 11.
- Mixed emphasis inside a sentence (price "$29 / month", a bold word in a paragraph, a link) is one text with spans; do not stack separate text nodes.
- Curly quotes, a real ellipsis, no em/en dashes.

## Numbers and figures

- Figures that compare (prices, stats, table columns): same font and size within the column, right-aligned, tabular figures if the font offers them (otherwise pick a face whose digits are even).
- A figure at display size needs its unit and what it counts beside it, in a smaller line. A bare number is a headline only if the design is built around it and the user supplied it.
- Stats row: three or four real numbers at the long-head size (60), labels beneath, parted by vertical hairlines (no padding before the first, none after the last). Only figures the user gave.

## Colour

- Roles, not a palette: paper (page), ink, 5-9 tinted neutrals between them, one accent with a paired accent-ink colour for text on it, a focus/active colour on the accent hue. Tint every neutral slightly toward the anchor hue; pure black/white only as the very lightest paper in minimal designs.
- Light paper: very light, slightly tinted (L about 92-98); light ink: dark, tinted (L about 16-24). Dark paper: L about 12-18 tinted; dark ink L about 88-96.
- The accent is a signal under 5% of the screen (active nav item, primary button, link, the one argued chart series). Postures, chosen on purpose: restrained (above); committed (one colour carries 30-60% of the surface, accent stays a signal); full palette (three or four named roles each with a job); drenched (the surface is the colour, ink and rules derive from it). A declared surface colour is not accent footprint.
- Contrast: body 4.5:1 (aim for 7), large text, icons, field edges 3:1. Every dark surface swaps its text colour; no grey text on coloured fills.
- Bans: purple-blue/purple-pink/cyan-on-dark gradients, gradients past three stops, glow shadows on dark, red and green as the only signal. Define colours in figma_styles and use `style:<name>`.

## Dark mode (only when asked for both modes, or when the design is dark)

- A second, equally designed rendering, never an inversion. Build the dark version as a separate frame ("Home / Dark") with its own tokens (figma_styles variables with modes if the file uses them).
- Paper L 12-18 tinted, never #000; ink L 92-96 tinted, never #FFF. Elevation is lighter: each raised surface about 3% lighter than the one under it; cards are lighter than the canvas, never darker (a darker card reads as a hole).
- Accent: lower saturation a notch, raise lightness 5-10 points (saturated light-mode accents glare on dark); re-check text on accent at 4.5:1 / 3:1. The hue never changes between modes.
- Hairlines around L 26-34, visible against raised surfaces too. No drop shadows (they read as glow); use lighter surfaces or a 1px inner hairline stroke.
- Headings all in the ink colour. Photos: pick ones that hold up on dark, or set a light one on a raised surface.
- Light text on dark looks heavier: regular where light mode used medium.
- Charts on dark: series colours lower in saturation, higher in lightness; gridlines from the dark hairline colour.

## Charts (the chart block and anything drawn)

Use the `chart` block; never draw charts by hand. Choose the form first:
- one value -> a stat tile (large figure + worded qualifier), never a one-bar chart;
- 2-5 values compared -> a stat row or `hbar`;
- a series over time -> `line` (or `sparkline` inside another component);
- more than about 7 categories -> a `table`, not more colours;
- parts of a whole -> a stacked `hbar` (stacked:true); avoid pie, donut and gauge unless the user asks.
Rules:
- One series argues in the accent, everything else neutral (muted). If every series is loud, none is. Several series: a lightness ramp on the accent hue in a fixed order; a second hue only in a full-palette design, from its declared roles.
- Bars: baseline at zero always; at most 24 thick, 2-4 gaps; round only at the data end (2 max). Lines: 2 px; markers only at annotated points. Sparkline: no axes, no grid, no second colour; a fade-fill to transparent is the only gradient allowed near a chart.
- Grid: 3-5 horizontal hairlines in the hairline colour, solid not dashed; axis line = first grid line. One y-axis only; two units -> two small charts. No shadows, 3D or gradients in marks.
- Labels and values in ink/muted, never in the data colour; identify a series by a swatch next to its label. Numbers tabular and right-aligned.
- Real numbers or a placeholder; totals add up; annotate a truncated axis.
- Dashboards: fewer, truer figures: one hero stat tile, one supporting chart, one table. A wall of KPIs and gauges is the tell.

## Texture (only what Figma does)

- Only when the direction is print-lineage (risograph, letterpress, ticket stock, film); one artifact family per design: grain, halftone dots, or misregistration, never two.
- Grain: a `pattern` fill (noise-like tile) on a frame at opacity 8% or less page-wide (15% on one plate), 5% or nothing under body text; not animated. Halftone: a dot `pattern` on plates and bands, never under or overlapping text, dot in ink or one spot colour. Misregistration: duplicate one focal word twice behind it offset 1-3 px in two spot colours; one word, in the hero only.
- Measure contrast on the textured result. Never add texture because the page felt flat; fix the composition.
