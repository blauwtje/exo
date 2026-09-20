---
name: designing
description: "Use when a page, component, or visual axis changes: typography, color, spacing, motion, copy. Fires on a new visual surface, a redesign, or a surface called empty, boring, or generic. When a new visual surface does not name its displayed data, settings, or behavior, shaping decides those first; designing follows for presentation. Not for typo-only copy fixes or behavior with no visual effect."
argument-hint: <page, component or visual change>
effort: high
---

# Visual Design

Design so the result cannot be mistaken for a template: every visual choice traceable to the subject, audience, or page job, plus one evidence-backed differentiator a competitor could not justify. The enemy is the transferable default — a design that could accept another product name unchanged. The overcorrection is novelty that obscures content, removes states, or breaks accessibility.

A full or bounded redesign fails when the rendered result stays materially interchangeable with the baseline, when supporting regions stay generic while one focal point carries the design, or when a large empty area has no content, grouping, pacing, or staging job. Technical correctness never compensates for an underdesigned result. Do not default an open axis — composition, type, chromatic hierarchy, surface treatment, imagery, motion — to absence: restraint on one axis needs a brief-side reason and expression on the others.

## Size the request

**Which entry.** This skill owns the turn for a visual change at any file count, because Build dispatches its own builders. Two facts move the entry and size is not one: a surface whose displayed data, settings or behavior is not yet decided goes to `shaping` first, and this skill follows for presentation; a change that also adds non-visual behavior, meaning state, persistence, a new dependency or a network call, is owned by `implementing-batch`, which borrows this skill for the look.

- **Sketch:** a demo, prototype, or mock the request names as one: state the three Phase 1 facts and one direction in one line each, build in this session, take the piece path's post-build pair and `scripts/check-ui.mjs` run, repair what they show, and stop; no variants, agents, or reviewer, and the floor holds.
- **Full or bounded redesign:** a new page/view/identity; a request changing at least three of composition, palette, type, motion, and content hierarchy; or a report that an existing surface is empty, boring, generic, flat, unfinished, or not distinctive. Run all five phases, bounded to the named surface; the existing direction is evidence, not a veto.
- **New piece:** a section, component, or view inheriting the existing direction. With the settled identity rung 5 of `## Route` names, take the piece path: read that evidence and the Phase 1 `scripts/context.mjs` call, load `references/implementation.md` whole and, as sections, `## Adopt before authoring` and `## The state row` from `references/component-system.md` and `## Tactile hierarchy` and `## Labels` from `references/controls.md`, with `## Anatomy of the composite controls` for a composite control, build in this session, take one post-build pair with `scripts/capture.mjs` and one `scripts/check-ui.mjs` run, repair what they show, and stop; no baseline, inventory, comps, reviewer, or `scripts/inspect-render.mjs`. Without it, extract existing tokens and patterns, run every phase without variants against what the piece carries, and record one local motion decision before Build. A piece that changes the page's hierarchy is a bounded redesign, not a piece.
- **Tweak:** one element or named visual property changes and no region is added. Change it, audit the touched surface, verify the floor, and stop; never expand a tweak into a redesign.

## Route

The route decides how the direction is reached; `## Size the request` decides how much is built. Resolve the surface first from the markup and style files in the working-tree diff, then from the last touched one; with neither, ask which surface and nothing else, listing the surfaces its markup and style files name with the most recently changed first, because a request without a surface has nothing to route. Then stop at the first rung that matches, because comps earn their cost only where a chooser recognises a direction they cannot name:

