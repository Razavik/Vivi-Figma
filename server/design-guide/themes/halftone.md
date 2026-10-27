---
slug: halftone
name: Halftone
genre: playful
posture: committed
display: slab-serif | Ultra | figma: heaviest slab serif in figma_fonts (e.g. Roboto Slab/Zilla Slab black), else a bold serif
body: Chivo | figma: Inter
photo: natural, vivid, bright full colour (the page's only full colour); no overlay, 1px ink hairline, square
---
# Halftone
A loud one-colour print voice: butter-cream stock, brown-black ink, a fat slab for heads, 3px ink rules and one vermilion that prints solid on controls and as a dot screen on a band. Feels screen-printed because there is one ink and its dots fade from solid to nothing.

## Palette
- paper #F9F3DB (page) | paper-2 #F1E6C4 (wells) | paper-3 #E5D5AB
- ink #2D160F | ink-2 #492D24 | muted #694A3D | rule #D2C2A6
- accent #D01A00 (the spot: controls, dot screen, field band, big figures) | accent-deep #A90000 (pressed spot; spot type under 24px) | accent-ink #FAF5E5 | focus #A90000
Balance: cream and ink, spot on controls and one field band; max two bands (paper-2, spot field with cream type, or ink with cream text).

## Type
- Display: Ultra-style slab, one weight (regular), hero 72-120, lineHeight 1.08, letterSpacing 0.5%, sentence case, one colour per head. Numbers 200px+ may print solid in the spot, letterSpacing -2%, lineHeight 0.9.
- Body: Chivo regular 17, lineHeight 1.55, ink-2; bold on controls and names in a label panel.
- Labels/captions/table heads: Chivo medium 13-14, sentence case, untracked. No mono.

## Shape and depth (Figma values)
- radius: buttons and inputs 3, chips 999, wells/tags/photos 0. Shadow none.
- rules: 3px ink across the top of a section/table/list; 1px #D2C2A6 between rows.
- well: paper-2 fill, 3px ink stroke, square, nothing boxed inside.
- texture: dot screen = `pattern` fill (or ellipses 3px on a 12px cell) in #D01A00, faded solid-to-nothing by a gradient mask; one screened field per section, never under type or photos.

## Controls
- primary: fill #D01A00, text #FAF5E5, radius 3, h 52, padding [0,24], Chivo bold; pressed #A90000.
- secondary: no box, 3px spot underline, ink text.

## Range
- A single number as a poster: 240px+ in solid spot on cream, unit and one line beside it in ink.
- A nutrition-label panel: 3px ink rule over full-width rows, name in bold, value in the slab, hairlines between.

## Voice
- Like a label: fruit, calories, can size, box price. Blunt, sweet, specific; never lifestyle.
- Never: a second ink or a blue link; a gradient that is not dots; dots under type or photos; faux-bold slab, soft shadow or rounded well; small spot type on cream.
