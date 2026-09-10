# Controls

Give every control a designed anatomy: silhouette, weight, padding, edge, and label. The enemy is the framework default wearing the project's accent color — a button that would look identical in any other product. The overcorrection is a bespoke control that loses the affordance, state, or reachability the native one had. Accessibility mechanics — focus order, target size, state coverage — live in `interaction-qa.md`; this file is craft.

## Tactile hierarchy

Three tiers, distinguishable with color removed:

- **Primary** — one per region, carrying the page's action. It earns the most weight: filled surface, the heaviest label, the largest optical mass.
- **Secondary** — outlined, tinted, or ghosted, but built from the same skeleton as the primary. Same height, same radius, same label mechanics.
- **Destructive** — reads dangerous before it is read: the state color recut for this direction, never a stock red, and never the only signal. Pair it with placement and confirmation weight.

A tertiary text action is a link, not a fourth button style. If two tiers differ only in fill percentage, one of them is not a tier.

## Proportion and padding

- **Optical padding, not metric.** Equal numeric padding reads bottom-heavy under most typefaces; adjust until it looks even at the rendered size. Round labels read differently from uppercase labels.
- **Text-to-icon proportion.** An icon inside a control is sized to the label's cap height, not to its em box, and separated by a gap from the spacing scale — never by a hard-coded margin. An icon-only control keeps the same optical mass as its labelled sibling.
- **Height comes from the type scale.** Control height is a function of label size and the padding rhythm, so a dense table filter and an expressive hero action come from the same rule at different densities.

## Edges and silhouette

- **Borders are physical edges**, not outlines: one hairline weight product-wide, from the token, and a stated rule for where an inset hairline, a double rule, or a corner tick applies.
- **One radius scale.** A control's radius relates to its height by a stated ratio; a pill is a decision, not a rounding accident. Nothing mixes a 4px input with a 24px button.
- **Silhouette carries recognition.** The shape of the primary action should be identifiable at thumbnail size, with the label hidden.

## Anatomy of the composite controls

- **Segmented control** — one track, dividers or none by rule, the selected segment differing by surface and weight rather than by a second border. The track's inset padding is part of the design, not a gap.
- **Toggle** — track and thumb are art-directed together: the track's off state is a real surface from the palette, the thumb carries the light source used everywhere else, and the travel distance is a token.
- **Bespoke knobs, dials, and ranges** are open where the subject supports them — an audio tool, an instrument, a gauge — built on the native input so keyboard and value semantics survive.
- **Menus and popovers** — the surface enters and exits by one rule: the origin edge, the transform, the timing token. A menu that appears with no origin looks pasted on.
- **Fields** — dense treatment (compact height, hairline edge, tight label) and expressive treatment (generous height, filled surface, floating or stacked label) are both available; the direction picks one per surface class and holds it.

## Pressed depth and grouping

- **Pressed reads as depth**, matching the direction's material: a flat direction shifts surface, an ambient-light direction lowers elevation, a hard-offset direction collapses the offset. Never a color flicker alone.
- **Compositional grouping** — controls acting on the same object share a boundary, a gap, or a track; controls acting on different objects do not. A toolbar of unrelated buttons is a container, not a group.

## Labels

- **A control names its outcome:** **"Save changes"**, **"Create project"** — never "Submit", "Go", or "OK" where an outcome exists to name.
- **One verb per action, product-wide**, held through the whole flow: the button says "Publish", the progress state says "Publishing…", the toast says "Published". Every synonym for one act is a signpost pointing two directions.
- **Length discipline:** buttons one to three words; toasts one clause; tooltips one sentence.
- **Active voice, present tense, sentence case** unless the type direction states otherwise, and no filler — "please note that", "simply", "just", "in order to" go on sight.
- **One job per element.** A label labels. An example demonstrates. A tooltip clarifies, and nothing essential lives only in a tooltip.

## Judgment

- Native control semantics outrank a bespoke silhouette; build the silhouette on the native element.
- The state and reachability floor in `interaction-qa.md` outranks visual polish on any control.
- Existing repository component conventions outrank these defaults; extend the primitive rather than adding a sibling.
- A control that reads as its tier without color outranks one that needs the accent to be legible.
