---
slug: arcade
name: Arcade
genre: playful
posture: full-palette
display: display-heavy (pixel figures) | Bungee (heads), Silkscreen (figures) | figma: Impact-like heavy caps from the list, else Inter black uppercase; figures: any pixel/mono face, else mono bold
body: Chivo | figma: Inter
photo: tint - overlay #f85200 at 25-35% over night scenes, 2px border; big and few, never two tinted photos back to back
---
# Arcade
A late-night cabinet: aubergine ground, Bungee capitals split in RGB over Chivo, Silkscreen figures, hard offset shadows, two loud inks that take turns like two players. Loud through colour, lettering and press physics, never drawn props.

## Palette
- paper #0f0415 (page) | paper-2 #190d20 (wells, band) | paper-3 #24162c
- ink #f2ecf5 | ink-2 #d9d1dd | muted #a79dac | rule #41304b
- accent ember #f85200 (leads: buttons, cursor row, figures) | accent-2 acid #d5e51b (answers: offset shadow, second figures, underline) | accent-ink #0f0415
Balance: dark ground; ember leads, acid answers; never a third ink. Bands: paper-2 or one ember field with accent-ink type (no RGB split), max two.

## Type
- Display: Bungee regular, uppercase, ls 0, lh 1.02; hero 72-112, statement line 48-64; under 28 characters. RGB split = duplicate text layer 1.5px left in #f92434 and 1.5px right in #00d1da under the ink text, one per screen.
- Figures: Silkscreen bold, 40px and up only, ember/acid; unit beside in Chivo bold.

## Shape and depth (Figma values)
- Radius 4 on wells/cards; tags and inputs 0. Stroke 2px on wells and pressables (#41304b), 1px #41304b between rows.
- Shadow: {x:6,y:6,blur:0,color:#d5e51b} on pressables; never soft, no glow, no gradient on buttons.
- Cursor row: row filled #f85200 with #0f0415 text.

## Controls
- Primary: fill #f85200, text #0f0415, Chivo bold 16, radius 4, 2px #f2ecf5 stroke, acid offset shadow, padding [14,28].
- Secondary: same, transparent fill.

## Range
- Figures as a score line: real numbers in Silkscreen, ember and acid alternating, parted by 2px vertical rules.
- Two-player comparison: two wells side by side, one keyed ember, one acid (top bar + figure colour), matched rows.
- Timetable/price list as a menu: Silkscreen times/prices vs Chivo black titles on hairlines, one ember cursor row.

## Voice
- Coin-op plain: short lines, verbs first, the night, the hour, the door price; no nostalgia.
- Never: magenta+cyan as the pair; starfields; soft shadows or glows; drawn sprites/joysticks; consecutive tinted photos.
