---
slug: almanac
name: Almanac
genre: editorial
posture: restrained
display: grotesk-sans | Hanken Grotesk | figma: Inter (semibold)
body: Newsreader (serif prose) | figma: any roman serif from the list; mono figures: IBM Plex Mono | figma: any mono
photo: muted - natural colour, desaturated, flat overcast light; no overlay; 1px inset ink outline (#2b343b); no type on photos
---
# Almanac
The register of a reference book: cool slate stock, blue-black ink, grotesk heads over serif prose, figures in mono lined up to the decimal, rules in two weights, one deep magenta kept small. Authority comes from rules and numerals, not colour or ornament.

## Palette
- paper #c4cbd2 (page) | paper-2 #bbc2c8 (wells, alternate rows) | paper-3 #aeb5bb
- ink #060e15 | ink-2 #182027 (body) | muted #3b434b | rule #a1a9af | rule-2 #2b343b (firm rule)
- accent #970d63 (filled control, link underline, the one chart series) | accent-2 #76004b (pressed) | accent-ink #f2f6f9
- sheet #e5eaef (the pale printed page laid on the slate: tables and product pages, never a paragraph)
Balance: slate ground, ink text, magenta under 5% of the frame; at most two bands (paper-2 or one ink band), never a magenta field.

## Type
- Display: Hanken Grotesk semibold, hero 72-96, lh 0.95, ls -3.5%; heads 32-48, lh 1.05, ls -2%; sentence case. Serif never sets a head.
- Body: Newsreader regular 17-18, lh 1.55; italic only as in-text emphasis.
- Figures: IBM Plex Mono regular/medium, right-aligned, decimals lined up; a lone figure may go to 64-96 medium, ls -4%.

## Shape and depth (Figma values)
- Radius 0 everywhere; controls 2.
- Shadows: none. Depth = rule + paper step. Sheet: #e5eaef with a 2px ink (#060e15) top rule, hairlines inside.

## Controls
- Primary: fill #970d63, text #f2f6f9, Hanken medium 14, radius 2, padding [12,24].

## Range
- A printed-book table on the sheet: dated head over a 2px rule, row names in serif, times/heights in mono right-aligned, one row in magenta.
- One chart set large: single magenta series 2px, off-hours shaded in paper steps, turning points labelled in mono.
- A data file on an ink band: header row and sample lines in mono (sheet colour), column names magenta, a caption saying what the full file holds.

## Voice
- Declarative, dated, exact: cite figure, edition, source, unit; no hype adjectives.
- Never: hot pink/violet magenta; white or warm paper; boxed cards or shadows; proportional figures in a column; decorative waves behind type; many small charts.
