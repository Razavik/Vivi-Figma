---
slug: overprint
name: Overprint
genre: playful
posture: full-palette
display: grotesk-heavy | Anybody (wide 900) | figma: heaviest wide grotesk in figma_fonts (e.g. Archivo Black/Expanded, Inter black); UPPERCASE
body: Archivo | figma: Inter; small print Archivo Narrow | figma: Inter medium
photo: mono: hard high-contrast greyscale, overlay one pass colour (#00A2B9 or #FB7500) so lights print in the pass and shadows stay ink
---
# Overprint
A two-colour screenprint on cheap grey stock: near-black ink, wide heavy capitals over a plain body, and two flat inks, teal and orange, that print a deep moss where they cross. All in register, flat and square: the noise is scale and two inks, never effects.

## Palette
- paper #E6E3D9 (page) | paper-2 #DAD6C9 | paper-3 #CDC7B8
- ink #120F0C | ink-2 #2F2A26 | muted #514C46 | rule #BDB7A9
- pass 1 teal #00A2B9 (primary, open state) | accent-ink #120F0C | focus #005E78
- pass 2 orange #FB7500 (closed/sold-out state) | ink #120F0C on it
- moss #024A00 (only where a teal and an orange field overlap: place a moss rect on the intersection; never a fill, control or letter)
Balance: grey stock, ink, two passes; both passes are fills under ink type, never text colour.

## Type
- Display: wide heavy grotesk (900, widest cut), UPPERCASE, hero 96-160, lineHeight 1.0-1.02, letterSpacing -1%.
- Body: Archivo regular/semibold 16-17, lineHeight 1.5, ink.
- Small print (days, hours, table heads): Archivo Narrow semibold one step smaller, sentence case, untracked.

## Shape and depth (Figma values)
- radius 0; shadow none; gradients only as a photo scrim; depth comes from overlapping passes.
- rules: 4px ink bar across the top of a list, table, figure row or nav; 1px #BDB7A9 between rows.
- type never sits on the moss.

## Controls
- primary: pass-1 fill #00A2B9, Archivo Narrow semibold capitals ink text, square; hover swaps to orange.
- secondary: 2px inset ink stroke.
- closed state: pass-2 fill. Input: square with 2px ink stroke.

## Range
- Figures as a bill: times, capacity, price at poster scale, each on its own pass field; two fields cross by a column so the overlap prints moss.
- A listing as a ruled table under the 4px bar: heads narrow, act in wide caps at title size, tabular nights and prices; on-sale cell teal, sold-out cell orange.

## Voice
- The bill on the wall: who plays, which night, doors, price, sold out or not.
- Never: a third ink or mixed moss fill; out-of-register echo, offset copy or ghosted second head; colour photos or ones printed through both passes; lowercase or narrow display; shapes drawn just to show off overprint.
