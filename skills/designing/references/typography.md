# Typography

Cast type from the subject's observable traits and the text it must carry. The enemy is a familiar default selected without evidence. The overcorrection is novelty without language coverage, legibility, or the weights the page uses.

## Roles

- **Display** — the characterful face: headlines, the hero, perhaps one pull quote. When the display face is everywhere, nothing is display.
- **Body** — text set at 16px or larger, or 14px in dense data UI, with line-height at least 1.5, every used weight loaded, and a true italic when italic text appears.
- **Utility** — add only for data tables, captions, code, or spec labels; require tabular figures for changing numeric columns.

Two faces is one option, not a quota: a display-and-body pair, or one family carried as a stated concept with display and body separated by at least 200 weight units or different width-axis values. Add a further face when data, code, or labels need tabular figures or a character grid absent from what is chosen. Let the direction and the text decide the count.

## Source by character, not by list

Any fixed list of "distinctive fonts" becomes next year's cliché, and a category-to-face recipe designs every product in a category alike. A ban list is the opposite instrument: `scripts/overused-fonts.mjs` names the families that mean the search stopped (Inter, Roboto, Arial, Fraunces, Playfair, Space Grotesk, DM Sans and their kin), the candidate gate excludes them on every route, and nothing there suggests a face. Cast from a description, never a shortlist:

1. **Inspect the repository first.** Find existing `@font-face` rules, font links or imports, font packages, brand CSS, and loading conventions. Existing fonts are evidence, not a veto: inside the redesign's scope, judge whether the existing face supports the direction's type spec — extend it when it does, replace it with a verified, loadable face when it does not.
2. **Write the type spec.** From Phase 1, name three to five observable traits: serif construction, width, stroke contrast, terminal shape, x-height, and era or tradition. Tie each trait to one subject observation.
3. **Translate those traits into search vocabulary** in the subject's own words rather than its product category.
4. **Run the candidate gate.** Do not name a new typeface from memory. Encode the spec as JSON — including allowed licenses and delivery modes — and run `scripts/font-candidates.mjs`, saving its successful stdout unchanged as `font-candidates.json` beside the contract files, outside the repository; a constraint the provider cannot enforce excludes candidates or restricts the run rather than warning, and the choice is made only from the returned eligible set, recording family, candidate ID, provider, and the selected load mode and source in the contract, where `--check --candidates` verifies them. When the script reports unavailable, retry with `--source fontsource`; when that also fails, the choice set is the repository's loaded faces, with the blocking constraint recorded, and a system stack is a recorded gap to replace, never a finished display choice — never a remembered family. A brand that owns a banned family passes `--allow-overused` and records that provenance in the contract.
5. **Vet the winner:** require only the weights or axes the selected roles use, never rejecting a suitable display face for exposing fewer unused ones. Then verify separately: true italics, not slants; tabular and lining figures if it will set data; language coverage for the audience; and that it holds up at text sizes rather than display-only. Confirm the face actually loads in the build — a repository asset, the project's existing hosted-font convention, or a file this change adds; a face the page cannot load is not a choice. A platform or system face is the fallback choice only where repository, network, licensing, or delivery constraints block adding a suitable font; record the blocking constraint.
6. **Define fallback behavior.** Name a tested system fallback stack per role and a `font-display` policy consistent with repository conventions; claim metric compatibility only where measurement establishes it. In the Phase 5 render, verify from `scripts/inspect-styles.mjs` `font_render_check` that the chosen face loaded rather than its fallback — only platform-font evidence grades `definite` — and that layout survives the fallback stack; CSS declarations alone confirm nothing.

A face outside the candidate set is valid only with repository or explicit-brief provenance, recorded in the contract; provenance, not motive, is what the critique checks.

## Pairing

Pair faces that differ on at least one named construction, width, contrast, or weight axis and share at least one named era, proportion, or skeleton trait.

- Contrast **construction**, share **era or proportions** — a didone display over a transitional text face.
- Contrast **weight and width**, share **skeleton** — a compressed heavy grotesque over its normal-width sibling, or one variable family doing both.
- A serif-and-sans **superfamily** supplies two constructions cut from one skeleton.
- A utility face differs from body in construction or width and supplies tabular figures when it sets changing numeric columns.

Set the display over two sentences of body at rendered sizes; reject the pair unless it meets both named-axis rules.

## Scale

- Ratio between adjacent steps: **1.25 by default**; below it hierarchy flattens (`visual-critique.md`), so a tighter step needs a stated density or existing-scale reason. By density:
  - 1.25 — dense product UI, dashboards
  - 1.333–1.414 — marketing pages, moderate drama
  - 1.5–1.618+ — editorial and expressive work
- Build the scale as fluid `clamp()` tokens (`implementation.md`); afterward use only the tokens.
- **Weights are steps too.** Separate hierarchy roles by at least 200 weight units (400 → 600). With a variable font, store each used value in a role token.
- **Width is a hierarchy tool.** A condensed cut for display against normal-width body creates contrast without a second family.
- **Oversized display** applies when the card names the headline as its focal point: 10–16vw via `clamp()`, tracking −1% to −3%, leading 0.95–1.05.

## Micro rules — the craft floor

- Measure: 45–75ch for body; set `max-inline-size` in `ch`.
- Leading inverse to size: body 1.5–1.7; display 0.95–1.15.
- Tracking: tighten large display slightly (`letter-spacing: -0.01em` to `-0.02em`); loosen ALL-CAPS and small labels (`+0.03em` to `+0.08em`); never letterspace lowercase body text.
- ALL-CAPS for short labels only, never sentences.
- `font-variant-numeric: tabular-nums` in any column, timer, or stat that changes.
- `font-optical-sizing: auto` whenever an `opsz` axis exists.
- Real quotation marks and apostrophes (“ ” ’), real dashes. No faux bold or faux italic — if the browser synthesizes a missing weight or slant, load the real one or restructure.
- Enable hyphenation for justified text. Use ragged-right unless the brief explicitly requests justification.
- One variable file per family when the chosen face provides it, registered properties for `wght`, `wdth`, and `opsz`, raw `font-variation-settings` only for custom axes.

## Judgment

- Language coverage, legibility at the rendered size, and real weights/italics outrank novelty.
- Existing brand type and project loading conventions outrank this reference's sourcing defaults.
- The Phase 1 type spec outranks font familiarity or blacklist avoidance alone.
