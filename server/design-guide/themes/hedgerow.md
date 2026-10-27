---
slug: hedgerow
name: Hedgerow
genre: editorial
posture: drenched
display: high-contrast-serif | Prata | figma: a sharp high-contrast serif from figma_fonts (e.g. Playfair Display, Bodoni Moda)
body: Manrope | figma: Inter
photo: natural, low-key, slightly muted; no tone; type on a photo only over a #032615 overlay at 0.45-0.7
---
# Hedgerow
A dark page that reads as green, not night: deep leaf-green ground, cream ink, sharp serif names over a quiet sans, plants photographed close in shade, and one chartreuse for controls and the few lines drawn. Botanical, exact, fresh, like a field guide on a bench.

## Palette
- paper #032615 (page ground) | paper-2 #001B0D (bands) | paper-3 #143423 (wells)
- ink #EEE7D8 (cream) | ink-2 #B2C8B5 (body) | muted #88A48D | rule #224230
- accent #CAE430 (chartreuse: controls, the one key rule, one figure) | accent-2 #DDF18A (hover/focus) | accent-ink #012111
- accent-deep #446401 (moss: takes chartreuse's place on the cream band)
Balance: drenched green ground; one optional cream band (ground #EEE7D8, text #032615, moss line work) for the densest section; max two bands.

## Type
- Display: Prata-style serif, regular only, hero 64-104, lineHeight 1.08, letterSpacing -0.5%, sentence case, roman. Item titles in it never below 22px. Statement figures lining serif.
- Body: Manrope regular 17, lineHeight 1.6, ink-2; medium for labels, bold only on controls.
- Labels/captions/table heads: Manrope medium 12-14, sentence case, untracked, muted.

## Shape and depth (Figma values)
- radius 0 on wells, photos, inputs; pills 999 for buttons. Shadow none, no gradients except a photo scrim.
- rules: 1px #224230 between rows; 1px #88A48D where sections part; a 1.5px chartreuse rule heading the one key list.
- depth is paper steps: wells paper-3, bands paper-2. Photos: square, 1px cream stroke at 8% alpha, caption beneath naming the plant.

## Controls
- primary: pill fill #CAE430, text #012111, Manrope bold, padding [14,28]; hover #DDF18A.
- secondary: pill with 1.5px chartreuse stroke, cream text.

## Range
- A field-guide index: rows with common name in serif 28+, Latin name in label style, one line, under the chartreuse rule.
- Figures as a bottle label: batch, count, price in the serif 48+, split by rule verticals on a paper-2 band; one figure chartreuse.

## Voice
- A field guide's: the plant, where it grows, how far, when; never invent a distance or month.
- Never: a second accent (sold out is muted, not red); black or blue-black ground; bright high-key photos; chartreuse running text, band or chartreuse on cream.
