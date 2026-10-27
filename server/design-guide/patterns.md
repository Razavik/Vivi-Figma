Adapted from Hallmark (MIT, Nutlope / Together AI).

# Patterns: controls, states, missing facts

Complements craft.md (D12, D13) and components.md. Take the shape; names, copy and values are yours. Build repeated controls once as components (figma_componentize) with stable unique text-layer names, and use instances.

## Controls as frames

- Button: horizontal frame, hug, height 44-52 on a marketing design (32-40 in dense app UI), padding [0 or 12-14, 24], radius from the design's radius family, gap 8, cross center, label body face 14-16 medium/semibold, never wraps. Primary = ink or accent fill + paired light ink; quiet = transparent + 1px hairline stroke + ink text; ghost = text only. One filled primary per page (a dialog counts as its own page); the secondary goes somewhere else and is never louder. Two button sizes at most, 6+ px apart. Delete takes a secondary style unless deleting is the screen's one action. Label = the verb of the action ("Book a fitting"); "Continue" only as a flow's second step.
- Input: vertical frame: label (14, medium) with gap 6 above a field frame (w fill, height equal to the button beside it, padding [0,16], 1px stroke, radius, paper fill, placeholder in muted). Helper text 12-14 below in a reserved line; the error replaces the helper there. The field's edge needs 3:1 contrast against its surroundings (use the muted ink, not the faint hairline). A visible label above every field; a placeholder is never the label and shows a format, not an instruction.
- Select: a field frame with the value and a chevron icon at the right. Textarea: same field, taller (min 96). Checkbox/radio: 20 px control + label, hit area at least 44 tall. Switch: pill 44x24 with a 20 px knob. Segmented control: hug row of 2-5 options in one hairline-stroked frame, selected option filled with ink + paper-colour text, each option at least 44 tall; labels body face, sentence case.
- Chips and badges: horizontal hug, padding [4,10], radius 999 only for chips/tags/badges and controls, 12-13 medium, tinted fill + matching dark text; no uppercase tracking.
- Tabs: a row of text labels, the active one in ink with a 2 px bottom stroke, others muted; state is a colour or a soft background, never a primary fill; a tab row on mobile scrolls, never wraps.
- Table: use the `table` block; rows 56-72 with hairlines only, no outer border or card, heads in sentence case muted that never wrap, numbers right-aligned and tabular, the column that names the row one weight heavier.
- Card: only for content that is independently interactive or of a different kind. Surface fill with a hairline OR a soft shadow (never both), padding 24-40, radius concentric with its contents; an image on top takes the card's radius via clip.
- Form: fields stacked with gap 16-24, actions at the end (secondary then primary, right-aligned in a modal, w fill on mobile). One-field form: about 320 wide, never an input and a button sharing one border.
- Modal/dialog: a centred card (w 400-560) on a dimmed backdrop (rect in ink at 50% alpha), title, body, fields, actions; a visible close control; a destructive confirm names the thing being destroyed.
- Nav item, menu, dropdown, tooltip: draw only the open state in a separate frame when asked; a menu overlaps the content below (position absolute) and never pushes it.
- Rail/switcher: draw the states as separate frames or a variant set; the rail's last item is cut by the frame edge.
- Hit targets: anything a finger can reach is at least 44x44 on mobile frames; enlarge by padding, not by changing the look.
- Skeleton for loading where the content's shape is known (lists, cards, tables): muted rects with the real layout; a spinner only inside a button replacing the label.

## States: only when asked

Static design: draw the default. Draw the other states only when the user asks for states, a flow, a component library or an interaction spec.
- Eight states: default, hover (one signal: a colour step or a 1px border step), focus (a 2 px ring in the focus colour, 2 px outside, 3:1 contrast against both the element and the page), active/pressed (one step darker or 1 px lower), disabled (opacity 55% on the whole control, plus a label that says why if it is near the user's attention), loading (inline progress, label stays readable, width does not jump), error (error colour on the border + the message + an icon; never colour alone), success (the result itself; no celebration for an effect the user already sees; no success state where nothing was sent).
- How: build the component once, then figma_componentize / `variants` with a property "State" (Default, Hover, Focus, Active, Disabled, Loading, Error) and place instances with variants:{"State":"..."}. The border width never changes between states (a state changes fill, stroke colour or the ring, not the stroke width, or the field jumps). An input is the same height as the button beside it.
- Reserve space for helper/error text and a right-edge slot (about 24) for a clear button, error glyph or spinner so nothing reflows.
- Whole-screen states are separate named frames next to the main one, reusing components and styles: "Form / Error", "Catalog / Empty", "Dashboard / Loading", "Checkout / Success". Name them clearly.
- Empty state: one line naming what is empty, one on why it matters, one action; never a bare "No results". Error copy: what happened, why if known, what to do; no "Oops", no exclamation marks. Loading longer than about 2 s: say what is loading.
- Reversible actions run at once and offer Undo; irreversible ones keep a confirm.

## Missing facts: honest placeholders

- A fact the brief did not give (venue, date, time, price, address, phone) is never invented. Set it as a visibly blank text: muted ink, a dashed hairline outline (dash [4,3]) around the text, wording that says what is missing ("Venue to be announced", "Price on request", "Time to be confirmed"). It must read as a blank to fill, never as a link or selected text. Two per page at most, each listed in your closing reply.
- When the job's anatomy asks for more facts than the user gave (hours, address, dates, prices), placeholder only the two a visitor needs to act; let the rest wait in your reply. A row, column or line that would hold nothing but a missing fact is cut, not announced.
- A section the user named but gave nothing for: its heading, one line on what will go there, one placeholder; or merge it into a neighbour. Never a block of pending rows.
- A face the design is about that the user has not supplied: use the nearest available font and say so.
- A link target the brief does not give points at the section of this page that does most of it; list the URL you need. Never an invented route.
- Sample data in built products: example.com, the brief's own field names, values that read as samples (round plausible amounts, "Example Kitchen"). Never a figure that could be taken as a claim (taste.md).
- People: avatar blocks with initials or no avatar; stock portraits only for illustrative context, never as customers or team members.

## Forms that post nowhere

A form drawn in a design submits nowhere. Do not draw a success message for it unless the user asked for the success state, and then as a separate named frame. If the user wants the real flow, say that the form is not connected to anything, and list the endpoint you would need. Never write "Sent", "Thanks, you're on the list" or "Reserved" as if something happened.

## Figures that compare

Prices, stats, rates: same size and weight across the set, tabular figures, right-aligned in columns, each with its unit and what it counts; a unit after its figure in a smaller line. Stats only if the user gave them. Pricing: highlight one tier with its button and a word (not a different card colour); buttons aligned at the bottom of every tier; the price is one text with spans (large number + muted period).

## Other small patterns

- Skip links, focus rings and keyboard order are not drawn; but give focus-state variants when the user wants a component spec.
- Testimonial (only when supplied): quote 18-24, attribution bottom-aligned; avatar the real person or none.
- Lists with icons: icon at the first line of text, same colour as the text, 20 px, no coloured tile by default.
- Logos strip: only the user's logos; evenly split rows; 32-48 tall.
- FAQ/accordion: rows of question (16-18 medium) + chevron, hairline between; show one row open in a separate variant only when asked.
