# Color and materials

Color is a system, not an accent. Build it from the direction's world: the materials, inks and surfaces its artifacts are made of.

## Dominant color and a sharp accent

- Dominant: one hue owns the page's identity over large areas: the chrome rail, a hero ground, big art fields.
- Accent: one sharp color, kept for the primary action, selection and live status. Bad: orange on links, badges, icons and three buttons at once.
- Where saturation lives: chrome and art. Reading surfaces stay calm, so content outranks chrome; a saturated hue flooding the page edge to edge does not.
- Per-item hues: items and content types each get their own tint, drawn from the same world, so variety comes from the content.
- Status: one consistent hue per state (ready, updating, queued, error), shown as a dot or fill beside calm text.

## Tokens

- Ground: three value steps (deep, mid, light), so every view shows zones when squinted at.
- Ink: a tinted dark or light from the same hue family, not neutral gray (a warm brown ink on paper, not `#666` gray).
- Small accent text: its own darker or lighter token, apart from the fill.
- Contrast: each text and ground token pair carries its computed ratio in a CSS comment.
- Non-text contrast: borders of inputs, icons and focus rings at 3:1 or more against their ground.
- Body text on dark: a tinted off-white, not pure `#FFF` (`#E9E4D8` on deep green).

## Materials and depth

Give surfaces the finish of the world's materials:

- Light: one light source; layered shadows (a tight contact shadow plus a soft long one) that agree with it.
- Gradients: gentle value shifts that model a surface (lit chrome, a glowing hero, a curved bezel), not purple-to-blue decoration.
- Inset and edge: inner highlights, recessed wells for inputs, bevels where the material has them.
- Large grounds: any ground over about 40% of the viewport gets a surface treatment in the world's terms (grain, halftone, weave, SVG noise, a gradient of light) at low contrast and not under body text; reading surfaces sit on it as sheets.
- Shape: one radius, border and shadow rule across cards and controls, taken from the direction.
