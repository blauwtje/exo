# Visual Direction

Decide the direction from references, render it, and select it before production code changes. The enemy is the direction chosen as prose and never seen — a paragraph of adjectives standing in for a rendered page. The overcorrection is forcing variants onto a task whose direction is already settled.

## Design context first

- Read docs/design/DESIGN.md whenever it exists and the task affects visual decisions; load only the sections the task needs, through `scripts/context.mjs`.
- Extract an existing design system from code before proposing a replacement.
- Create or update DESIGN.md only after explicit user approval of a durable visual identity or an approved redesign. Completing an implementation is not approval.
- Keep unapproved directions and experiments ephemeral.
- No DESIGN.md for one-off prototypes, isolated fixes, or pages that establish no durable identity.
- Page-specific approved deviations go in `docs/design/surfaces/<surface>.md`, holding only the delta.
- Implementation details and generated CSS values stay in code; anti-references and rejected defaults persist only where durable.
- A `potentially-stale` or `unknown` status from `scripts/context.mjs` is reported, not resolved silently; flag a decision that conflicts with current tokens, components, or approved screenshots.
- Ask before changing an approved durable decision.

## Reference, variant, selection

Run this loop for an open identity, one that does not exist yet or that the brief lets be replaced:

1. Inspect what exists first — repository assets, `docs/design/`, and any prior approved renders.
2. Where visual research capability is available in the session, gather a small, visually diverse reference set and extract relationships across composition, typography, chroma, geometry, imagery, material and light, and motion. Record what to borrow and what to reject. Do not route the decision through a named style label; the borrow-and-reject list is the output, not a style name.
3. Deal, fill, and `--check` three contracts below; nothing is asked between `--check` and the picker.
4. Build one comp per variant — one screenful of the real surface, real content, one self-contained HTML file, no build step — into `variant-<n>/index.html` under scratch output outside the repository, and run `scripts/pick.mjs --comps <dir> --frame <w>x<h>`, which shows every comp live at one shared scale and prints the clicked index. The `title` and `description` on each contract are what the chooser reads: plain words, no axis ids; mark your own pick with `--recommend <n>`. The whole set is one turn's work, and the comps stay under the run directory after Build. `pick.mjs` exit 3: the recommended contract is the selection, with no question in the terminal, **before** any production code changes.
5. Select autonomously only where the user delegated the choice, the picker exited 3, or a planning turn allows no picker; record the rationale in the contract.
6. `--select` freezes the choice; the other variants stay under the run directory.

A settled design system, a local component inside one, and a tweak each produce one direction, no variants, and no selection gate. Never force variants there.

## Direction contract

Each variant of an open identity or consequential redesign fills a contract from `scripts/direction.mjs --plan` in an axis space derived from Phase 1 evidence: each value carries a machine-readable payload and its evidence, and built-in vocabulary supplies shapes, not the option set. `--check` proves divergence, filled fields, and expectations, and names the allowed vocabulary of any field it rejects; `--select` prints the frozen contract; redirected into the run directory's `contract-selected.json`, it is what Build, the critique, and QA read. Every planned quiet region carries one named job from that enum, repaired with a vector, an edge relationship, a counterweight, or a scale cue, never decoration alone.

## Palette

Name tokens by role, never by hue — `--accent`, not `--orange`. Derivation mechanics live in `implementation.md`; this file decides.

- **Topology is a named choice**, with no default: one ramp mixed from two anchors; several named ramps; or a regionally chromatic surface. Every ramp is deliberately anchored.
- **Commitment is a named level**, with no default and no escalation trajectory: *restrained* — accent at the focal point and named signals only; *committed* — one saturated color carries a named set of whole regions; *drenched* — the surface is the color. The last two recut neutrals against the new ground and re-verify every pairing.
- **State colors are natives, not imports.** Keep the hue convention — reddish reads destructive, greenish reads fine — then recut inside the band (danger ≈ 20–35, warning ≈ 70–95, success ≈ 140–160 in oklch) at the accent's lightness and chroma. Add a state color only for a state the interface can enter.
- **Neutrals carry the direction.** Hue-trace ground and ink at chroma 0.005–0.03 from the accent's neighborhood; warm paper versus cool slate is a direction decision. Achromatic neutrals are a named decision, recorded and contrast-verified like any other.
- **The dark scheme is a second design**, built only when the brief asks or the product already exposes one. Recompose, don't invert: ground keeps the hue trace at L 0.14–0.22, `#000` is never the default, raised surfaces gain lightness and lose chroma, and accents, inks, and borders are re-picked. Hierarchy moves to borders and surface steps, supplemented by a shadow only where it is verified visible on the dark ground, and contrast is re-verified on the dark side.

