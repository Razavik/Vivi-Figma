---
slug: hum
name: Hum
genre: playful
posture: full-palette
display: rounded-sans | Chillax | figma: a friendly rounded/geometric sans from figma_fonts (e.g. Nunito, Poppins); else Inter
body: Chillax | figma: same fallback
photo: natural, bright daylight, slightly vivid; no overlay; one edge can be torn (stacked offset frames)
---
# Hum
Cut paper made by hand, cheerful without turning childish: cream paper, sheets with pale torn edges, card stock you can press, lit from the top left. One rounded sans from head to label in blue-black ink. Three accents never blend: pear for action, blue for links, coral for one loud moment; mint is growth.

## Palette
- paper #F7F5EC (page) | paper-2 #F0EDE0 | paper-3 #E6E1D1 | card #FCFBF6 | fringe #FEFCF8 (torn-edge core)
- ink #12161C | ink-2 #272C32 | muted #565B63 | rule #D7D4C9 | edge #D2C6AA
- accent #F7D21A (pear: primary, the one pear field) | accent-deep #C9A000 (button edge) | accent-ink #12161C
- blue #0064BE (links, focus) | coral #FF5E63 (one loud fill) | mint #70E093 / mint-deep #00713E (growth)
Balance: cream paper, pear on actions; max two bands (paper-2, torn ink sheet with paper text, or one pear field).

## Type
- Display: rounded sans semibold, hero 64-96, lineHeight 1.03, letterSpacing -3%, sentence case.
- Body: medium 17-19, lineHeight 1.5; emphasis = pear highlighter rect behind the words, never inside a head.
- Labels/captions: medium 13-14, sentence case, muted. Mono only inside code.

## Shape and depth (Figma values)
- radius: surfaces 24 (children 28-32), card stock 16, inputs 14, pills 999; no square corners.
- shadow (cut sheets, falls down-right): {0,0,1,#12161C52}, {2,3,2,#12161C1A}, {6,14,16,#12161C21}.
- texture: very low-alpha noise `pattern` over paper; torn edges = a pale fringe frame offset 1px behind a jagged `shape` edge.

## Controls
- card stock: h 54, radius 16, inset top highlight, solid 5px lower edge (pear: #C9A000; secondary: #D2C6AA).
- primary: fill #F7D21A, text ink. Secondary: fill #FCFBF6, ink text. Chosen pill: ink fill, paper text.

## Range
- The product's own moment built large: words as card-stock tiles on a torn kraft strip.
- Growth set in type: a bed of plants made of glyphs on torn soil, states switched by a pill row.

## Voice
- Warm, smart, casual, direct, written to the grown-up beside the child; sentence case, verbs over nouns, honest numbers.
- Never: a serif, pure white paper or a square corner; a clean vector edge on a cut sheet, or shadows falling up/left; gradients between accents or rainbow grounds; emoji, stock icons or drawn characters.
