# Typography

Cast type from the subject's observable traits and the text it must carry. The enemy is a familiar default selected without evidence. The overcorrection is novelty without language coverage, legibility, or the weights the page uses.

## Roles

- **Display**: characterful face for headlines, hero, perhaps one pull quote. Display face everywhere → nothing is display.
- **Body** — text set at 16px or larger, or 14px in dense data UI, with line-height at least 1.5, every used weight loaded, and a true italic when italic text appears.
- **Utility**: add only for data tables, captions or code; tabular figures required for changing numeric columns.

- Face count → direction and text decide; two faces is one option, not a quota.
- Options: display-and-body pair, or one family as a stated concept with display and body separated by at least 200 weight units or different width-axis values.
- Further face → only when data needs tabular figures the chosen faces lack, or code needs a monospace.

## Source by character, not by list

No category-to-face recipe: it designs every product in a category alike. `scripts/overused-fonts.mjs` bans families that mean the search stopped (Roboto, Arial, Fraunces, Playfair, Space Grotesk, DM Sans and kin); `direction.mjs --check` rejects them.

1. **Inspect the repository first.** Find existing `@font-face` rules, font links or imports, font packages, brand CSS, loading conventions. Existing fonts = evidence, not veto: inside the redesign's scope, existing face supports the direction's type spec → extend it; does not → replace with a verified, loadable face.
2. **Write the type spec.** From Phase 1, name three to five observable traits (serif construction, width, stroke contrast, terminal shape, x-height, era or tradition), each tied to one subject observation.
3. **Pick the face.**
   - Well-made, current face whose mood fits the type spec, not an odd or dated face picked to look unusual.
   - Match the product's mood and audience, not a costume of its domain (stencil type for a warehouse).
   - Face the build can load: Fontsource (npm import with a manifest, self-hosted files without one) or the repository's own; never the Google Fonts CDN unless the repository already uses it.
   - Record family, provenance `chosen`, the matched traits as `matchEvidence`, and `loadSource` in the contract.
   - A brand that owns a banned family records repository or brief provenance in the contract.
   - System stack = recorded gap to replace, never a finished display choice.
4. **Vet the winner.**
   - Require only the weights or axes the selected roles use; never reject a suitable display face for lacking unused ones.
   - Verify true italics, not slants.
   - Sets data → verify tabular and lining figures.
   - Verify language coverage for the audience.
   - Verify it holds up at text sizes, not display-only.
   - Confirm the face loads in the build: repository asset, the project's existing hosted-font convention, or a file this change adds. Face the page cannot load is not a choice.
   - Platform or system face → fallback choice only where repository, network, licensing, or delivery constraints block adding a suitable font; record the blocking constraint.
5. **Define fallback behavior.**
   - Name a tested system fallback stack per role and a `font-display` policy consistent with repository conventions.
   - Claim metric compatibility only where measurement establishes it.
   - Phase 5 render → verify from `scripts/inspect-styles.mjs` `font_render_check` that the chosen face loaded, not its fallback (only platform-font evidence grades `definite`), and layout survives the fallback stack. CSS declarations alone confirm nothing.

## Pairing

Pair faces that differ on at least one named construction, width, contrast, or weight axis and share at least one named era, proportion, or skeleton trait.

- Contrast **construction**, share **era or proportions**: didone display over transitional text face.
- Contrast **weight and width**, share **skeleton**: compressed heavy grotesque over its normal-width sibling, or one variable family doing both.
- Serif-and-sans **superfamily**: two constructions cut from one skeleton.
- Utility face differs from body in construction or width; sets changing numeric columns → supplies tabular figures.

Test: display over two sentences of body at rendered sizes; reject the pair unless it meets both named-axis rules.

## Scale

- Ratio between adjacent steps: **1.25 by default**; below it hierarchy flattens (the `visual-critique` reference), so a tighter step needs a stated density or existing-scale reason. By density:
  - 1.25: dense product UI, dashboards
  - 1.333–1.414: marketing pages, moderate drama
  - 1.5–1.618+: editorial and expressive work
- Scale → fluid `clamp()` tokens (the `implementation` reference); afterward only the tokens.
- **Weights are steps too.** Hierarchy roles separated by at least 200 weight units (400 → 600). Variable font → each used value in a role token.
- **Width is a hierarchy tool.** Condensed display cut against normal-width body = contrast without a second family.
- **Oversized display**: card names the headline as focal point → 10–16vw via `clamp()`, tracking −1% to −3%, leading 0.95–1.05.

## Micro rules: the craft floor

- Measure: 45–75ch for body; set `max-inline-size` in `ch`.
- Leading inverse to size: body 1.5–1.7; display 0.95–1.15.
- Tracking: tighten large display slightly (`letter-spacing: -0.01em` to `-0.02em`); loosen ALL-CAPS and small labels (`+0.03em` to `+0.08em`); never letterspace lowercase body text.
- Set labels in sentence case; ALL-CAPS is a short label the direction names, never the default and never a sentence.
- Monospace sets code only, never amounts, times or order numbers; those take the body face with `tabular-nums`.
- `font-variant-numeric: tabular-nums` in any column, timer, or stat that changes.
- `font-optical-sizing: auto` whenever an `opsz` axis exists.
- Real quotation marks and apostrophes (“ ” ’), real dashes.
- No faux bold or faux italic: browser synthesizes a missing weight or slant → load the real one or restructure.
- Ragged-right unless the brief explicitly requests justification; justified text → hyphenation on.
- Chosen face provides a variable file → one per family, registered properties for `wght`, `wdth`, `opsz`; raw `font-variation-settings` only for custom axes.

## Judgment

- Language coverage, legibility at the rendered size, and real weights/italics outrank novelty.
- Existing brand type and project loading conventions outrank this reference's sourcing defaults.
- The Phase 1 type spec outranks font familiarity or blacklist avoidance alone.
