# Visual Direction

Decide the direction from references, render it, and select it before production code changes. The enemy is the direction chosen as prose and never seen: adjectives standing in for a rendered page. The overcorrection is forcing variants onto a task whose direction is already settled.

## Contents

- [Design context first](#design-context-first)
- [Palette](#palette)
- [Reference, variant, selection](#reference-variant-selection)
- [Direction contract](#direction-contract)
- [Dials](#dials)
- [Material, depth, and atmosphere](#material-depth-and-atmosphere)
- [Visual material and imagery](#visual-material-and-imagery)
- [Whole-page visual logic](#whole-page-visual-logic)
- [Judgment](#judgment)

## Design context first

- Read the `approval_status` field `scripts/context.mjs --status` reports before asking whether a DESIGN.md decision is approved; open the body, through `--surface` and `--needs`, only for the sections the task needs.
- Existing design system in code → extract it before proposing a replacement.
- DESIGN.md → create or update only after explicit user approval of a durable visual identity or an approved redesign. Completed implementation is not approval.
- Approved dials → record them as one dials line under `## Principles and visual direction` in DESIGN.md, only after that approval. A dials line there outranks the product-kind table.
- `reference`, `display-font`, `body-font` or `accent` field written through `reference.mjs` → no approval needed, because `reference` records only the product the user named and the color and font line sent before the build approves the rest.
- Unapproved directions and experiments → ephemeral.
- No DESIGN.md for one-off prototypes, isolated fixes, or pages establishing no durable identity.
- Page-specific approved deviation → `docs/design/surfaces/<surface>.md`, delta only.
- Implementation details and generated CSS values → stay in code; anti-references and rejected defaults persist only where durable.
- Decision conflicts with current tokens, components, or approved screenshots → flag it.

## Palette

Name tokens by role, never by hue: `--accent`, not `--orange`. Derivation mechanics live in the `implementation` reference; this file decides.

- **Topology is a named choice**, no default: one ramp mixed from two anchors; several named ramps; or a regionally chromatic surface. Every ramp deliberately anchored.
- **Commitment is a named level**, no default, no escalation trajectory: *restrained* = accent at focal point and named signals only; *committed* = one saturated color carries a named set of whole regions; *drenched* = surface is the color. Committed and drenched → recut neutrals against the new ground, re-verify every pairing.
- **State colors are natives, not imports.** Keep the hue convention (reddish destructive, greenish fine), recut inside the band (danger ≈ 20–35, warning ≈ 70–95, success ≈ 140–160 in oklch) at the accent's lightness and chroma. Add a state color only for a state the interface can enter.
- **Neutrals carry the direction.** Hue-trace ground and ink at chroma 0.005–0.03 from the accent's neighborhood; warm paper versus cool slate is a direction decision. Achromatic neutrals = named decision, recorded and contrast-verified like any other.
- **Dark scheme is a second design**, built only when the brief asks or the product already exposes one.
- Dark scheme → recompose, not invert: ground keeps the hue trace at L 0.14–0.22; `#000` never the default.
- On dark → raised surfaces gain lightness and lose chroma; accents, inks, and borders re-picked.
- On dark → hierarchy moves to borders and surface steps; shadow only where verified visible on the dark ground. Re-verify contrast on the dark side.

**Contrast by construction**: choose token lightness against explicit ratios before component styling.

- Body ink on ground: verify a ratio of at least 4.5:1.
- Name each accent use and its regional assignment in the contract.
- UI chrome and text at least 24px, or 18.66px and bold, require 3:1; all smaller text requires 4.5:1.
- One accent value misses either threshold → derive separate display and interactive values, same hue, different lightness.
- Muted ink is the usual casualty: "muted" never drops below AA.
- Evidence that a hue carries its claimed regions = the render's measured distribution, not the stylesheet.

## Reference, variant, selection

Open identity (none exists yet, or the brief lets it be replaced) → run this loop:

1. Inspect what exists first: repository assets, `docs/design/`, prior approved renders.
2. Extract relationships across composition, typography, chroma, geometry, imagery, material and light, and motion from evidence this session can open: content inventory, repository assets, `docs/design/`, prior approved renders.
   - Output = list of what to borrow and what to reject, not a style name.
   - Do not route the decision through a named style label.
   - Visual research capability available → a reference set widens the list, never replaces it.
   - Relationship neither evidence nor the chosen mood supports = invention; one the build keeps → name it as an assumption.

The `phase-direction` reference owns the rest: deal, check, sketch or compare, select.

Settled design system, local component inside one, or tweak → one direction, no variants, no selection gate. Never force variants there.

## Direction contract

- Every planned quiet region carries one named job from that enum, repaired with a vector, an edge relationship, a counterweight, or a scale cue, never decoration alone.
- Each variant of an open identity or consequential redesign fills a contract from `scripts/direction.mjs --plan`, in an axis space derived from Phase 1 evidence.
- Each value carries a machine-readable payload and its evidence; built-in vocabulary supplies shapes, not the option set.
- `--check` proves divergence, filled fields, and expectations, and names the allowed vocabulary of any field it rejects.
- `--select` prints the frozen contract; redirected into the run directory's `contract-selected.json`, it is what Build, the critique, and QA read.

## Dials

Density, variance and motion are integers from 1 to 10. Density 1 is airy and 10 packed; variance 1 is a template layout and 10 an unexpected composition; motion 1 is feedback only and 10 choreographed.

| Product kind | Density | Variance | Motion |
| --- | --- | --- | --- |
| Internal tool | 8 | 3 | 2 |
| B2B SaaS | 7 | 4 | 3 |
| Consumer app | 5 | 6 | 5 |
| Editorial | 4 | 7 | 4 |
| E-commerce | 6 | 5 | 4 |

- DESIGN.md holds a dials line → start the dials from it, not from the table.
- No DESIGN.md dials line and the product kind in the table → start the dials from its row.
- No DESIGN.md dials line and the product kind not listed → start from the nearest row and name that row.
- Evidence from Phase 1 or the brief moves a dial → move it and give one reason in the contract.

## Material, depth, and atmosphere

One coherent physical logic per direction: state light source and lighting model, then hold them. Deliberate material contrast between semantic regions is open where one logic explains both. Grammars are vocabulary, not one-per-page:

- **Flat + borders**: hierarchy from hairlines and surface steps.
- **Soft ambient light**: layered diffuse shadows, one light direction, tokened elevation.
- **Hard offset**: solid shadows and thick strokes, only when the user asks for neobrutalism; unasked it reads as a gamified template.
- **Layered translucency**: blur and glass, only over real changing content.

Ground and atmosphere:

- Background = designed surface, never an untouched default: deliberate solid ground, hue-traced ground, gradient field with a named light source, or a fine texture the mood calls for (grain, paper, graph grid, fabric).
- Atmosphere layers → judge by whether two do the same job, never by count.
- Texture → judge from the render, not a preset opacity: perceptible at 390px and 1440px where the contract names it, invisible where it does no job, body-text contrast still at the floor on top of it.
- Ambient movement → passes the job gate in the `motion` reference.
- Focal point may earn what a tell denies elsewhere (a glow, glass over its layered content, one gradient with named hue logic) when a named job backs it.

## Visual material and imagery

Inventory before invention: list what the repository and subject already own (assets, illustrations, icon set, fonts, tokens, real data). Owned assets → inspected first, not automatic winners; an unsuitable one may be replaced or reframed inside the redesign's scope.

- **Every image names one job**: evidence, instrument, identity, or mood tied to the direction. Region cannot name its image's job → loses the image, not the content.
- **Data is material.** Subject is data → chart, table, or instrument is the art direction: built from page tokens, populated with real or labeled-assumption values.
- Decoration carrying no job → replace up the ladder in the `implementation` reference, not delete.

## Whole-page visual logic

Focal point leads; supporting regions carry real art direction, not generic backing: same material grammar at lower intensity, own content job.

- Tell from the `visual-critique` reference removes a default → replacement parity: content keeps or gains hierarchy, specificity, atmosphere, relationship clarity, or interaction feedback; deletion alone never passes.
- Replacement chosen for being the known non-default is still a default → every replacement traces to Phase 1 evidence, not to this list's negation.

## Judgment

- Explicit brand and brief colors outrank derived defaults, subject to the contrast floor.
- Verified contrast outranks visual similarity to the seed palette.
- Existing project tokens, assets, and conventions outrank a parallel system; extend them by role.
- A DESIGN.md decision whose `approval_status` reads `approved` outranks a new direction.
