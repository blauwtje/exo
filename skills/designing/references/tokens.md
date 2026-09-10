# Tokens

Store the decision, not the value. The enemy is the token file that is a paint chart: `--blue-600` used for a border in one place and a button in another, so the rebrand becomes a search and replace no one finishes. The overcorrection is a three-tier pipeline with a build step for a page with eleven colors.

`visual-direction.md` decides the palette, the topology, and the commitment level. `implementation.md` writes the CSS. This file owns the shape of the layer between them: what a token is named, what it references, and how a ramp is derived rather than picked. Every structure below is portable; **no value below is**. A ladder is architecture, a hue is a look, and importing the second is how a design starts wearing another product's identity.

## Tiers

Three tiers, and the tier is the whole point:

- **Primitive** — the raw ramp. Named for what it is, `--ink-900`, and referenced by nothing outside the semantic tier.
- **Semantic** — the role the interface actually has: `--ground`, `--surface`, `--border`, `--accent`, `--ink-muted`. Every one of these is an alias, never a literal.
- **Component** — only where a component genuinely diverges from its role, and it aliases the semantic tier.

Tiering is a convention you enforce, not a feature you get: Style Dictionary states plainly that "you can organize and name your design tokens however you want, there are no restrictions" ([styledictionary.com/info/tokens](https://styledictionary.com/info/tokens/), v5 docs, read 2026-09-07). Verify: search every file outside the primitive tier for a raw hex, px, or ms literal. A semantic token holding a literal is a missed alias, and it is the thing that breaks a rebrand.

In a repository with a token build, keep the tiers in the emitted CSS: Style Dictionary's `outputReferences` is off by default, and with it off the generated CSS flattens `--surface` down to a hex instead of `var(--surface-primitive)` ([predefined formats](https://styledictionary.com/reference/hooks/formats/predefined/), read 2026-09-07). Verify: open the generated CSS; a hex where a `var()` chain belongs means one rebrand equals one full rebuild.

## Naming that survives a rebrand

- **Role, order, state — never appearance.** Carbon's convention is `[element]-[role]-[order]-[state]`, and its binding rule is that "color token names and roles are the same across themes, only the assigned value will change with the theme" (carbondesignsystem.com, Carbon v11; retrieved via first-party search text on 2026-09-07, page body not renderable). Verify: grep token names outside the primitive tier for color words, brand words, and ramp numbers; diff the key sets of two themes and expect them identical.
- **No `$` prefix and no `{`, `}`, or `.` inside a name**, which the DTCG format forbids because those are its reference syntax ([designtokens.org drafts preview, 2026-07-30](https://www.designtokens.org/TR/drafts/format/)).
- Names are full words, kebab-case, like every other identifier in the project.

## The DTCG format, where a repository uses it

The Design Tokens Community Group format is a **live, unstable draft**: the Third Editors' Draft is dated 2025-07-20 and marked "considered unstable, and should not be implemented", and the 2026-07-30 preview says "do not attempt to implement this version". Follow the repository's pinned draft, not the newest page. What is stable enough to design against:

- `$value` is the only required property; `$type`, `$description`, and `$extensions` are optional. Design intent belongs in `$description`, not in a comment the build discards.
- `$type` is **inherited from the nearest ancestor group**, so a group declares its type once.
- Aliases are `{group.token}` references to another token's whole value.
- **Composite types exist: use them.** `border`, `shadow`, `gradient`, `transition`, `typography`, and `strokeStyle`, alongside `color`, `dimension`, `fontFamily`, `fontWeight`, `duration`, `cubicBezier`, and `number`. Verify: hand-rolled `-shadow-x` / `-shadow-y` / `-shadow-blur` siblings mean a composite was exploded, and the elevation grammar in `component-system.md` then lives in three places.

Outside a token pipeline — a single-file deliverable, a small repository — the same architecture holds in plain custom properties: primitives in one `:root` block, semantic roles aliasing them, and nothing in a component rule that is not a `var()`.

## The role ladder

A palette is a ladder of **roles**, and the ladder is what transfers. Radix Colors publishes the clearest published version of it, twelve steps deep ([radix-ui.com/colors, palette composition, read 2026-09-07](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale); 1,658★): app background, subtle background, UI element background, hovered, active or selected, subtle border, element border and focus ring, hovered border, solid background, hovered solid, low-contrast text, high-contrast text.

Twelve steps is not a quota — the interface's real roles decide the count, and `implementation.md` already says to build the roles the interface has. What the ladder gives is the discipline: a border color and a hover surface are **different roles**, so they are different tokens even when they start life the same value, and no component rule ever reaches past its role to a primitive. Verify in the render: the page background, a default control's border, and secondary text resolve to three distinct computed values, none equal to another.

The hues are Radix's look. Taking the roles is architecture; taking the values is a clone.

## Derive the ramp from contrast

Pick the anchors and the target ratios, then generate; do not hand-pick swatches and audit them afterwards. Leonardo's whole premise is "using contrast ratio as the starting point, rather than a post-color-selection auditing process" ([github.com/adobe/leonardo, read 2026-09-07](https://github.com/adobe/leonardo)). Its parameters name the procedure: `colorKeys` are the colors to interpolate between, `ratios` are the targets each generated step must hit, `colorspace` selects the interpolation space, and a theme's `lightness`, `contrast`, and `saturation` regenerate the whole set against a chosen background ([contrast-colors README, `main`, read 2026-09-07](https://github.com/adobe/leonardo/blob/main/packages/contrast-colors/README.md)).

This is the mechanism behind "contrast by construction" in `visual-direction.md`: the ratio is an input, so the dark scheme is a regeneration against a different background rather than an inversion. Verify: sample a computed foreground and its ancestor background, compute the ratio, and check it lands on the declared target rather than somewhere nearby.

## Contrast math and gamut

- **WCAG 2.x is the standard to report against: 4.5:1 and 3:1.** APCA is not normative in any shipped version — its own repository says it "is being evaluated as a replacement for WCAG 2 contrast math for future standards" ([github.com/Myndex/apca-w3](https://github.com/Myndex/apca-w3), library 0.1.9 beta, algorithm 0.0.98G-4g dated 2021-02-15), and W3C states that "WCAG 3 is currently an incomplete draft" whose "final requirements will be different" ([w3.org WCAG 3 introduction, updated 2026-03-03](https://www.w3.org/WAI/standards-guidelines/wcag/wcag3-intro/)). An Lc figure may accompany a pass claim as extra evidence; it never replaces the ratio.
- APCA's own thresholds, for that supplementary reading: Lc 90 preferred body text, Lc 75 minimum for body columns, Lc 60 minimum content text, Lc 45 minimum headlines, with the explicit caveat that no single figure works "without considering the use case, size, thickness" ([git.apcacontrast.com/documentation/WhyAPCA.html](https://git.apcacontrast.com/documentation/WhyAPCA.html), undated).
- **Out-of-gamut `oklch()` is mapped, not clipped.** CSS Color 4 specifies that such a color "would need to be CSS gamut mapped for display, producing a similar-looking but lower chroma (less saturated) color" ([CSS Color 4, Candidate Recommendation Draft 2026-09-01](https://www.w3.org/TR/css-color-4/#gamut-mapping)). So an authored chroma is a request; verify the painted pixel by screenshot sample, not by reading the computed value back, which round-trips as authored.
- **P3 is an enhancement behind `@media (color-gamut: p3)`** ([MDN, last modified 2026-04-20](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/color-gamut)). Verify: disable the P3 block and confirm a legible sRGB declaration still stands.

## Judgment

- Existing repository tokens, tiers, naming, and build configuration outrank every default here; extend them by role.
- Architecture transfers, values do not: adopting another system's ladder is craft, adopting its hues is the transferable default this skill exists to prevent.
- A verified contrast ratio outranks a generated ramp's promise, and a sampled pixel outranks a computed value.
- A role that the interface does not have needs no token; the inventory in `composition.md` decides the roles, not this ladder.
- WCAG 2.x is what a pass claim is stated in until a successor ships.
