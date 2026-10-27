---
slug: newsprint
name: Newsprint
genre: editorial
posture: restrained
display: slab-serif | Zilla Slab | figma: a bold slab serif from figma_fonts (e.g. Roboto Slab, Zilla Slab), else a sturdy serif bold
body: Spectral | figma: a calm book serif (e.g. Source Serif, Lora); agate Libre Franklin | figma: Inter medium
photo: mono: black-and-white documentary, full tonal range paper-white to ink; desaturate fully; 1px border, caption mandatory
---
# Newsprint
A broadsheet: pale newsprint stock, warm black ink, a blunt slab head over a calm book serif, hairlines and column rules for ordinary breaks, a double rule for major ones, and a dried-brick signal that never fills anything. Reads reported and edited, not decorated.

## Palette
- paper #EEEBE3 (page) | paper-2 #E4DFD5 (wells) | paper-3 #D9D4C8
- ink #130E0A | ink-2 #2B2521 | muted #5E5650 | rule #9E978E | rule-2 #3D3732
- accent #8C2F1F (dried brick: links, a short tick on a rule; never a fill) | accent-ink #F1EEE6 | focus #A8260F
Balance: paper and ink; brick under 5%; max two bands: paper-2, or one ink band with paper type (brick becomes a hairline on it).

## Type
- Display: slab bold, one weight, roman, heads/decks/masthead; hero 64-96, lineHeight 1.05, letterSpacing -2%, sentence case.
- Body: Spectral regular/medium 17, lineHeight 1.55.
- Bylines/datelines/captions/table heads: Spectral medium one step smaller, sentence case, muted.
- Agate: Libre Franklin medium, only for figures in ruled lists (times, prices, counts), tabular, right-aligned, same size as neighbouring text.

## Shape and depth (Figma values)
- radius 0; shadow none; rules not boxes.
- rules: 1px #9E978E for ordinary breaks and column rules; double rule = two 1px #3D3732 lines 2px apart for major breaks.
- well: paper-2 ruled top and bottom, never a bordered card.
- photos: square, 1px #9E978E border, caption beneath in byline voice, never type on a photo.
- texture: none by default.

## Controls
- primary: square fill #130E0A, text #F1EEE6, slab bold 15.
- secondary: square, ruled top and bottom in ink.

## Range
- Front page treatment: one head across the full measure over three justified columns, drop cap, dateline, hairline column rules, double rule above.
- Listings as agate: ruled rows, item in slab at title size, line in Spectral, figure in agate at the right edge.

## Voice
- Specific and declarative with dry wit: place, day, fact; sub-editor heads in sentence case with full stops.
- Never: a sans body or sans labels; a cool or bright accent; boxed cards, shadows, rounded corners; italic or lighter slab; colour photos or uncaptioned ones.
