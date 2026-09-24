# Visual Critique

Judge the rendered pixels before re-reading the code that produced them. The enemy is the code review that rationalizes the pixels it just explained — the stylesheet always argues that the page is what it intended. The overcorrection is a critique that rejects a working design for novelty's sake.

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

Read the renders and answer the rubric first, from the images alone. Only then open the stylesheet, and only to find the repairing edit. A finding that could have been written without looking at a render is a code review, not a critique.

## The rubric

Answer all ten from the renders, in your own reasoning and not in faults.md: that file carries faults, never the rubric's answers.

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

Read `$RUN/critic-evidence.json`'s `renderDelta`, the baseline-to-post-build delta the session already computed, as evidence of the gap between the intended direction and what was emitted: background and border-radius spread, image area, quiet-region candidates. These numbers are diagnostics, never scores; more gradients, radii, or images is not intrinsically better. Metrics describe the delta, never define beauty: when the brief names flat, monotone, empty, or boring and every relevant measured dimension is unchanged or moves toward uniformity, the redesign failed and returns to Direction; never add hue, texture, or decoration only to move a number. A quiet-region candidate becomes a fault only through contradiction with `contract-selected.json`, a baseline-to-post-build regression without a newly named job, or this critique's own compositional judgment — never through the detector's thresholds alone.

## Unsupported-pattern test

A cliché list alone convicts nothing, and the slop tropes below are defaults awaiting provenance, not bans. A rendered pattern is a finding when no direction-contract field requires it, no subject mapping explains it, the same anatomy serves unrelated content relationships, it is the only source of atmosphere or hierarchy, or removing it leaves the page's subject fit unchanged. Repair by changing the contract or the affected relationship, not by substituting another known decorative pattern.

## Structural tells

Findings the render can prove without taste: one surface anatomy repeated across unrelated content types; uniform spacing where nothing groups; flat hierarchy — adjacent type steps under a 1.25 ratio, or headings that are merely bold body; a single family whose display and body are separated by neither 200 weight units nor a width axis; a face with no candidate, repository, or brief provenance; emoji doing icon duty and mixed icon families (`scripts/check-ui.mjs` reports both); placeholder boxes where imagery was promised; numbered markers on content that is not a sequence.

When a tell removes a default, replacement parity applies (the `visual-direction` reference): deletion alone never passes.

## Slop tropes

These defaults make a page look generated. One stays only when a contract field or the wording of the brief justifies it and that justification is recorded; `scripts/check-ui.mjs` reports the code-detectable ones as `overused-font`, `uniform-card-shadow`, `radial-halo`, `thin-border-wide-shadow`, `edge-accent-card`, `gradient-text`, `transition-all`, `emoji-in-markup`, `aggressive-gradient-ground`, `kicker-above-heading`, `purple-palette`, `neon-on-dark`, `cream-ground`, `tinted-glow`, `pill-button`, `bounce-easing`, `card-entrance`, `monospace-label`, and `invented-content`.

- Grounds: a gradient whose hue swings across the page, a saturated halo or glow in the middle, a gradient wash used as decoration.
- Icons and imagery: emoji outside a stated brand use, and SVG drawings invented to fill a region; a labelled placeholder does better in both cases, with a request for the real material.
- Containers: a rounded box with a colored left border, cards inside cards, the same grey shadow under every card, and a thin border beneath a broad soft shadow.
- Type: a display face from `scripts/overused-fonts.mjs`, such as Inter, Roboto or Montserrat, or a system stack; a small label above a heading; gradient-filled text; monospace worn to look technical.
- Kits: cream with a serif and terracotta, and near-black with one acid accent.
- Buttons: an arrow glyph added to the label.

## The fault contract

A redesign returns three or four faults, a new piece one, each five lines in the order this invented fault shows:

```text
Region: tide-table footnotes
Defect: the footnote column runs flush to the viewport edge at 390px, so its first letters clip.
Evidence: the post-build render at 390px; check-ui content-clipped
Target: src/styles/tide-table.css, .tide-footnotes { padding-inline }
Repair: raise padding-inline from 0 to the page gutter token.
```

A fault with no `Target:` line is dropped, because a fault the repairer has to locate costs more to apply than it saves. The set covers at least one content or relationship fault, missing content, a broken relationship, or a missing subject mapping, and at least one craft fault, absent atmosphere, an unbuilt signature moment, untransitioned states, or an unthemed browser finish. "Looks polished or premium" is not a finding.

Fix them and render again. A redesign also removes one accessory with no content job and strengthens one relationship held in only one region, reverting either change if it hides an action, state, claim, or its evidence.

## Two whole-page tests

- Cover the focal element. Full or bounded redesign: three or more supporting subject decisions and every supporting region's content job remain; new piece: every subject decision it carries stays visible.
- The substitution test: swap in a competitor's name and subject. Does the design resist, or fit them just as well?

## Craft sweep, against the render

- [ ] Is the designed ground visible at both 390px and 1440px, with any texture perceptible where intended, not competing with content, and body-text contrast held on top of it?
- [ ] Is every browser surface the implementation presents themed, down the finish list in the `implementation` reference?
- [ ] Are two atmosphere layers doing the same job?

## Read every heading and button aloud

Machine-written copy has a cadence as recognizable as machine design:

- **Em dashes.** Any em dash in interface copy: rewrite with a comma, colon, or period.
- **Inflated verbs and adjectives:** leverage, seamless, unlock, elevate, robust, empower, effortless, transform, streamline, cutting-edge, supercharge, world-class, unleash, next-generation, revolutionize, game-changing, or "at scale" when nothing scales. Replace each with the concrete fact it stands in for.
- **Staged reversal:** "This isn't a tool. It's a teammate." Once is a figure of speech; as the page's habit it is filler.
- **Reflexive triplets:** "Fast. Simple. Powerful." Keep only when each word names a different observable behavior.
- **Rhetorical-question openers** and **audience hedging** ("Whether you're a startup or an enterprise…").

The test for every line, headlines and buttons included: does it contain a fact?

## Hard floor

Unlike the tells these are defects, not styles. If a brief demands one, flag the accessibility cost before complying; never ship one silently:

- [ ] Body-text contrast below WCAG AA **4.5:1**.
- [ ] Body text below **14px**.
- [ ] Body line-height below **1.5**.
- [ ] Justified text without hyphenation enabled.

Read `$RUN/critic-evidence.json`'s `blocking`, `clipped` and `overlap` findings, the session's `scripts/check-ui.mjs` output for this stage, for the code tells and the computed contrast, target-size, overflow, and focus checks; read each finding's `confidence` field before reporting it as definite.

## Judgment

- Explicit brief choices outrank the tell list; the hard floor still requires the accessibility cost to be disclosed.
- Subject evidence outranks familiarity, and content preservation outranks deleting a flagged container.
- A rendered finding outranks a code-read suspicion; a measured number outranks both.
- One fault may name the direction itself; the repair is then a return to direction, not another polish pass.