**Contrast by construction** — choose token lightness against explicit ratios before component styling:

- Body ink on ground: verify a ratio of at least 4.5:1.
- Name each accent use. UI chrome and text at least 24px, or 18.66px and bold, require 3:1; all smaller text requires 4.5:1. When one accent value misses either threshold, derive separate display and interactive values at the same hue with different lightness.
- Muted ink is the usual casualty: "muted" never drops below AA.

Name each accent use and its regional assignment in the contract; the render's measured distribution, not the stylesheet, is the evidence a hue carries the regions it claims.

## Material, depth, and atmosphere

One coherent physical logic per direction: state the light source and the lighting model, then hold them. Deliberate material contrast between semantic regions is open where one logic explains both. The grammars are vocabulary, not a one-per-page constraint:

- **Flat + borders** — hierarchy from hairlines and surface steps.
- **Soft ambient light** — layered diffuse shadows, one light direction, tokened elevation.
- **Hard offset** — solid shadows and thick strokes, for a neobrutalist direction.
- **Layered translucency** — blur and glass, only over real changing content.

The background is a designed surface, never an untouched default: a deliberate solid ground, a hue-traced ground, a gradient field with a named light source, or a subject-derived texture — grain, paper, graph grid, planning, fabric. Judge atmosphere layers by whether two do the same job, never by their count. Judge texture from the render, not a preset opacity: perceptible at 390px and 1440px where the contract names it, invisible where it is not doing a job, and body-text contrast still at the floor on top of it. Ambient movement passes the job gate in `motion.md` and keeps a static fallback under reduced motion.

The focal point may earn what a tell denies elsewhere — a glow where the subject emits light, glass over its layered content, one gradient with named hue logic — when an observation and a named job back it.

## Visual material and imagery

Inventory before invention: list what the repository and subject already own — assets, illustrations, an icon set, fonts, tokens, real data. Owned assets are inspected first, not automatic winners; an unsuitable one may be replaced or reframed inside the redesign's scope.

- **Every image names one job** — evidence, instrument, identity, or mood tied to the direction. A region that cannot name its image's job loses the image, not the content.
- **Data is material.** When the subject is data, the chart, table, or instrument is the art direction: built from page tokens, populated with real or labeled-assumption values.
- **One icon family** — one stroke-width token, one view-box grid, sizes tied to the type scale. A display or symbol exception is open where the direction names it.
- Decoration carrying no job is replaced up the ladder in `implementation.md`, not deleted.

## Whole-page visual logic

The focal point leads, and supporting regions carry real art direction rather than generic backing: the same material grammar at lower intensity, their own content job, and a subject mapping that survives covering the focal element.

When a tell from `visual-critique.md` removes a default: every removed default needs replacement parity: the content keeps or gains hierarchy, specificity, atmosphere, relationship clarity, or interaction feedback — deletion alone never passes. A replacement chosen for being the known non-default is still a default: every replacement traces to Phase 1 evidence, not to this list's negation.

## Judgment

- A human selection of a rendered variant outranks this file's defaults and the skill's own preference.
- Explicit brand and brief colors outrank derived defaults, subject to the contrast floor.
- Verified contrast outranks visual similarity to the seed palette.
- Existing project tokens, assets, and conventions outrank a parallel system; extend them by role.
- Content coverage and the contrast floor outrank every atmospheric ambition.
- An approved durable decision in DESIGN.md outranks a new direction; changing one requires asking first.