1. **Tweak:** the tweak path.
2. **Handed a direction:** a plan's `Contract:` or a brief's `contract-selected.json` resumes at Build (Phase 3).
3. **Asked to choose:** the user asks to see or choose between directions, or the brief's `## Visual direction` names the user as the one who chooses between rendered directions: the offer in `## Asking` of `references/intake.md`.
4. **Sketch:** the sketch path.
5. **Settled identity:** docs/design/DESIGN.md with a `scripts/context.mjs` status other than `absent`, docs/design/direction.json, a `contract-selected.json` under a run directory named for this repository, or a stylesheet, theme config or DTCG file that names both color and type values and has changed in at least one commit after the commit that added it, while neither the user nor the brief lets that identity be replaced: one direction in text and no offer. A component library in the manifest is not that evidence on its own, because its defaults are the template this skill exists to replace.
6. **Tool surface:** an open identity on an app view, dashboard, admin or settings page, form, documentation page, internal tool, or component: one direction in text from Phase 1 evidence and the nearest sibling surface where one exists, and no offer, because scanability and existing expectations outrank expression there.
7. **Expression surface:** an open identity on a landing, marketing, pricing, portfolio, or launch page, whose job is a first impression on someone who has not adopted the product: the offer in `## Asking` of `references/intake.md`.

A surface neither list names takes rung 6 and the report names rung 7 as the rival reading, because the user can still ask for directions while a picker's spent minutes stay spent. A vague complaint routes the same way: it sizes the request, and the evidence picks the rung. A user who leaves the look to this skill has not asked for text: rung 7 still offers.

## The loop

Context; direction; build; critique the render; check.

## Intake

Read `references/intake.md` before Phase 1: the rule for when a question is asked at all, the run directory every render and log is written under as `$RUN`, and the table from a complaint's own words to the reference that owns the fault.

## References

Load a reference only at its row's phase and predicate; never the set up front. A row whose condition the surface does not meet stays unread. A run freezes the selection and starts Build in the turn the direction's click or exit 3 arrives, because the checked contracts are already on disk and builders return reports of at most 20 lines; after a compaction, Build reopens from `$RUN/contract-selected.json`. Phase 5 rows load in the QA pass as sections, `grep -n '^## '` finding the heading and `sed -n` reading to the next one, so the build turn carries only what its edits need. Phase 3 rows are read by the surface builder, never by this session, except `references/phase-build.md`, which decides who builds.

| File | Read it when |
|---|---|
| `references/intake.md` | Before Phase 1, for the asking rule, the run directory, and the symptom-to-reference table. |
| `references/phase-detail.md` | At Phase 1 for the context rules, before the first Build edit for the floor, before the critique dispatch, and at Phase 5 for the sweep. |
| `builder-prompt.md` | Phase 3, before every build dispatch. |
| `references/phase-direction.md` | Phase 2, before deciding the direction. |
| `references/phase-build.md` | Phase 3, before the first edit or builder dispatch. |
| `references/phase-critique.md` | Before the first edit of a full or bounded redesign, for the baseline pair; Phase 4 before the post-build dispatch. |
| `references/visual-direction.md` | Phase 2 for every direction decision; Phase 1 when the repository or docs/design/DESIGN.md holds a design system to extract. |
| `references/sketch-tab.md` | Phase 2 on rungs 3 and 7, after `--check` reports ok and before the offer; on any other path, before the first visual choice the user asked to see. |
| `references/direction-preview.md` | Phase 2, only when the user asks to see a direction whole, before building the comps the picker shows. |
| `references/composition.md` | Phase 1 for the content inventory; Phase 2 for structure; Phase 3 for layout. |
| `references/typography.md` | Phases 2–3 only when choosing or changing type. |
| `references/controls.md` | Phase 3 before styling a button, field, menu, toggle, tab, or filter. |
| `references/implementation.md` | Phase 3 before writing CSS or component code. |
| `references/motion.md` | Phase 3 for the recorded motion decision, and before any animation at every size. |
| `references/interaction-qa.md` | Phase 3 when the surface has controls, flows, disclosure, or reachable states; Phase 5 its `## Pre-ship interaction sweep` section alone. |
| `references/feedback-and-status.md` | Phase 3 only when the surface waits on the network, applies a change before its response arrives, or reports status outside the region that changed; Phase 5 its `## Sweep` section alone. |
| `references/visual-critique.md` | Phase 4, read by the `exo:design-critic` agent; this session reads its faults.md. |
| `references/craft-recipes.md` | Phase 3 after `contract-selected.json` exists, before the first CSS of a ground, surface, motion, or type treatment. |
| `references/component-system.md` | Phase 1 only when the repository ships a component layer, its `## Adopt before authoring` section alone; Phase 3 before building a control, field, or surface the design repeats. |
| `references/tokens.md` | Phase 2 only past the role tokens `references/implementation.md` lists: a token pipeline or DTCG file in the repository, a second theme or brand, or a ramp generated against target contrast. |
| `references/icons-and-imagery.md` | Phase 3 only when the build draws or extends an icon set, places a raster or a chart, or the inventory names imagery. |
| `references/accessibility.md` | Phase 3 only before a composite widget from `references/component-system.md`; Phase 5 its `## Sweep` section alone. |
| `references/performance-budget.md` | Phase 3 only when the build adds a hero raster, a font the repository does not load, or a persistent effect; Phase 5 its `## Outcome thresholds` and `## Hard failures` sections alone. |
| `references/internationalization.md` | Phase 1 when the product ships more than one language, the repository carries translation machinery, or the audience reads a right-to-left or non-Latin script. |

