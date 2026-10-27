---
slug: blueprint
name: Blueprint
genre: modern-minimal
posture: drenched
display: geometric-sans | Chakra Petch | figma: Rajdhani or Barlow Semi Condensed, else Inter semibold uppercase
body: IBM Plex Sans | figma: Inter (mono IBM Plex Mono | figma: any mono)
photo: duotone cyanotype: shadows #012352, lights #eef6fd, high contrast; inside a double keyline
---
# Blueprint
A drafting sheet: Prussian-blue paper, a white line for ink, drafted capitals, mono measurements with units, keylines instead of cards. Everything is a line, a dimension or a print on one ground; the white line is the only signal.

## Palette
- paper #0d3970 (page) | paper-2 #062f61 | paper-3 #012352
- ink #eef6fd | ink-2 #d0e1ee | muted #a6c2d9
- rule #dceaf4 at 85% | rule-2 #dceaf4 at 32% | grid #eff6fb at 9% (24px) / 20% (120px)
- accent #eef6fd (white line: primary fill) | accent-ink #06346a
Balance: drenched, one blue ground, white linework; bands only paper-2/paper-3, max two; no second colour.

## Type
- Display: Chakra Petch semibold; h1/h2 uppercase, hero 64-96, lh 1.02, ls -1.2%; h3 sentence case 24-28.
- Body: Plex Sans regular 16-18; labels medium 14, sentence case.
- Mono: Plex Mono medium, only for measurements with units, drawing numbers, years.

## Shape and depth (Figma values)
- Radius 0 everywhere; no shadows, no blur. Depth = a second line, a 2px line, or a darker ground step.
- Keyline 1px rule colour on every surface; second keyline 5px inside at 32% on figures/photos.
- Dimension string: 1px line, 14px 45-degree ticks at both ends, value in mono above; real values only.
- Grid lines only under a drawing, schedule or chart.

## Controls
- Primary: fill #eef6fd, text #06346a, Plex Sans medium 16, radius 0, h48, padding [14,28].
- Secondary: transparent, 1px #eef6fd stroke, white text. Input: h48, 1px keyline, fill #062f61.

## Range
- Figure as dimension: one number at display size on a dimension string across 10-12 columns, real ends in mono.
- Table as drawing register: keylined, stage numbers in mono, 2px line under the head row, on paper-2.
- Form as title block: keylined cells, label top-left in each, white submit at the foot.
- Steps as elevations: columns parted by one heavy line, or stages along one dimension string with ticks.

## Voice
- Specification voice: type, stage, year, format, a unit on every figure.
- Never: filled cards, blur, lifted panels; a second colour; invented dimension values; rounded corners; lowercase h1/h2.
