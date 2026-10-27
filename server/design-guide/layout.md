Adapted from Hallmark (MIT, Nutlope / Together AI).

# Layout: canvas, sections, hero, page

Complements craft.md (D3, D4, D8, D8a). A page looks made when every screen holds one idea at the right size. Numbers are for a 1440 x 900 first screen.

## Canvas

- Root frame 1440 wide, layout vertical. Content column about 1312 wide: side padding 64 on every section. (This is the default for new pages; craft.md's [80,120] padding is the older 1200 column. Use one value on EVERY section, and match the file's existing pages if it has any.) In a wider frame (1920) the margins grow, the content width and the grids do not.
- Twelve columns inside the content, gap 32: one column 80, four 416, six 640, eight 864. Every section places its parts on these columns, so left edges line up from nav to footer.
- Each section: an outer full-width frame owns the background and the vertical padding; an inner frame holds the width and the horizontal padding. A full-bleed band changes the fill and keeps the same inner column.

## Sizes

- Type sizes: typography.md. Section head under 40 looks unfinished.
- Head and its line 16-24 apart; head block to content 48-64 (40 in tight compositions); grid items 32 apart across and 48-64 down; a card or well takes 32-40 padding.

## Rhythm between sections

- Gap between sections 120, 144 or 176, mixed; a tinted band takes 120 padding top and bottom. Mobile: 56-96.
- Space is earned by mass: a 144 gap frames a 700-tall section and is a hole under a 200-tall one. An empty-looking page wants more mass, not a smaller gap.
- Six to nine sections including hero and footer (five on a thin brief, never fewer).
- Pace: a dense section (grid, table, bento, index) is followed by a quiet one (statement, showcase); the page ends on a real close.

## A section

