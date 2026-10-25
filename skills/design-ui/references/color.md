# Color and materials

Color is a system, not an accent. Build it from the direction's world: the materials, inks and surfaces its artifacts are made of.

## Dominant color and a sharp accent

- Dominant → one hue owns the page's identity over large areas: the chrome rail, a hero ground, big art fields. An even spread of timid hues reads as a template, while one committed hue makes the page recognisable from a thumbnail.
- Accent → one sharp color, kept for the primary action, selection and live status. Used sparingly, it shows where to act; used everywhere, it stops meaning anything.
- Where saturation lives → chrome and art. Reading surfaces stay calm, so content outranks chrome: a page flooded edge to edge with a saturated hue turns white panels into boxes on a poster and the chrome shouts over the posts.
- Per-item hues → items and content types each get their own tint, drawn from the same world, so variety comes from the content.
- Status → one consistent hue per state (ready, updating, queued, error), shown as a dot or fill beside calm text.

## Tokens

- Ground → three value steps (deep, mid, light), so every view shows zones when squinted at, not one muddy or pale field.
- Ink → a tinted dark or light from the same hue family, not neutral gray, so text belongs to its ground.
- Small accent text → its own darker or lighter token, apart from the fill, because a fill that works as a button rarely passes as text.
- Contrast → each text and ground token pair carries its computed ratio in a CSS comment; look.mjs `CONTRAST` lines decide, not the eye.
- Non-text contrast → borders of inputs, icons and focus rings at 3:1 or more against their ground, so controls stay findable.
- Body text on dark → a tinted off-white, not pure `#FFF`, which halates on a dark ground and tires the eye.
- Hover → a lightness change of 8% or more; a smaller shift is invisible on most screens.
- Disabled → about 40% opacity, which reads as off without vanishing.

## Materials and depth

Flat panels on a flat ground read as a wireframe. Give surfaces the finish of the world's materials:

- Light → one light source; layered shadows (a tight contact shadow plus a soft long one) that agree with it.
- Gradients → gentle value shifts that model a surface (lit chrome, a glowing hero, a curved bezel), not purple-to-blue decoration.
- Inset and edge → inner highlights, recessed wells for inputs, bevels where the material has them.
- Large grounds → any ground over about 40% of the viewport gets a surface treatment in the world's terms (grain, halftone, weave, a gradient of light across it); reading surfaces sit on it as sheets. One flat value over a large area reads as unfinished.
- Texture → SVG noise or a printed pattern in the world's terms (paper grain, enamel, woven cloth), at low contrast, never under body text.
- Shape → one radius, border and shadow rule across cards and controls, taken from the direction.
