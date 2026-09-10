# Visual Critique

Judge the rendered pixels before re-reading the code that produced them. The enemy is the code review that rationalizes the pixels it just explained — the stylesheet always argues that the page is what it intended. The overcorrection is a critique that rejects a working design for novelty's sake.

## Order

Read the renders and answer the rubric first, from the images alone. Only then open the stylesheet, and only to find the repairing edit. A finding that could have been written without looking at a render is a code review, not a critique.

## The rubric

Answer all ten from the renders:

1. What makes this look assembled rather than art-directed?
2. Where does one visual grammar repeat past usefulness?
3. Which control looks most like a framework default?
4. Is the perceived palette richer than neutral plus one accent?
5. Does imagery or artifact material do enough work, or is it filling space?
6. Does the background participate in the composition, or is it merely behind it?
7. Which region could be swapped into a neighbouring product unchanged?
8. What is the single highest-value pixel-level change?
9. Does mobile have its own visual pacing, or is it the desktop layout narrowed?
10. Is another direction required rather than another polish pass?

## Diagnostics

Run `scripts/inspect-styles.mjs` against the rendered page and read its output as evidence of the gap between the intended direction and what was emitted: font families actually used, background and border-radius spread, box-shadow patterns, button and input variants, gradient and backdrop-filter counts, image area. These numbers are diagnostics, never scores; more gradients, radii, or images is not intrinsically better. A single button variant on a page with three action tiers is a finding; so is nine variants where the direction named two.

Run `scripts/inspect-render.mjs` over the baseline and final captures. Metrics describe the delta, never define beauty: when the brief names flat, monotone, empty, or boring and every relevant measured dimension is unchanged or moves toward uniformity, the redesign failed and returns to Direction; never add hue, texture, or decoration only to move a number. A quiet-region candidate becomes a fault only through contradiction with `contract-selected.json`, a baseline-to-final regression without a newly named job, or this critique's own compositional judgment — never through the detector's thresholds alone.

## Unsupported-pattern test

A cliché list alone convicts nothing, and the slop tropes below are defaults awaiting provenance, not bans. A rendered pattern is a finding when no direction-contract field requires it, no subject mapping explains it, the same anatomy serves unrelated content relationships, it is the only source of atmosphere or hierarchy, or removing it leaves the page's subject fit unchanged. Repair by changing the contract or the affected relationship, not by substituting another known decorative pattern.

## Structural tells

Findings the render can prove without taste: one surface anatomy repeated across unrelated content types; uniform spacing where nothing groups; flat hierarchy — adjacent type steps under a 1.25 ratio, or headings that are merely bold body; a single family whose display and body are separated by neither 200 weight units nor a width axis; a face with no candidate, repository, or brief provenance; emoji doing icon duty and mixed icon families (`scripts/check-ui.mjs` reports both); placeholder boxes where imagery was promised; numbered markers on content that is not a sequence.

When a tell removes a default, replacement parity applies (`visual-direction.md`): deletion alone never passes.

## Slop tropes

Defaults that read as machine-made. Each stays only when a contract field or the brief's own words earn it, with that provenance recorded; `scripts/check-ui.mjs` reports the code-detectable ones as `overused-font`, `uniform-card-shadow`, `radial-halo`, `thin-border-wide-shadow`, `left-accent-card`, `gradient-text`, `transition-all`, `emoji-in-markup`, `aggressive-gradient-ground`, and `kicker-above-heading`. Aggressive gradient grounds: a hue swing across the page, a saturated centered halo or glow, a gradient wash as decoration. Emoji outside an explicit brand use; a labelled placeholder beats an emoji icon. The rounded container with a left accent border, nested cards, and one grey shadow under every card. Imagery drawn in SVG to fill a region; use a labelled placeholder and ask for the real material. An overused family (Inter, Roboto, Arial, Fraunces, a system stack) as the display face. An eyebrow or kicker above a heading, gradient-filled text, an arrow glyph on a button, monospace as a costume for "technical". The cream-serif-terracotta kit, the near-black-with-acid-accent kit, and a hairline border under a wide soft shadow.

## The fault contract

A redesign finds at least three faults against the brief, a content obligation, the quality floor, a mapped relationship, or repository convention: at least one naming missing content, a broken relationship, or a missing subject mapping, and at least one craft fault — absent atmosphere, an unbuilt signature moment, untransitioned states, unthemed browser finish. A new piece finds and repairs at least one rendered fault, rendering its affected widths before and after. Each fault names its region, the observed pattern, the missing evidence, the job the region currently performs, the exact repairing edit, and how the final render will show the repair; "looks polished or premium" is not a finding.

Fix them and render again. A redesign also removes one accessory with no content job and strengthens one relationship held in only one region, reverting either change if it hides an action, state, claim, or its evidence.

## Two whole-page tests

- Cover the focal element. Full or bounded redesign: three or more supporting subject decisions and every supporting region's content job remain; new piece: every subject decision it carries stays visible.
- The substitution test: swap in a competitor's name and subject. Does the design resist, or fit them just as well?

## Craft sweep, against the render

- [ ] Is the designed ground visible at both 390px and 1440px, with any texture perceptible where intended, not competing with content, and body-text contrast held on top of it?
- [ ] Is every browser surface the implementation presents themed, down the finish list in `implementation.md`?
- [ ] Are two atmosphere layers doing the same job?

## Read every heading and button aloud

Machine-written copy has a cadence as recognizable as machine design:

- **Em dashes.** Any em dash in interface copy: rewrite with a comma, colon, or period.
- **The inflation lexicon:** streamline, empower, supercharge, world-class, seamless, effortless, unleash, elevate, revolutionize, "at scale" (unless literally about scaling). Replace each with the specific fact it was inflating.
- **Manufactured contrast:** "It's not just X — it's Y." One instance is rhetoric; as a house style it is autocomplete.
- **Reflexive triplets:** "Fast. Simple. Powerful." Keep only when each word names a different observable behavior.
- **Rhetorical-question openers** and **audience hedging** ("Whether you're a startup or an enterprise…").

The test for every line, headlines and buttons included: does it contain a fact?

## Hard floor

Unlike the tells these are defects, not styles. If a brief demands one, flag the accessibility cost before complying; never ship one silently:

- [ ] Body-text contrast below WCAG AA **4.5:1**.
- [ ] Body text below **14px**.
- [ ] Body line-height below **1.5**.
- [ ] Justified text without hyphenation enabled.

Run `scripts/check-ui.mjs` for the code tells and the computed contrast, target-size, overflow, and focus checks; read its `confidence` field before reporting a finding as definite.

## Judgment

- Explicit brief choices outrank the tell list; the hard floor still requires the accessibility cost to be disclosed.
- Subject evidence outranks familiarity, and content preservation outranks deleting a flagged container.
- A rendered finding outranks a code-read suspicion; a measured number outranks both.
- One fault may name the direction itself; the repair is then a return to direction, not another polish pass.
