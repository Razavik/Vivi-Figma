---
slug: broadside
name: Broadside
genre: editorial
posture: committed
display: display-condensed | Six Caps (Bevan slab for section heads) | figma: tallest condensed caps in the list (Bebas Neue/Oswald), else Inter extrabold uppercase; Bevan -> heavy slab
body: Archivo Narrow | figma: a narrow sans from the list, else Inter
photo: duotone ink #15100e on stock #ece4d0, high contrast; square, double-rule frame, no type over it
---
# Broadside
A printer's bill: grained buff stock, near-black ink, tall wood capitals fitted to the measure, narrow small print, rules at one point or five, one vermilion. Loud because capitals are tall and rules heavy, never because anything is drawn.

## Palette
- paper #ece4d0 | paper-2 #e2d8c2 | paper-3 #d8cdb4
- ink #15100e | ink-2 #332c29 | muted #584e45 | rule #b7ad9a
- accent vermilion #c12b09 (one display line or figure per screen, or one band) | accent-ink #f5f0e3
Balance: buff and ink; vermilion once per screen; max two bands (paper-2, ink with buff type, or one vermilion).

## Type
- Display: Six Caps uppercase, lh 0.88, ls +2%, hero lines 120-240; each line its own text node sized to fill its column exactly (lines in a block differ in size).
- Section heads/titles/wordmark: Bevan uppercase 28-48, lh 1.0.
- Body: Archivo Narrow regular 17, lh 1.5; labels/captions medium 14, sentence case, muted. Figures in Six Caps.

## Shape and depth (Figma values)
- Radius 0; no shadows. Rules: 5px ink above a section/table/between columns; 1px ink under a running head; 1px #b7ad9a between rows.
- Frame = double rule: 3px ink stroke plus a 1px ink keyline 3px inside.

## Controls
- Primary: fill #15100e, text #f5f0e3, Archivo Narrow semibold uppercase, radius 0, h48, padding [14,28].
- Secondary: unfilled, double-rule frame.

## Range
- Timetable as a bill: each day a column under a 5px rule, name fitted in Six Caps, hour in Bevan, small print under a 1px rule; 5px vertical dividers.
- A count or date fitted to full measure in vermilion with small print beneath.
- Particulars as rows: Bevan label left, fact in narrow semibold right, hairlines, 5px over the first; unknown facts as muted fill.

## Voice
- A sale bill read aloud: date, place, lot, hour, each said once; shouted in caps, explained in small print.
- Never: ragged big lines; a fourth face; rounded corners; a second colour in type or pictures; drawn gavels or stars; a photo on every fold.
