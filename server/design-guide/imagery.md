Adapted from Hallmark (MIT, Nutlope / Together AI).

# Imagery: show the real thing

A design looks made when it shows the real thing (the place, the food, the object, hands at work, the product running) and generated when it shows a gradient box, a drawing of a loaf, or a heading with nothing under it. Complements craft.md (D10) and its PHOTO STATE rules.

## What fills a picture slot (first that fits)

1. The user's own files: ask for them, or look in the project; place with {"type":"image","path":"..."} (png/jpg/webp/gif up to 8 MB inside the project). They win every slot.
2. Real screenshots of the user's product, provided as files (image.path). A real screen beats any picture of one. Ask the user to export screens of the app (desktop main screen, a detail crop, a second screen, the phone view); nothing personal on screen (names, emails, tokens), no error states unless they are the point. Use several: main screen in the hero, a detail cropped large lower down, the phone view.
3. The product built from frames and blocks (an interface at full size from real controls, table/chart blocks, the brief's nouns), only when no real product exists yet. Use at least eight real elements, sample values that read as samples, never a figure a visitor could take as a claim. Name the frame so the user can swap in a real screenshot ("Hero / Product screen (replace with real)"). Never mock a product the user could screenshot: ask first.
4. Stock via image.query with a specific query (subject + place + light/action, 2-4 English words: "apple orchard autumn", "hands kneading dough", not "food" or "people"). Pick what fits the sentence the section makes; if the result is off-subject, re-ask once in other words (place, material, action), then cut it. The user's own photo replaces stock later: say which slots those are.
5. Type at full scale, when the brief is about words (docs, manifesto, letter).
Never: an invented number, logo or testimonial instead of a picture; a photo standing in for a fact (numbers, names and claims stay in type); a picture of a person standing in for a customer, a teammate or a testimonial; stock faces as proof.

## Which briefs want which

- A place, material, food or drink, object, craft, outdoors, event, people at work (bakery, ski school, gin, weaving studio, venue, tailor, farm): photographs lead. The hero photo is the largest thing on the first screen (full-bleed behind the head, or beside it at 60-75% of the screen height). After it, two to four more carry the page, one of them large, each on its subject (an off-subject photo is cut, not kept to fill a count), with sections of the material alone between them (menu or price list as rows, hours and place as a table, a statement, a form).
- Software (SaaS, app, developer tool): the product leads and the hero visual is its interface. One or two photos may set the scene (where it is used, hands at the work it serves) when each passes the deletion test: take it away and the page loses a fact. A city at night, a laptop on a desk or an office building fails it.
- Words (docs, API, CLI, type specimen, manifesto, letter): type and code carry it; one full-bleed photo band at most. A manifesto about something physical (repair, a river, a street) shows it like any page.

## Placing and treating photographs

- Big or not at all: a photo spans six of twelve columns and stands 440+ tall, or runs full-bleed. At thumbnail size it reads as clip art (a set of four or more may run smaller, each with its fact). Delete the picture in your head: if the screen still says the same thing, the photo is too weak or too small.
- One subject a frame, cropped tight, its weight leaning toward the text. Vary ratios (4:5 beside text, 16:9 or 21:9 across, 1:1 in a pair) and sizes (8 and 4 columns); three equal frames only for a true set (three dishes, three rooms). Use real proportions: 16:9, 4:3, 1:1, 3:4. image fit "fit" only for logos and product cut-outs that must not be cropped.
- Balance: below the hero, photographs take at most a third of the page (45% on a photography portfolio); screenshots and the product built do not count toward this. Never two photograph-led sections in a row: follow a picture with a section carried by type, rules, colour, the product or a table. When in doubt, cut the weakest picture and set its fact large. A software page alternates the product with type-led sections; a word-led page takes one photo at most.
- Text over a photo: place it on the photo's calmest part, over an image overlay (a gradient from the text's edge, ink at 35-65% alpha, only behind the text side), contrast 4.5:1 or better against what is under the text. Never centred white type over a busy frame. A design that refuses gradients uses a solid ink plate at 50-70% alpha.
- Treatment: one treatment for every photo in the design, set once and kept: natural, warm, muted, mono, or duotone/tint in the design's own colours (a coloured fill frame over the photo with reduced opacity, or an overlay). A duotone or tint flattens pale subjects (snow, a white wall) into an empty field: choose frames with tonal range and look at each through the treatment.
- The frame: the design's radius (same as the cards), a 1px stroke of ink at 6-10% alpha; never a border plus a wide shadow.
- Captions are facts from the brief beside or under the picture (the dish and its price, the room and its hours, the date, the place). No credit lines (stock credits are not needed in the design); never a caption that claims a stand-in as the user's own person, place or product.
- PHOTO STATE (craft.md D10) still applies: replace a photo only if it is a placeholder, the user asked, or the screenshot clearly shows it contradicts its card; at most once per photo.

## Never

- A drawn illustration: an object, plant, animal, person, product, building, landscape or scene made from shapes or an svg past icon size. Icons from one set, the user's logo, charts/maps/diagrams of real data with their labels, and plain geometry (a rule, a grid, a dot pattern as texture) are fine. For a hero scene use a photo, the product built, or type at scale.
- An empty picture: a frame showing nothing but a grey or gradient wash where a picture should be. Every picture slot holds a photo, a real screenshot, or the product built. If you cannot fill it, remove the slot and set its fact in type.
- A counting device: a row or grid of identical marks standing for a quantity (one dot per bottle or day). Set the number large.
- Illustration packs and characters (unDraw/Humaaans/Storyset style people, 3D blobs, isometric scenes).
- A logo wall without the user's logos; mesh blobs, orbs or aurora behind text; text baked into a picture; a photo of a screen showing someone else's interface.
- More than four picture slots in a row, and sets of blank frames for things you have no pictures of (a team, a list of venues): set those in type (names, roles, facts in a list or table).

## Icons, logos

- Icons: one set per design (Lucide default; "ph:", "tabler:", "ms:" prefixes) in one stroke width and one style, at 16, 20, 24 or 32 px; colour the same as the text they accompany; aligned to the first line of multi-line text; never in a coloured tile by default; never an emoji. A button with an icon pads the icon side by the vertical padding.
- Logos: the user's own (image.path or icon.path svg), monochrome, one treatment per row, 32-48 tall (20-28 in a footer); rows split evenly (3+3, never 5+1). A `logo` block is a placeholder mark for the user's own brand only, never a wall of invented company names. Platform marks (store badges, payment methods) only for platforms the design names.

## What to ask the user for

When the brief shows a gap, ask once, in one message, ordered by value:
1. The one piece of material that would most improve the design: photos of the real place/product/people, screenshots of the app, real numbers (customers, uptime, prices), a quote with the name of who said it, logos they may use.
2. Facts a design cannot work without (venue, date, price): if not given, show the honest placeholder (patterns.md) instead of inventing them.
If the user says go ahead, infer, state the inferences in one line, and mark every stand-in (named frames "Photo (replace)") so they are easy to find. Close the reply by listing each stand-in with its size and what belongs in it.

## Optional extra: generated stills

Only if the user's environment provides an image tool and the user asked for generated images, or for a subject stock cannot reach. Prompt like a photographer: one concrete subject, the place, the light and the lens ("a stack of rye loaves on a flour-dusted steel counter, early window light from the left, 50mm, shallow depth"), no text, no people facing the camera. Look at every result: six fingers, doubled furniture and melted labels go back.
