# Tokens

Store the decision, not the value. The enemy is the token file as paint chart: `--blue-600` on a border here and a button there, so a rebrand becomes a search and replace no one finishes. The overcorrection is a three-tier pipeline with a build step for a page with eleven colors.

The `visual-direction` reference decides palette, topology, and commitment level; the `implementation` reference writes the CSS. This file owns the layer between: token names, what they reference, how a ramp is derived, not picked. Structures here are portable; values are not.

## Tiers

- Semantic token holds an alias, never a literal. Verify: search every file outside the primitive tier for a raw hex, px, or ms literal; a hit = missed alias that breaks a rebrand.
- Repository with a token build → keep tiers in emitted CSS: turn Style Dictionary's `outputReferences` on (off by default, flattens aliases to literals).
- Verify the build: open the generated CSS; a hex where a `var()` chain belongs = one rebrand needs one full rebuild.
- **Primitive**: raw ramp, named for what it is (`--ink-900`), referenced by nothing outside the semantic tier.
- **Semantic**: role the interface actually has: `--ground`, `--surface`, `--border`, `--accent`, `--ink-muted`.
- **Component**: only where a component genuinely diverges from its role; aliases the semantic tier.
- Distinct roles → distinct tokens, even at the same value (border color vs hover surface).
- No component rule reaches past its role to a primitive.
- Verify in the render: page background, a default control's border, and secondary text resolve to three distinct computed values.

## Naming that survives a rebrand

- Name tokens `[element]-[role]-[order]-[state]`; key set identical across themes, only values change.
- Never name a token for appearance. Verify: grep token names outside the primitive tier for color words, brand words, and ramp numbers; diff the key sets of two themes and expect them identical.
- No `$` prefix and no `{`, `}`, or `.` inside a name; DTCG forbids them as its reference syntax.

## The DTCG format, where a repository uses it

DTCG (Design Tokens Community Group) format is a live, unstable draft → follow the repository's pinned draft, not the newest page. Stable enough to design against:

- `$value` is the only required property; `$type`, `$description`, and `$extensions` are optional.
- Design intent → `$description`, not a comment the build discards.
- `$type` inherits from the nearest ancestor group; a group declares its type once.
- Aliases = `{group.token}` references to another token's whole value.
- Use composite types: `border`, `shadow`, `gradient`, `transition`, `typography`, and `strokeStyle`, alongside `color`, `dimension`, `fontFamily`, `fontWeight`, `duration`, `cubicBezier`, and `number`.
- Verify: hand-rolled `-shadow-x` / `-shadow-y` / `-shadow-blur` siblings = exploded composite; the elevation grammar in the `component-system` reference then lives in three places.

No token pipeline (single-file deliverable, small repository) → same architecture in plain custom properties: primitives in one `:root` block, semantic roles alias them, nothing in a component rule that is not a `var()`.

## The role ladder

- Palette = ladder of roles; the ladder transfers, the hues do not.
- Roles: app background, subtle background, UI element background, hovered, active or selected, subtle border, element border and focus ring, hovered border, solid background, hovered solid, low-contrast text, high-contrast text.
- Twelve steps is not a quota; the interface's real roles decide the count.

## Derive the ramp from contrast

- Generate the ramp from anchors and target ratios; do not hand-pick swatches and audit them afterwards.
- Dark scheme = regeneration against another background, not an inversion.
- Verify: sample a computed foreground and its ancestor background, compute the ratio, check it lands on the declared target, not nearby.

## Contrast math and gamut

- Report contrast as WCAG 2.x ratios; an APCA Lc figure may accompany a pass claim, never replace it.
- Out-of-gamut `oklch()` is mapped, not clipped, so authored chroma is a request. Verify the painted pixel by screenshot sample, not the computed value, which round-trips as authored.
- P3 = enhancement behind `@media (color-gamut: p3)`. Verify: disable the P3 block; a legible sRGB declaration still stands.

## Judgment

- Existing repository tokens, tiers, naming, and build configuration outrank every default here; extend them by role.
- Architecture transfers, values do not: adopting another system's ladder is craft; adopting its hues borrows another product's identity.
- A verified contrast ratio outranks a generated ramp's promise, and a sampled pixel outranks a computed value.
- The inventory in the `composition` reference decides the roles, not this ladder.