## Phase 1 — Context

State three facts, defaulting absent ones: product in one sentence; audience and what they know on arrival; the page's single action or belief. Read `references/phase-detail.md`, its `## Context`, before collecting anything: the durable-context call, the baseline record a bounded redesign starts from, the discovery dispatch, and the observation mapping. Keep a list of every repository path and line range this phase read; Build hands it to each builder as `FILES`.

## Phase 2 — Direction

Decide the direction in this session, before any production code changes, under `references/phase-direction.md`: the contract, variants, offer, sketch tab and freeze for an open identity, and the single direction every other case produces.

## Phase 3 — Build

Read `references/phase-build.md` before the first edit or builder dispatch: where the surface builds, how builders are briefed, and what binds them. Read `references/phase-detail.md`, its `## The build floor`, in the same breath: the accessibility, reflow, motion and performance floor no build goes under, and the underdesign floor checked before the critique.

## Phase 4 — Visual critique

A full or bounded redesign renders at three checkpoints under the render budget in `references/phase-critique.md`: read it before the baseline capture, which comes before the first edit. The four calls this session makes, the agent it dispatches and the fault contract the critic meets are in `references/phase-detail.md`, its `## The critique dispatch`.

## Phase 5 — QA

Run the sweep in `references/phase-detail.md`, its `## QA`: the clipped-and-overlap repairs, the interaction and accessibility passes, the render checkpoints a redesign is complete only with, and what to report when there is no render path.

## Judgment

- Explicit brief requirements outrank every design default and tell list.
- A human selection of a rendered variant outranks this skill's own preference.
- An approved durable design decision outranks a new direction; changing one requires asking first.
- Repository framework, naming, file-layout, and component conventions outrank this skill's code defaults; they do not preserve the visual anatomy the user asked to replace.
- Scope restraint limits which surfaces and files change; it never requires the smallest visual delta inside them.
- Accessibility and complete content/state coverage outrank visual novelty.
- A brief asking for showy motion or effects raises the ambition ceiling: tells and timing caps become defaults to exceed deliberately; contrast, reduced-motion, and state coverage still hold.
- A planning turn or a `shaping` brief records the selected direction under `## Visual direction`, a plan as `Contract: docs/design/direction.json`; a plan or brief carrying one copies that contract to `$RUN/contract-selected.json`, resumes at Build (Phase 3), and repeats neither Phase 1-2 nor the variant choice.
- This skill owns visual decisions only. When a `shaping`, `planning`, `implementing-batch`, or `debug` stage called it, return control for product decisions, ordering, wiring, persistence, validation, proof, and reporting. When no stage called it, execute the visual-only request and report directly.
- After a compaction notice, resume from the files, not the conversation: the newest run directory (`ls -dt /private/tmp/designing/*/ | head -1`) holds `contract-selected.json` for the direction, `renders/` for the checkpoints reached, and the build and fault reports; docs/design/DESIGN.md fixes the durable decisions.
