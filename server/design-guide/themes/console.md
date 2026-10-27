---
slug: console
name: Console
genre: modern-minimal
posture: restrained
display: grotesk-sans | Host Grotesk (medium) | figma: Inter medium
body: Host Grotesk | figma: Inter (measured values: Atkinson Hyperlegible Mono | figma: any mono)
photo: mono - black and white from #06080b to #eceff2, dark and close; radius 10, 1px #2d3135 edge, caption beneath
---
# Console
An instrument kept by careful people: graphite ground in three lightness steps, hairline panels cut from one surface, grotesk for what a person reads, mono for what an instrument measured. Amber is a person, cool blue is an instrument; nothing glows.

## Palette
- paper #0d1013 (ground) | paper-2 #15191c (panel) | paper-3 #06080b (deepest: code, logs, changed row, photos)
- ink #eceff2 | ink-2 #c3c8cc | muted #9da2a8 | rule #2d3135 | rule-2 #484e54 (selected row, trail spine)
- accent amber #f7b83d (a person: operator, deviation, current step, the one primary) | accent-ink #1c0e00 | soft #38280a
- cool #6ebcfc (an instrument: reading, trace, version) | soft #142e43
Balance: neutral graphite; amber and cool at equal weight; max two bands (paper-2 or paper-3), never an amber field.

## Type
- Display: Host Grotesk medium, hero 64-96, lh 1.04, ls -3%, sentence case; never bold.
- Body: regular 16-17, lh 1.55, muted; lede in ink-2. Labels/chips: medium 13-14, muted.
- Measured: mono regular/medium 14-15 for readings with unit, ids, diffs, timestamps (tabular); at display size it is the loudest thing; never for labels, heads or controls.

## Shape and depth (Figma values)
- Panel: 1px #2d3135 stroke, fill #15191c, radius 10 (controls 6); adjoining panels = one surface split by 1px rules.
- Depth = the three steps. No shadow, glow, bloom, gradient or texture.

## Controls
- Primary: fill #f7b83d, text #1c0e00, Host medium 15, radius 6, padding [12,20]. Secondary: 1px #484e54 outline on #15191c. Chip: 1px rule, r4, soft tint. Input: #06080b, r6.

## Range
- Diffs: two versions in one panel, +/- gutter in ok and bad, changed rows on soft tints, reason in words beside.
- Readings: one value at display size in mono, the struck old value above, who/when/why beneath in amber, cool, ink.
- Trails: audit rows on a 1px rule-2 spine: version, person in amber, time in cool, reason in ink; works for timetables and changelogs.

## Voice
- Lab notebook: value, unit, time, who signed; a number without a unit or time is nothing.
- Never: swapped meanings (amber reading, cool deviation); floating card with shadow; a third signal or colour photo; mono on labels/buttons.
