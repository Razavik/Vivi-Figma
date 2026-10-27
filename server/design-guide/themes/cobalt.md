---
slug: cobalt
name: Cobalt
genre: modern-minimal
posture: restrained
display: grotesk-sans | Familjen Grotesk | figma: Inter semibold
body: IBM Plex Sans | figma: Inter (code: JetBrains Mono | figma: any mono)
photo: duotone graphite #121823 to paper #f8fbfe; rare, at most one, a real system from a distance; no type on it
---
# Cobalt
An exact technical register: cool near-white paper ruled with hairlines, grotesk heads, a ground of characters (ASCII field in cobalt tints), panels cut on two opposite corners, keycap buttons with a real bottom edge, code on graphite. Precise because every edge is a hairline or a cut.

## Palette
- paper #f8fbfe | paper-2 #eff3f8 | paper-3 #e3e8ef (sunken tray)
- ink #111825 | ink-2 #363e49 | muted #5d646e | rule #dadee4 | rule-2 #c2c8cf
- accent cobalt #0462d3 (primary key, under 5% outside the field) | accent-deep #0040bb | edge #003d98 | wash #e3f0ff | accent-2 #75b4ff (syntax on graphite) | accent-ink #f8fbfe
- graphite #121823 | graphite-2 #1e2532 | graphite-ink #e3e8ee | graphite-muted #939ca9
- glyph tints (field): #d0dceb #aec3de #7ba1d3 #4a81cc | key-face #fcfdff | key-edge #b7bec8
Balance: paper with hairlines; max two bands, only one graphite.

## Type
- Display: Familjen Grotesk semibold, hero 64-96, lh 1.02, ls -2.8%, sentence case, tabular; item titles medium; a count at 60px+ is the loudest type.
- Body: Plex Sans regular/medium 16-17. Labels/status: Familjen medium 13-14, muted, never mono.
- Mono (JetBrains Mono): code, machine values, glyph field only.

## Shape and depth (Figma values)
- 1px #dadee4 edges every surface and splits rows.
- Cut panels: radius [16,4,16,4] (large) or [8,4,8,4] (small), or 8 / 6 plain. Shadow {0,1,2,#111825 at 6%}.
- Keycap: fill #fcfdff, 1px #c2c8cf stroke, bottom edge = 3px #b7bec8 strip (or solid shadow {0,3,0,#b7bec8}); primary key fill #0462d3 with edge #003d98.

## Controls
- Primary: cobalt keycap, text #f8fbfe, Familjen medium 16, h48, radius 6. Secondary: key-face keycap, ink text.

## Range
- Table that is the API: ruled full width, machine values in mono, one row on the cobalt wash.
- Mapping: two graphite panes, input and output, matched lines joined by hairline elbows.
- Timeline as a ruler: real seconds on a hairline, attempts as notched ticks with status in Familjen 600 large.

## Voice
- Declarative like a changelog: event, endpoint, status code; no hype.
- Never: warm accent, pills or gradient buttons; noise for its own sake; fake code (use example.com).
