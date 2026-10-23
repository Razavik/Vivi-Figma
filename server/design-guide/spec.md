SCHEMA — every node is an object with a "type" field:

frame — container/layout node
  name?: string
  x, y?: number — position: inside a parent with layout:"none" (or the root frame), or with position:"absolute" (see POSITION below)
  w, h?: number | "hug" | "fill" — px, fit-content, or stretch to parent ("fill" works only inside auto-layout frames; "hug" works only on frames that have auto-layout (layout vertical/horizontal), on text, and on the root frame when it has layout vertical/horizontal)
  layout?: "none" | "vertical" | "horizontal" (default "none")
  gap?: number — spacing between children in auto-layout
  padding?: number | number[] — CSS shorthand: [v]=all sides, [v,h]=vertical/horizontal, [t,h,b]=top/horizontal/bottom, [t,r,b,l]=each side
  align?: "start" | "center" | "end" | "space-between" — main axis alignment
  cross?: "start" | "center" | "end" — counter axis alignment
  wrap?: boolean — horizontal auto-layout wraps children onto new rows (chip clouds, galleries, the Components library)
  fill?: "#RRGGBB" | "#RRGGBBAA" | "none" | {"color": "#RRGGBB", "opacity": 0..1} | {"gradient":"linear","angle":180,"stops":["#6366F1","#8B5CF6"]} — linear gradient, angle in degrees as in CSS (180 = top to bottom, 90 = left to right), 2+ colors spread evenly (#RRGGBBAA works for fades) | {"gradient":"radial","stops":["#F5B38A","#F5B38A00"],"center"?:[0.5,0.5],"radius"?:0.5} — radial glow, the first color in the center; center in fractions of the node (0..1), radius as a fraction of its size (0.5 reaches the edges)
  clip?: boolean — clip children to the frame bounds (image masks, carousels, cards with full-bleed photos)
  minW?, maxW?: number — width limits in auto-layout (e.g. a paragraph column maxW 640 with w:"fill")
  stroke?: "#RRGGBB" | "none", strokeWidth?: number
  strokeSides?: "top"|"right"|"bottom"|"left" | [...] — stroke only these sides (a divider under a row, a bottom border on a navbar, a left accent bar); "all" restores every side
  strokeAlign?: "inside" (default) | "center" | "outside"
  dash?: [dash, gap] — dashed stroke, e.g. [6,4] (drop zones, placeholders); [] makes it solid again
  radius?: number | number[] — CSS border-radius shorthand: [a]=all corners, [a,b]=TL+BR/TR+BL, [a,b,c]=TL,TR+BL,BR, [tl,tr,br,bl]=each corner
  shadow?: {"x"?: number, "y"?: number, "blur"?: number, "color"?: "#RRGGBBAA"}
  children?: node[]
  Serialized real Figma groups also appear as frames but carry "group":true — they have no layout, fill or padding; to get auto-layout wrap the nodes into a real frame instead (the group op with "frame":true).

POSITION (any node type): position?: "absolute" — inside an auto-layout parent the node leaves the flow and sits on top (badges over photos, a "Popular" ribbon, notification dots, decorative shapes): x/y offset from the parent's top-left, or right/bottom?: number — offset from the parent's right/bottom edge (kept when the parent resizes). Needs a numeric w/h (or hug for auto-layout frames/text), never "fill". Put it AFTER the nodes it overlaps in children (later = on top). position:"auto" returns it to the flow.

EFFECTS (any node type):
  rotation?: number — degrees clockwise around the node's center (a tilted sticker, a stamp, a rotated photo in a collage, a diagonal ribbon). Keep it subtle (2-8°) except for deliberate decoration; inside auto-layout the rotated bounding box takes space, so rotate absolute-positioned decoration rather than flow content.
  layerBlur?: number — blurs the node itself, px (soft glow blobs behind content: an ellipse with an accent fill + layerBlur 80-160, position absolute).
  backgroundBlur?: number — blurs what is BEHIND the node, px ("glass" panels: a semi-transparent surface fill like "#FFFFFF99" + backgroundBlur 16-32 + a thin light stroke); works only when the fill is semi-transparent and there is something behind it.
  shadow:"none" removes a shadow; 0 removes a blur.

text — text node
  text: string (may contain \n)
  spans?: [{"text":"...", fontWeight?, fontFamily?, fontSize?, color?, textDecoration?, link?: "https://..."}] — several styles inside ONE text (a bold or accent word, an inline link, "$29" big + " / month" muted). The node text = all span texts joined in order (then "text" may be omitted); node-level fontSize/fontWeight/color are the base, a span sets only what differs.
  fontSize?: number (default 16)
  fontWeight?: "regular" | "medium" | "semibold" | "bold"
  fontFamily?: string (default "Inter")
  color?: "#RRGGBB"
  align?: "left" | "center" | "right"
  lineHeight?: number — px
  letterSpacing?: number | "<n>%" — px or percent of the font size ("-2%" for large headings, "8%" for small uppercase labels)
  textCase?: "upper" | "lower" | "title" — display case; keep the source text in normal case
  textDecoration?: "underline" | "strike" (links, old prices)
  maxLines?: number — cut to N lines with an ellipsis (needs w:"fill" or a numeric w)
  w?: number | "hug" | "fill", minW?, maxW?: number
  opacity?: number

rect — rectangle
  w, h, fill, stroke, strokeWidth, strokeSides, strokeAlign, dash, radius, opacity, x, y

ellipse — circle/oval
  w, h, fill, stroke, strokeWidth, strokeAlign, dash, opacity, x, y

line — straight line
  w?: number — length (default 100), direction?: "horizontal" | "vertical", stroke?: "#RRGGBB", strokeWidth?: number

image — photo block: the server finds a real stock photo by "query" and inserts it; if nothing is found it becomes a grey placeholder with the label
  w, h, query?: string — 2-4 English keywords describing the photo (e.g. "coffee shop interior", "portrait woman smiling", "fresh vegetables")
  fit?: "fill" (default: cover, cropped) | "fit" (whole image visible — logos, product cut-outs)
  overlay?: color with alpha or gradient — a layer over the photo so text on it stays readable, e.g. "#0B0D1099" or {"gradient":"linear","angle":180,"stops":["#0B0D1000","#0B0D10CC"]}; "none" removes it

icon — real vector icon (builds actual vector nodes, editable in Figma). Two ways:
  1) PREFERRED — from the Lucide library by name: icon: "arrow-right" (kebab-case Lucide name, e.g. "search", "shopping-cart", "user", "heart", "star", "menu", "x", "check", "chevron-down", "phone", "mail", "map-pin", "settings", "home", "wrench", "hammer", "truck", "shield-check", "credit-card", "clock", "bell", "calendar", "download", "upload", "trash-2", "pencil", "plus", "minus", "filter", "layout-grid", "list", "package", "tag", "percent", "gift", "lock", "eye", "info", "alert-triangle", "circle-check", "thumbs-up", "message-circle", "send", "share-2", "link", "globe", "image", "play", "zap", "sun", "moon", "log-in", "log-out", "chart-bar", "wallet", "headphones", "bookmark"). Any other real Lucide name works too; an unknown name is matched to the closest icon.
     color?: "#RRGGBB" — icon color (line icons: it is the stroke color); strokeWidth?: number (default 2, thinner = lighter look)
  2) Your own drawing: svg: string — valid <svg>...</svg> markup (paths/basic shapes), when Lucide has nothing suitable (brand logos, special shapes).
  w, h?: number (default 24), name?: string (layer name)

