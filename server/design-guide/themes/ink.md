---
slug: ink
name: Ink
genre: editorial
posture: restrained
display: grotesk-sans | Epilogue | figma: Inter (bold)
body: Epilogue | figma: Inter
photo: muted: desaturated daylight; natural with colour turned down, no overlay (teal must stay the one colour that means something)
---
# Ink
A notice printed in plain black: white paper, a black with no hue, a bold head over regular text, hairline rules, and one teal that means "in" or "open". Competent, local and kind, like a well-run community desk.

## Palette
- paper #FEFDFB (page) | paper-2 #F6F5F2 (wells) | paper-3 #ECEBE7
- ink #0D0D0D (hueless black, never warm) | ink-2 #292929 (body) | muted #525252 | rule #DBDBD8 | rule-2 #EAE9E7
- accent #00746D (teal: only what is in or open; a tag, a large figure, a link state) | accent-ink #FEFDFB | accent-soft #C3F3EF (in-tag fill) | accent-soft-ink #022D2B
Balance: white and black with hairlines; teal as a state, never a field or running text. Max two bands: paper-2 or ink with paper text.

## Type
- Display: Epilogue bold, hero 64-104 at lineHeight 1.0 (1.05 below), letterSpacing -4%, sentence case, roman. A figure (count, price, hour) uses the same setting one step larger than its head.
- Body: Epilogue regular 16-17, lineHeight 1.55, ink-2; row names, links, tags semibold.
- Labels/captions/meta: regular one step smaller, sentence case, untracked, never mono.
- Mono only for figures compared in a column (loan counts, card numbers, rota times).

## Shape and depth (Figma values)
- radius: wells and photos 12, controls and inputs 10, tags 999.
- rules: list or table opens on a 1px ink rule, continues with 1px #DBDBD8 hairlines; #EAE9E7 for quieter rows.
- well: paper-2 with 1px #DBDBD8 stroke. Shadow {0,20,40,#20202029} only under floating things (menu, dialog); resting surfaces flat. No texture.

## Controls
- primary: fill #0D0D0D, text #FEFDFB, radius 10, Epilogue semibold, h 48, padding [0,20].
- secondary: fill #F6F5F2, 1px #DBDBD8 stroke, same size.
- tags carry state only: in = #C3F3EF fill + #022D2B text; out = outlined in rule colour; on = ink fill.
- links ink, semibold, underlined; teal on hover only.

## Range
- A shelf as a ruled list: name semibold, one-line description, state tag at row end, a filter field above.
- Steps as a notice: three or four numerals at display size over hairlines, the current stage with a pale-teal pill.

## Voice
- The desk volunteer's: what is in, when it is back, who is on Saturday. Short, kind, exact, never institutional.
- Never: a second colour (out is an outline, never red); a warm black; a teal field or teal body text; a shadow under resting surfaces.
