Written for Vivi (not from Hallmark).

# Composition: make sections unusual

Clients remember pages that have something unexpected in them: pictures that overlap, a shape behind, a label that sits where nobody expects it, a diagram instead of three columns. Lean that way on every section the content allows, as many as fit. A calm, conventional section is the exception you choose on purpose (a form, a table, a price list, legal text), not the default.

There is no recipe here and there must not be one. Do not reuse an arrangement from an earlier section, an earlier page or an example you saw: invent a new one from what THIS content is.

## Finding the idea

- Ask what the content really is: a route, a recipe, a calendar, a map, a stack, a collection, a before and after, a tool in a hand. Then draw that thing instead of a grid of cards.
- Ask what is the one object to look at, and what small facts can orbit it.
- Ask what would make a viewer stop for a second: a cropped giant letter, a photo breaking out of its frame, an oversized figure, a line that connects the steps, a shape that is not a rectangle.
- If the first idea is the usual one (photo left, text right; three equal cards), push it somewhere else.

## What the tools allow

Overlap, absolute placement by x/y, rotation, bleeding past the frame edge with clipping, shapes (blob, wave, star, ring, polygon, path, boolean cuts), masks, per-corner radius, strokes and shadows on pictures, badges and chips, dashed lines, oversized type, icons at any size, layered auto-layout inside a free-form frame. Use whatever serves the idea; none of it is required.

## Guardrails (only these)

- Text stays readable: contrast, no layered art over text, nothing clipped by accident.
- Content is real: facts on labels and badges come from the brief; decoration carries no meaning.
- One idea per section; the weight of the eye goes to a single place.
- Looking is the test: screenshot the section (zoom with region), check overlaps, alignment of what should align, and how it reads small. Lint only catches overflow.
- Keep the rest of the page consistent (type, colour, radius, spacing) so the unusual part belongs to it.

## Technical notes

A frame with `layout:"none"` and a numeric size places children by `x`/`y`; later children are on top. In auto-layout use `position:"absolute"`. Icons take `w`/`h` (or `size`) and a hex `color`. Shapes take `x`/`y` and hex fills. Photo in an arch: `radius:[tl,tr,br,bl]`; photo in a blob: the mask recipe in figma_schema "shapes".