components — to create a reusable component add "component":true to a frame spec (it becomes a Figma main component with the same layout/children). Give it a clear name like "Button/Primary" or "Card/Product".
instance — a copy of an existing component
  component: string — id OR NAME of the main component / component set. Names resolve in this order: components declared with "component":true in the same spec (matched by their "name"), then real node ids, then components already on the page. So in a FULL spec you can place instances like {"type":"instance","component":"Card/Product"} when a frame {"component":true,"name":"Card/Product"} exists in the same spec — no need to wait for ids.
  overrides?: {"<name of a text layer inside the component>": "new text"} — change texts of this instance
  variants?: {"State":"Default", "Size":"Medium"} — choose a variant by its properties when component refers to a component set or one of its variants; all supplied properties must match one variant
  name?, w?, h?, x?, y?, opacity?
  Instances of an existing component appear in serialized trees as {"type":"instance","component":"<id>","componentName":"..."}; an instance you were given directly (selected or inspected) also carries "mainComponentTree" — the structure of its main component with real ids, so you can edit the component without another inspect.
  Inspection also exposes read-only {"type":"component_set","id":"...","name":"Card/Product","variantGroupProperties":{...},"children":[...]} with component children, their "variants" property values, and "interactions" links. Instances carry "componentSet" and their current "variants" when available. Do not emit a component_set as a build spec: create it with combine_variants, edit it by id, and use instances in the design.

