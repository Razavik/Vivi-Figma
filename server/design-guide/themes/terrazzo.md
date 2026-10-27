---
slug: terrazzo
name: Terrazzo
genre: modern-minimal
posture: restrained
display: geometric-sans | Syne | figma: a wide geometric sans (e.g. Montserrat bold), else Inter bold
body: Onest | figma: Inter; codes: JetBrains Mono | figma: any mono
photo: natural, true colour, slightly sharpened; surfaces flat-on, close; no overlay
---
# Terrazzo
A materials library's specification voice: off-white paper, near-black ink, wide bold heads, mono for codes and millimetres, white cards ruled in 2px ink over a hard offset holding surfaces photographed flat-on. Controls are ink; colour arrives only in the photographed stone and timber, with rust as the one signal.

## Palette
- paper #f5f1eb (page) | paper-2 #e9e4dc (band) | paper-3 #dbd5cc (hard shadow)
- plate #fefdfb (card, input) | ink #0f0d0b | ink-2 #292624 | muted #5c5753 | rule #c5c0b8
- accent #b14420 (rust: a code, selected row/chip, hover underline) | accent-soft #f6dbcf (selected row) | accent-ink #fefdfb
Balance: neutral paper and ink, colour only from photos; bands ink or paper-2, two at most, never coloured.

## Type
- Display: Syne bold (not extra-bold), hero 64-96, lineHeight 1.0, letterSpacing -2.5% (figures -4%), sentence case; keep heads short.
- Body: Onest 16-17px, lineHeight 1.5; labels medium a step smaller. Codes and measures (ST-0412, mm): JetBrains Mono medium at text size, never heads.

## Shape and depth (Figma values)
- Radius 0 everywhere. Rules: 2px ink on table top, band edge, around cards; 1px #c5c0b8 between rows.
- Card: fill #fefdfb, 2px ink stroke, hard shadow {14,14,0,#dbd5cc}; the page's one container.
- Photo edge to edge in a card, caption beneath; no type on a photo. No texture.

## Controls
- Primary: square, fill #0f0d0b, text #f5f1eb, Onest medium, padding [14,28].
- Secondary: square, 2px ink stroke. Input: square, fill #fefdfb, 1px ink stroke. Choices: joined square cells, chosen one ink.

## Range
- Specification table: full-width under a 2px ink rule; code and size in mono, name at title size, family and finish muted; selected row #f6dbcf with a rust code.
- Figure on the ink band: one big number at ~2x display size, paper on ink, beside a short ruled list.
- Steps on rules: numerals in display face hung from hairlines, stage in medium, one line beside.

## Voice
A catalogue's plainness: family, finish, code, size. Never sell the feeling of stone.
- Never drawn chips or confetti.
- Never a photo as background.
- Never a coloured primary or a rounded corner.
