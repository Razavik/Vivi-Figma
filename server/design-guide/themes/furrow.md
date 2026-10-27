---
slug: furrow
name: Furrow
genre: modern-minimal
posture: committed
display: grotesk-sans | Red Hat Display | figma: Inter (semibold)
body: Red Hat Text | figma: Inter; figures Red Hat Mono | figma: any mono from figma_fonts
photo: natural, slightly desaturated; no overlay (ink #14110F at 0.1 only for text legibility)
---
# Furrow
A working-records voice on warm manila paper with near-black ink, ruled lists, figures with units and moulded keys. Tangerine is ear tag and baler twine; green is what is in date.

## Palette
- paper #F5F1EA (page) | paper-2 #FFFDFA (cards, fields) | paper-3 #E9E4D9
- ink #14110F | ink-2 #2C2825 | muted #58514C | rule #DBD7CE
- accent #FC6B33 (tangerine: primary, selected tab, open pin; a FILL with ink on it, never text colour) | accent-ink #14110F | accent-soft #FED8C4
- green #246E3A (in date) | green-soft #D3EDD7 | focus #D84A00
- map: contour #A67C5C, water #628699, hedge #337344; notebook grid #E2DDD4 / #D3CDC1; sheet #FEFDFA
Balance: mostly paper and ink; tangerine under ~8% of a screen, green only for status.

## Type
- Display: Red Hat Display semibold, hero 64-96, lineHeight 1.0, letterSpacing -3.5%, sentence case.
- Body: Red Hat Text regular 16-18, lineHeight 1.55, muted; row titles medium.
- Labels/chips: Red Hat Text medium 12-14, sentence case, untracked; never uppercase, never mono.
- Figures: Red Hat Mono 400/500, one step smaller, only for dates, times, tag numbers, doses, batches, hectares.

## Shape and depth (Figma values)
- radius: card 10, notebook entry 14, keys/chips 6.
- rules: 1px ink over a list, 1px #DBD7CE between rows, 2px ink over a total.
- shadow: card {0,1,2,#14110F14}; lifted entry {0,14,28,#14110F47} plus 1px ink stroke. Only entries and the white sheet lift.
- texture: notebook grid = 8px pattern of 1px #E2DDD4 lines on paper-2. Survey map = thin contour `shape path`/`line` in #A67C5C, water #628699, holding edged in 2px tangerine; only inside the map frame.

## Controls
- primary: fill #FC6B33, text #14110F, radius 6, h 48, padding [0,20], medium, 1px stroke #D2602F.
- secondary: fill #FFFDFA, 1px #DBD7CE stroke, radius 6, h 48.

## Range
- Records pinned on a generated survey map (disc, diamond, triangle pins; ink time tags; the open one tangerine).
- A notebook card: ink head with kind and time, cells on the 8px grid, ink hairline dividers, 56px step keys.

## Voice
- Plain and unit-bearing: 3.6 ha, 10 ml, 28 days; pound sign on prices.
- Never: tangerine as type; map tiles, satellite photos or pin-drop icons; grain or creases outside the map; mono on labels, chips or heads.