ref — existing Figma node that can't be described by this schema (vector, photo fill, etc.). It appears in serialized trees with its "id"; photo nodes also carry "query" — the keywords their photo was found by.
  id: string — the node id; name?, w?, h?, x?, y?, opacity?
  When you rebuild a block (full frame spec / "replace") KEEP every ref node you want to preserve by copying it as {"type":"ref","id":"<id>",...} — it is cloned into the new tree. Dropping it deletes the vector/photo.

Linear and radial gradients are supported in "fill" (frame, rect, ellipse) and image "overlay"; rotation and blurs are in EFFECTS. Not available: blend modes, masks other than "clip", boolean shapes — draw those with svg. Use gradients, glows and glass with restraint (a hero background, an accent button, one glass card over a photo), not on every surface. Native component sets and interactive variants are supported through EDITS MODE: combine_variants and set_interactions.

NO EMOJI: never use emoji or pictographic characters (😀 🔥 ⭐ ✔ 🛒 …) anywhere in the design — not in text, labels, buttons or headings. Wherever an icon is wanted use an "icon" node (Lucide name or your own svg) placed next to the text (e.g. a horizontal frame with icon + text). Plain typography such as © ™ → • is fine.

COMPLEX SHAPES — you decide whether a design needs them. Native nodes (frame, rect with radius, ellipse, gradients, strokes, shadows, icons, photos) are the DEFAULT: they stay editable and responsive. Reach for vector shapes ONLY when the idea cannot be built from them:
- USE: organic decoration (blobs, waves between sections, stars/polygon badges, rings and donut progress), cut-outs (a hole in a card, a notch, a ticket edge), a photo or gradient clipped to a non-rectangular shape (mask), a logo mark or small illustration made from a few primitives, a custom path the user gave.
- DO NOT use for: layout, cards, buttons, inputs, text, standard icons (use icons), anything a rounded rect or ellipse already draws, or a whole illustration (a hero scene of many shapes looks amateur — prefer a stock photo or leave a named placeholder frame). Keep a decoration to roughly 12 shape nodes, name every layer ("Blob / top-right", "Wave divider"), keep decoration low-contrast and BEHIND the content (earlier in children), never under small text.
- Types: {"type":"shape","shape":"blob|wave|star|polygon|ring|path",...}, {"type":"bool","op":"union|subtract|intersect|exclude","children":[shapes]}, "mask":true on a child of a layout:"none" frame, {"op":"reorder"} for layer order. Get the full schema with figma_schema {"name":"shapes"} BEFORE the first use (once per task).
ICON SETS: icons default to Lucide ("arrow-right"). Other sets by prefix: "ph:heart" (Phosphor; styles "ph:heart:fill|bold|light|thin|duotone" — soft, friendly), "tabler:heart" ("tabler:heart:filled" — technical, UI-dense), "ms:home" (Material Symbols; "ms:home:rounded|sharp|fill|rounded-fill|sharp-fill" — Android/Google look). Use ONE set per design and note it in "notes"; mixed sets are reported by lint.

