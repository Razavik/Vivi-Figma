---
slug: kiln
name: Kiln
genre: atmospheric
posture: full-palette
display: high-contrast-serif | Boska | figma: a cut high-contrast serif from figma_fonts (e.g. Playfair Display, Fraunces), medium weight
body: Geist | figma: Inter
photo: warm: low-light, sepia-leaning; overlay #0B0605 at 0.2-0.4 to deepen; scrim #0B0605 at 0.4-0.65 on the dark side if type sits on it
---
# Kiln
A dark workshop with the kiln door open a crack: near-black ground, cream ink, a cut serif over a plain sans, and heat only where something is hot. A ramp from ash through oxblood, ember and amber to white heat colours a temperature as it climbs. Warm in one place, cold everywhere else.

## Palette
- paper #0B0605 (ground) | paper-2 #170E0B (smoked wells) | paper-3 #221814
- ink #F2EADD (all letters) | ink-2 #D5C8B9 | muted #B3A192 | rule #F5F1EA at 12% alpha
- accent #FE6A00 (ember: only a FILL: primary, slider thumb, live point on a curve) | accent-ink #100704 | focus #FF8A00
- heat ramp, for temperature only: #090503 | #34080B | #8A050D | #E13B00 | #FF8A00 | #FFCF66 | #FFF9DB
Balance: near-black ground; at most two paper-2 bands; ramp never fills a box, band or the ground and no text sits on it.

## Type
- Display: Boska-style serif medium, hero 64-104, lineHeight 1.04, letterSpacing -2%, sentence case, roman.
- Figures: serif medium, lining, tabular, letterSpacing -3%, unit in the same face; a lone figure up to twice the hero.
- Body: Geist regular/medium 16-18, lineHeight 1.55.

## Shape and depth (Figma values)
- radius: photos and built screens 28, wells and inputs 16, pills 999.
- rules: 1px #F5F1EA1F between rows, on well edges, chart grid; nothing brighter.
- wells: paper-2 + 1px rule stroke, no shadow, never nested. Shadow {0,50,90,#0B060580} only under a built screen or photo standing on the ground.
- photo frame: 28 radius, 1px inside stroke cream at 8%.
- ramp use: firing curve in colour steps, range track with three stops (linear gradient).

## Controls
- primary: pill fill #FE6A00, text #100704, Geist medium, h 50, padding [0,28].
- ghost: pill, 1px inset #F5F1EA1F stroke, cream text.
- ember is never text: every letter stays cream.

## Range
- A firing schedule as rows: rate and target in serif figures, each keyed by a short bar of its ramp step.
- A reading or warning as a statement: serif at display size across ten columns, cream on the ground, nothing else.

## Voice
- Calm and physical, a potter's words: cone, degrees, hour, load. Name the firing, not the feeling.
- Never: the ramp as a fill or gradient behind text; orange type; a brown or warm-lit ground; bright flat photos or pots on white; a third hue beside the ramp.
