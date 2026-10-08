# Controls

Give every control a designed anatomy: silhouette, weight, padding, edge, label. The enemy is the framework default wearing the project's accent color, a button that would look identical in any other product. The overcorrection is a bespoke control that loses the affordance, state or reachability the native one had. Accessibility mechanics (focus order, target size, state coverage) live in the `interaction-qa` reference; this file is craft.

## Tactile hierarchy

- **Pair is the consent → accept and decline carry equal visual weight:** same tier, size and optical mass; a lighter decline engineers refusal into acceptance.
- **Pair is the consent → no pre-checked optional box.**
- **Pair is the consent → no decline routed one level deeper** than the accept.
- **Consent means** tracking, marketing, data sharing, and anything a regulator would call a choice.
- **Destructive-action confirmation is not consent**; it keeps its tiers.

Three tiers, distinguishable with color removed:

- **Primary:** one per region, carrying the page's action; most weight: filled surface, heaviest label, largest optical mass.
- **Secondary:** outlined, tinted or ghosted, on the primary's skeleton: same height, radius and label mechanics.
- **Destructive:** reads dangerous before it is read: the state color recut for this direction, never stock red, never the only signal. Pair it with placement and confirmation weight.

Tertiary text action → a link, not a fourth button style. Two tiers differing only in fill percentage → one of them is not a tier.

## Proportion and padding

- **Optical padding, not metric.** Equal numeric padding reads bottom-heavy under most typefaces; adjust until even at the rendered size. Round and uppercase labels read differently.
- **Text-to-icon proportion.** Icon inside a control → sized to the label's cap height, not its em box, separated by a gap from the spacing scale, never a hard-coded margin. Icon-only control → same optical mass as its labelled sibling.
- **Height comes from the type scale.** Control height = label size plus padding rhythm, so a dense table filter and an expressive hero action follow one rule at different densities.

## Edges and silhouette

- **Borders are physical edges**, not outlines: one hairline weight product-wide, from the token, and a stated rule for where an inset hairline, double rule or corner tick applies.
- **One radius scale.** Control radius relates to height by a stated ratio; a pill is a decision, not a rounding accident. Nothing mixes a 4px input with a 24px button.
- **Silhouette carries recognition.** The primary action's shape stays identifiable at thumbnail size with the label hidden.

## Anatomy of the composite controls

- **Segmented control:** one track, dividers or none by rule; selected segment differs by surface and weight, not a second border. The track's inset padding is designed, not a gap.
- **Toggle:** track and thumb art-directed together: off-state track is a real palette surface, the thumb carries the light source used everywhere else, travel distance is a token.
- **Bespoke knobs, dials and ranges:** open where the subject supports them (audio tool, instrument, gauge), built on the native input so keyboard and value semantics survive.
- **Menus and popovers:** enter and exit by one rule: origin edge, transform, timing token. A menu with no origin looks pasted on.
- **Fields:** dense (compact height, hairline edge, tight label) or expressive (generous height, filled surface, floating or stacked label); the direction picks one per surface class and holds it.
- **Field and select text sits vertically centered:** equal block padding around a stated line-height, not a fixed height over the browser default, outside a kit whose fetched fields set their own height.
- **Native select:** `appearance: none` removes the native arrow; draw the chevron from the icon set, with end padding that clears it.
- **Search field:** `appearance: none` on the input, `::-webkit-search-cancel-button` and `::-webkit-search-decoration`; any clear button is the build's own.

## Pressed depth and grouping

- **Pressed reads as depth** in the direction's material: flat direction shifts surface, ambient-light direction lowers elevation, hard-offset direction collapses the offset. Never a color flicker alone.
- **Compositional grouping:** controls acting on the same object share a boundary, gap or track; controls acting on different objects do not. A toolbar of unrelated buttons is a container, not a group.

## Labels

- **Control names its outcome:** **"Save changes"**, **"Create project"**; never "Submit", "Go" or "OK" where an outcome exists to name.
- **One verb per action, product-wide**, held through the flow: button "Publish", progress "Publishing…", toast "Published". No synonyms for one act.
- **Length:** buttons one to three words; toasts one clause; tooltips one sentence.
- **Active voice, present tense, sentence case** unless the type direction states otherwise; cut filler ("please note that", "simply", "just", "in order to").
- **One job per element:** a label labels, an example demonstrates, a tooltip clarifies.
- **Nothing essential lives only in a tooltip.**

## Judgment

- Native control semantics outrank a bespoke silhouette; build the silhouette on the native element.
- The state and reachability floor in the `interaction-qa` reference outranks visual polish on any control.
- Existing repository component conventions outrank these defaults; extend the primitive rather than adding a sibling.
- A control that reads as its tier without color outranks one that needs the accent to be legible.
