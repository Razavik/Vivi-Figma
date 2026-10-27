---
slug: terminal
name: Terminal
genre: atmospheric
posture: committed
display: mono | Martian Mono | figma: a mono from figma_fonts (e.g. JetBrains Mono), medium; use it for EVERY glyph
body: Martian Mono | figma: the same mono, regular
photo: duotone: dark green ground #040805 tinted phosphor #7ef473, contrast up; or a glyph-grid picture
---
# Terminal
The page is the terminal surface and its pictures are printed in type: near-black ground with a green cast, pale phosphor ink, one bright phosphor green with a dim wash for what is added or selected, every glyph monospaced. Not the CRT costume, not a product page holding a terminal screenshot.

## Palette
- paper #040805 (page) | paper-2 #080f0a (session well) | paper-3 #101a12 (selection)
- ink #e1f1de | ink-2 #b2cdaf | muted #769676 | rule #1d2a1f | rule-2 #334934 (table head)
- accent #7ef473 (the one signal) | accent-ink #040b05 | accent-wash #062409 (added/selected line)
- glyph ramp dim to bright: #18361b #244d26 #2e6a2f #3d8b3b #4eae45 #62d158 #7ff06d #c4ffb0
Balance: one hue in a ramp of lightness; no second hue (no red for removed lines); no light section.

## Type
- All text mono, weights 400/500/700. Display medium, hero <=60 in 2-3 lines, lineHeight 1.12, letterSpacing -2%. Body 15-16px, lineHeight 1.65. Labels a step smaller, muted.
- Figures: regular weight, display size, tabular, unit or "# comment" beneath in muted. Prompt "$" in muted only before real commands; arguments in accent.

## Shape and depth (Figma values)
- Radius 0, no shadows. Raised = 1px #1d2a1f border on a lighter step. Rules 1px #1d2a1f.
- Glyph picture: a mono text node laid out as a brightness grid (~100 columns), each character coloured from the ramp, dim ones smaller. No scanlines, glow, bezel or title bar.

## Controls
- Primary: square, fill #7ef473, text #040b05. Secondary: square, 1px #b2cdaf stroke.
- Install line: paper-2 well, tabs underlined in accent. Selected row fill #062409.

## Range
- Comparison as a diff: removed lines muted behind "-", added lines ink on #062409 behind a green "+", line-number gutter in #334934.
- Figures as tool output: 3-4 numbers at display size parted by vertical rules, each with a "# comment" beneath.
- Reference as rows: command per row, arguments in accent, description right.

## Voice
Commands, flags, paths, exit codes; declarative, no adjectives.
- Never a proportional face.
- Never a second hue.
- Never rounded corners or a light section.