A section is one piece of the page's content shown at its best (the menu, the lineup, the product at work, the room, the price). Decide the content first, then the composition. Never more than two neighbours with the same skeleton: head-then-block, head-then-block reads as a template however good each block is.
- Head block: a heading of six words or fewer at section size, at most one line at lead size beneath it, on columns 1-6 or 1-7, or split (head on 1-5, the line on 7-12, baselines aligned). Centred only over a symmetric body, and never more centred head blocks than left-aligned ones. A section whose content names itself (a menu, a timetable, a list of issues, the product's own screen) may skip the head block.
- The body fills the width: its widest row reaches ten of twelve columns. A narrow text block with the empty right half is the sparse page's signature: pair it with a visual, split it, or set it as a statement.
- The body has mass: a visual 360+ tall; a set of three or four items across; a list or table of 3+ rows across ten columns; a statement at section size or larger. A head and a paragraph are a head block, never a section.
- A split balances: text and visual centre on each other within 60.
- Height follows content: usually 520-900; under 360 only for a band, at most twice a page.
- Fullness comes from scale and pictures, never from more words. Fix a sparse screen with a bigger visual, a wider body, a head at section size, or by merging sections.

## Opening a section (instead of an eyebrow)

Ask: what does the reader not yet know? If nothing, open with nothing. Ways in:
1. Nothing: air above, the heading flush.
2. The heading names its subject in the first two words (usually best).
3. A lead-in in a heavier weight inside the paragraph (span), never on its own line.
4. A drop cap, one per page.
5. A rule that does more than rule: hairline, double rule, colour edge or pure gap; varied seam to seam.
6. A numeral at graphic scale (120-220 px), one per page, only if the number is real and is the point.
7. A real numbered list when the sequence is genuine (numeral beside each step title, not a "01" label above a head).
8. A caption below the content instead of a label above.
9. A change of fill: the band's edge is the break.
Two moves may share a section; three is noise.

## Compositions

Layouts, not components; build each from this brief's content. A page uses three to six different ones and never the same one twice in a row.
1. Split: text block (head, line, two to four short facts or one action) beside a visual on columns 6-12 or 7-12, 440+ tall at 4:3-4:5 (portrait for a product). Swap the side at most once a page; change the ratio (5/7, 4/8, 6/6) between two splits.
2. Showcase: head block, then one visual across all twelve columns at 16:9-21:9, 560+ tall; below it at most two smaller visuals at 8+4 or 7+5, never three equal frames.
3. Grid: three or four items across (or 2x2): plans, products, dishes, each with a photo, large figure or large title, then one line; equal heights, aligned tops, 240+ tall. No empty frames, no icon tiles over headings.
4. Bento: four to six tiles in mixed spans (8+4 over 4+4, or 7+5 over 5+7), rows 280-360, at least two tiles with a visual, one clearly the lead.
5. Rows: three to five full-width rows parted by hairlines, 72-120 tall: title on columns 1-5, its line or figure on 6-12. A head block may sit on 1-4 beside rows on 5-12 (FAQ, index, timeline, price list).
6. Table (`table` block): full width, 4-5 rows of 56-72, the naming column one weight heavier.
7. Figures: three or four real numbers at long-head size, labels beneath, vertical hairlines between; only figures the user gave.
8. Steps: three or four stages across, each a numeral, a title and a line, with a visual where the material has one. Only for a process the visitor actually goes through.
9. Statement: one sentence over eight to ten columns, section size up to display size; once a page.
10. Band: a full-bleed change of fill holding whatever the job wants there: the next booking times, the buy box, the store buttons beside a screen, the next date and address. Not an email field by default.
11. Form: fields on six or seven columns beside the head block and two to four facts; one primary action.
12. Rail: a horizontal run past the frame edge, five+ items, the next one cut by the edge.
13. Switcher: two to five states as separate frames or a variant set (lunch/dinner, month/year); every state real.
14. Index: a dense list of the brief's own items with facts in columns, 6-20 rows, the lead row larger.
15. Schedule: time against place or day (acts and times, opening hours).
16. Offer: the thing for sale with what a buyer needs at the moment of buying: photo, options, price, action, one line of delivery or terms. Often the hero of a buy page.
Steps and figures appear on most generated pages; on a made page they are a choice. Never derive a figure from the brief ("365 mornings" from "every day").

## Hero

The first screen at 1440 x 900, and only the first screen. Pick a posture from the job and vary it between designs. Text beside a picture is the most common generated hero: take it only when the picture is the strongest thing the brief has.
- Settled: fills the screen under the nav; content centred in it; text on six columns, visual on the other six.
- Stage: fills the screen; text on five columns, a visual on seven at 60-75% of the screen height; may bleed off the outer edge.
- Banner: 50-60% of the screen; the first section shows above the fold (references, docs, utilities).
- Ledge: fills the screen; a tall field above with the headline resting at the base.
- Corridor: one centred column of about 44 characters, a larger-than-usual head.
- Poster: full-bleed photo or canvas, 100% height; text on its calmest part with room around it, low and left or centred, never squeezed into a corner; image overlay behind the text side.
- Counter: the action is the visual (subscribe field with the latest issue, booking times, buy box with options, download with the screen) set large beside or under a shorter head.
- Index: the content is the visual (lineup, menu, list of issues) as the lead with a small head above.
Rules:
- Centred in its screen: the space under the content is 1.0-1.5x the space above; the lowest content within about 160 of the fold. Spend spare height on a bigger visual or bigger type, never on copy.
- The visual is big: six or seven columns wide and 60% of the screen height or more (520 at 900), or a portrait object at 75% on four or five columns; its centre within 60 of the text block's centre. Text and visual stand 48-120 apart.
- No visual: the head grows to display size across eight to twelve columns, or the posture is Banner.
- Text: headline 7 words or fewer, one sentence of 12 words or fewer at lead size, one or two actions. Nothing else.

## Navigation

One line, 56-80 tall, sized to the design's real destinations (not five fake links). Vary the form: edge-aligned (wordmark and one or two links or an action at opposite edges), a floating pill, a masthead (large centred wordmark over a rule), a slab (heavy full-width bar), a search-led bar, a banner over a bar, a three-part bar only for four+ real destinations. Text links share one weight across states. The logo/wordmark has a name like "Nav / Logo". Do not default to logo-left, links, button-right with a hairline.

## Footer

200-400 tall. Forms: a mast (wordmark large over the links), a statement (one closing sentence large, links beneath), a colophon (credits and address as one paragraph), a letter close (sign-off and date), index columns only for a hub with a real sitemap. A single line under a hairline suits a letter or manifesto. 

## The page

- The job decides the anatomy: where the action lives (hero, repeated beside content, at the close) and which category-native sections the page is built around (the menu, the lineup, the record, the issues). A newsletter puts the subscribe field in the hero and shows the issues; a restaurant shows the menu and the booking; a band shows the record and the dates. The look dresses that anatomy and never replaces it. Test: could this exact sequence of sections sit under a different business's name? If yes, it has no anatomy of its own.
- Order follows the argument, not hero / three features / CTA / footer. Lead with the strongest real thing after the hero.
- The close is the job: end on what the visitor came to do (booking times, buy box, store buttons, next date and address), or on the last strong section and the footer. An email field closes a page only when a mailing list is native to the job.
- Mirror a split once at most (no zigzag); one full-width visual at least on a product page; one or two bands. Photo share: imagery.md.

## Page invariants

One primary button style; one container width; one column gap below the hero; one radius per nesting level (inner = outer minus padding, at least 2 smaller); one divider language; one icon set; never more centred heading groups than left-aligned. Equal gaps between equal siblings.

Surface ladder (use the lightest that works): whitespace -> hairline (1 px) -> tinted well (no border) -> card (border or shadow, never both), kept for content that is independently interactive or of a different kind. Never a white card on a tinted page that has no reason for it, a card in a card, or a bordered box inside a well. Depth is weight and scale; at most one soft shadow per surface; elevated surfaces are never darker than their canvas.

## Responsive (separate frames, on request)

- Desktop 1440, tablet 768, mobile 390 are separate named frames ("Home / Desktop", "Home / Tablet", "Home / Mobile") built only when asked, reusing the same components and styles. There are no media queries.
- Tablet: grids to two columns, side padding 32, section gaps 80-96.
- Mobile: single column, side padding 16-20, section gaps 56-96, display sizes step down (typography.md mobile column), controls at least 44 tall, nav collapses to a menu icon or a bottom tab bar, every desktop sidebar or filter column becomes a menu or disclosure. Hero collapses to its content height; the visual follows the text and keeps its aspect ratio. Tables restack each row as a labelled block or keep the naming and action columns visible; ten columns on a phone is a redesign, not a squeeze. 
- Clickable text never wraps: shorten the label or collapse extra links into a menu.
