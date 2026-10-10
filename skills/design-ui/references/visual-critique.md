# Visual Critique

Judge the rendered pixels before re-reading the code that produced them. The enemy is the code review that rationalizes the pixels it just explained, since the stylesheet always argues the page is what it intended. The overcorrection is a critique rejecting a working design for novelty's sake.

## Contents

- [Order](#order)
- [The rubric](#the-rubric)
- [Diagnostics](#diagnostics)
- [Unsupported-pattern test](#unsupported-pattern-test)
- [Structural tells](#structural-tells)
- [Slop tropes](#slop-tropes)
- [The fault contract](#the-fault-contract)
- [Two whole-page tests](#two-whole-page-tests)
- [Craft sweep, against the render](#craft-sweep-against-the-render)
- [Read every heading and button aloud](#read-every-heading-and-button-aloud)
- [Hard floor](#hard-floor)
- [Judgment](#judgment)

## Order

- Renders first: answer the rubric from the images alone.
- Stylesheet → open only after, only to find the repairing edit.
- Finding writable without looking at a render = code review, not critique.

## The rubric

Answer all ten from the renders, in your own reasoning, not in faults.md: that file carries faults, never rubric answers.

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

Read `$RUN/critic-evidence.json`'s `renderDelta` (baseline-to-post-build delta the session already computed) as evidence of the gap between intended direction and emitted page: background and border-radius spread, image area, quiet-region candidates.

- More gradients, radii, or images is not intrinsically better.
- Brief names flat, monotone, empty, or boring and every relevant measured dimension is unchanged or moves toward uniformity → redesign failed; return to Direction.
- Never add hue, texture, or decoration only to move a number.
- Quiet-region candidate → fault only through contradiction with `contract-selected.json`, a baseline-to-post-build regression without a newly named job, or this critique's own compositional judgment; never through detector thresholds alone.

## Unsupported-pattern test

A cliché list alone convicts nothing; the slop tropes in the `build-pass` reference are defaults awaiting provenance, not bans. Rendered pattern = finding when any one holds:

- No direction-contract field requires it.
- No content relationship or mood explains it.
- It is a theme, metaphor or prop drawn from the subject the user did not ask for.
- The same anatomy serves unrelated content relationships.
- It is the only source of atmosphere or hierarchy.
- Removing it leaves the page's hierarchy and finish unchanged.

Repair → change the contract or the affected relationship, not substitute another known decorative pattern.

## Structural tells

Findings the render can prove without taste:

- One surface anatomy repeated across unrelated content types.
- Uniform spacing where nothing groups.
- Flat hierarchy: adjacent type steps under a 1.25 ratio, or headings merely bold body.
- Single family whose display and body are separated by neither 200 weight units nor a width axis.
- A face with no chosen, repository, or brief provenance.
- Emoji doing icon duty and mixed icon families (`scripts/check-ui.mjs` reports both).
- Placeholder boxes where imagery was promised.
- Numbered markers on content that is no sequence.

When a tell removes a default, replacement parity applies (the `visual-direction` reference): deletion alone never passes.

## Slop tropes

Judge each rendered trope against the `build-pass` reference's `## Slop tropes`, the one list.

Source misses these forms of the nine source-read tropes; judge them in the render:

- `nested-card` → a surface inside a surface that no card-named class or component marks.
- `uppercase-kicker` → a small caps label over a heading, set by a stylesheet rule or text-transform.
- `icon-tile-heading` → a rounded icon tile built from a background image, a pseudo-element or a component.
- `identical-card-row` → equal-looking cards with different class strings, or a row a component or loop renders.
- `numbered-marker` → 01, 02, 03 markers written in the stylesheet, as counters or pseudo-elements.
- `italic-accent-heading` → one heading word in a different style through a stylesheet rule or a component.
- `pulsing-dot` → a pulsing dot drawn by a pseudo-element or a component.
- `filler-word` → filler copy fed from data, a translation file or a CMS.
- `em-dash-copy` → em dashes in copy fed from data, a translation file or a CMS.

## The fault contract

- Fault with no `Target:` line → dropped.
- Redesign → three or four faults; new piece → one. Each five lines, in this order:

```text
Region: tide-table footnotes
Defect: the footnote column runs flush to the viewport edge at 390px, so its first letters clip.
Evidence: the post-build render at 390px; check-ui content-clipped
Target: src/styles/tide-table.css, .tide-footnotes { padding-inline }
Repair: raise padding-inline from 0 to the page gutter token.
```

- Comp given → each region of `$RUN/comp.md` whose post-build render drifts from the comp render at the same width is one fault whose `Defect:` opens `drifts from comp:`.
- Drift faults come first and sit outside the three-or-four count.

Set covers at least one content or relationship fault (missing content, broken relationship) and at least one craft fault (absent atmosphere, motion below the bar, untransitioned states, unthemed browser finish).

"Looks polished or premium" is not a finding.

Fix them, render again. Redesign → also remove one accessory with no content job and strengthen one relationship held in only one region; revert either change if it hides an action, state, claim, or its evidence.

## Two whole-page tests

- Cover the focal element. Full or bounded redesign → three or more supporting subject decisions and every supporting region's content job remain; new piece → every subject decision it carries stays visible.
- Finish test: every region reads polished, modern and cleanly finished in the mood, free of an unrequested subject theme or prop?

## Craft sweep, against the render

- [ ] Designed ground visible at 390px and 1440px, texture perceptible where intended and not competing with content?
- [ ] Every browser surface the implementation presents themed, per the finish list in the `implementation` reference?
- [ ] Two atmosphere layers doing the same job?

## Read every heading and button aloud

- **Em dashes.** Any em dash in interface copy → rewrite with comma, colon, or period.
- **Inflated verbs and adjectives:** leverage, seamless, unlock, elevate, robust, empower, effortless, transform, streamline, cutting-edge, supercharge, world-class, unleash, next-generation, revolutionize, game-changing, or "at scale" when nothing scales. Replace each with the concrete fact it stands in for.
- **Staged reversal:** "This isn't a tool. It's a teammate." Once = figure of speech; as the page's habit = filler.
- **Reflexive triplets:** "Fast. Simple. Powerful." Keep only when each word names a different observable behavior.
- **Rhetorical-question openers** and **audience hedging** ("Whether you're a startup or an enterprise…").

Test for every line, headlines and buttons included: does it contain a fact?

## Hard floor

Defects, not styles, unlike the tells. Brief demands one → flag the accessibility cost before complying; never ship one silently:

- [ ] Body-text contrast below WCAG AA **4.5:1**.
- [ ] Body text below **14px**.
- [ ] Body line-height below **1.5**.
- [ ] Justified text without hyphenation enabled.

Read `$RUN/critic-evidence.json`'s `blocking`, `clipped` and `overlap` findings (the session's `scripts/check-ui.mjs` output for this stage) for code tells and computed contrast, target-size, overflow, and focus checks. Read each finding's `confidence` field before reporting it as definite.

## Judgment

- Brief choice breaks the hard floor → accessibility cost still disclosed.
- Polish in the chosen mood outranks novelty, and content preservation outranks deleting a flagged container.
- A rendered finding outranks a code-read suspicion; a measured number outranks both.
- One fault may name the direction itself; repair then = return to direction, not another polish pass.
