# Tokens

Store the decision, not the value. The enemy is the token file that is a paint chart: `--blue-600` used for a border in one place and a button in another, so the rebrand becomes a search and replace no one finishes. The overcorrection is a three-tier pipeline with a build step for a page with eleven colors.

The `visual-direction` reference decides the palette, the topology, and the commitment level. The `implementation` reference writes the CSS. This file owns the shape of the layer between them: what a token is named, what it references, and how a ramp is derived rather than picked. Structures here are portable; values are not.

## Tiers

- A semantic token holds an alias, never a literal. Verify: search every file outside the primitive tier for a raw hex, px, or ms literal; a hit is a missed alias that breaks a rebrand.
- In a repository with a token build, keep the tiers in emitted CSS: turn Style Dictionary's `outputReferences` on, since it is off by default and flattens aliases to literals.
- Verify the build: open the generated CSS; a hex where a `var()` chain belongs means one rebrand equals one full rebuild.
- **Primitive** — the raw ramp. Named for what it is, `--ink-900`, and referenced by nothing outside the semantic tier.
- **Semantic** — the role the interface actually has: `--ground`, `--surface`, `--border`, `--accent`, `--ink-muted`.
- **Component** — only where a component genuinely diverges from its role, and it aliases the semantic tier.
- Distinct roles get distinct tokens: a border color and a hover surface are different roles, so different tokens even at the same value.
- No component rule reaches past its role to a primitive.
- Verify in the render: the page background, a default control's border, and secondary text resolve to three distinct computed values.

## Naming that survives a rebrand

- Name tokens `[element]-[role]-[order]-[state]`; the key set is identical across themes, only values change.
- Never name a token for appearance. Verify: grep token names outside the primitive tier for color words, brand words, and ramp numbers; diff the key sets of two themes and expect them identical.
- No `$` prefix and no `{`, `}`, or `.` inside a name, which the DTCG format forbids because those are its reference syntax.

## The DTCG format, where a repository uses it

The Design Tokens Community Group format is a live, unstable draft. Follow the repository's pinned DTCG draft, not the newest page. What is stable enough to design against:

- `$value` is the only required property; `$type`, `$description`, and `$extensions` are optional.
- Design intent belongs in `$description`, not in a comment the build discards.
- `$type` is inherited from the nearest ancestor group, so a group declares its type once.
- Aliases are `{group.token}` references to another token's whole value.
- Use composite types: `border`, `shadow`, `gradient`, `transition`, `typography`, and `strokeStyle`, alongside `color`, `dimension`, `fontFamily`, `fontWeight`, `duration`, `cubicBezier`, and `number`.
- Verify: hand-rolled `-shadow-x` / `-shadow-y` / `-shadow-blur` siblings mean a composite was exploded, and the elevation grammar in the `component-system` reference then lives in three places.

Outside a token pipeline, such as a single-file deliverable or a small repository, the same architecture holds in plain custom properties. Put primitives in one `:root` block, have semantic roles alias them, and write nothing in a component rule that is not a `var()`.

## The role ladder

- A palette is a ladder of roles, and the ladder transfers; the hues are not portable.
- The ladder's roles: app background, subtle background, UI element background, hovered, active or selected, subtle border, element border and focus ring, hovered border, solid background, hovered solid, low-contrast text, high-contrast text.
- Twelve steps is not a quota; the interface's real roles decide the count.

## Derive the ramp from contrast

- Generate the ramp; do not hand-pick swatches and audit them afterwards.
- Pick anchors and target ratios, then generate; the dark scheme is a regeneration against another background, not an inversion.
- Verify: sample a computed foreground and its ancestor background, compute the ratio, and check it lands on the declared target rather than somewhere nearby.

## Contrast math and gamut

- Report contrast as WCAG 2.x ratios; an APCA Lc figure may accompany a pass claim, never replace it.
- Out-of-gamut `oklch()` is mapped, not clipped, so an authored chroma is a request; verify the painted pixel by screenshot sample, not by reading the computed value back, which round-trips as authored.
- P3 is an enhancement behind `@media (color-gamut: p3)`. Verify: disable the P3 block and confirm a legible sRGB declaration still stands.

## Judgment

- Existing repository tokens, tiers, naming, and build configuration outrank every default here; extend them by role.
- Architecture transfers, values do not: adopting another system's ladder is craft, adopting its hues borrows another product's identity.
- A verified contrast ratio outranks a generated ramp's promise, and a sampled pixel outranks a computed value.
- The inventory in the `composition` reference decides the roles, not this ladder.
